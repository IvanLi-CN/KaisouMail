import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
const { nowIso } = vi.hoisted(() => ({
  nowIso: vi.fn(() => "2026-04-08T12:00:00.000Z"),
}));
const { deleteSubdomainEmailRoutingDnsRecords, ensureSubdomainEnabled } =
  vi.hoisted(() => ({
    deleteSubdomainEmailRoutingDnsRecords: vi.fn(),
    ensureSubdomainEnabled: vi.fn(),
  }));

vi.mock("../db/client", () => ({
  getDb,
}));

vi.mock("../lib/crypto", async () => {
  const actual =
    await vi.importActual<typeof import("../lib/crypto")>("../lib/crypto");
  return {
    ...actual,
    nowIso,
  };
});

vi.mock("../services/emailRouting", async () => {
  const actual = await vi.importActual<
    typeof import("../services/emailRouting")
  >("../services/emailRouting");
  return {
    ...actual,
    deleteSubdomainEmailRoutingDnsRecords,
    ensureSubdomainEnabled,
  };
});

import { mailboxes, subdomains } from "../db/schema";
import { ApiError } from "../lib/errors";
import {
  listSubdomainsPendingCleanup,
  runSubdomainCleanup,
} from "../services/subdomain-cleanup";

const runtimeConfig = {
  APP_ENV: "development",
  DEFAULT_MAILBOX_TTL_MINUTES: 60,
  CLEANUP_BATCH_SIZE: 3,
  SUBDOMAIN_CLEANUP_BATCH_SIZE: 1,
  SUBDOMAIN_CLEANUP_REQUEST_BUDGET: 400,
  EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
  CLOUDFLARE_API_TOKEN: "cf-token",
  EMAIL_WORKER_NAME: "mail-worker",
  SESSION_SECRET: "super-secret-session-key",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
} as const;

const pendingRow = {
  id: "sub_ops",
  domainId: "dom_primary",
  name: "ops",
  enabledAt: "2026-04-08T10:00:00.000Z",
  lastUsedAt: "2026-04-08T11:00:00.000Z",
  cleanupNextAttemptAt: null,
  cleanupLastError: null,
  metadata: '{"mode":"live"}',
  rootDomain: "707979.xyz",
  zoneId: "zone_primary",
} as const;

const createDb = (liveReferenceSequence: boolean[]) => {
  const deleteWhere = vi.fn(
    async (_values?: Record<string, unknown>) => undefined,
  );
  const updateWhere = vi.fn(
    async (_values?: Record<string, unknown>) => undefined,
  );
  const liveReferenceRows = [...liveReferenceSequence];

  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => {
        if (table !== mailboxes) {
          throw new Error("Unexpected table");
        }

        return {
          where: vi.fn(() => ({
            limit: vi.fn(async () =>
              liveReferenceRows.shift() ? [{ id: "mbx_live" }] : [],
            ),
          })),
        };
      }),
    })),
    delete: vi.fn((table: unknown) => ({
      where: vi.fn(async () => {
        if (table === subdomains) {
          await deleteWhere();
        }
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          if (table === subdomains) {
            await updateWhere(values);
          }
        }),
      })),
    })),
    deleteWhere,
    updateWhere,
  };
};

describe("subdomain cleanup service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nowIso.mockReturnValue("2026-04-08T12:00:00.000Z");
    deleteSubdomainEmailRoutingDnsRecords.mockResolvedValue({
      matchedRecordCount: 4,
      requestCount: 5,
      completed: true,
    });
    ensureSubdomainEnabled.mockResolvedValue(undefined);
  });

  it("queries the oldest orphaned subdomains that are ready for cleanup", async () => {
    const all = vi.fn(async () => ({
      results: [pendingRow],
    }));
    const bind = vi.fn(() => ({ all }));
    const prepare = vi.fn(() => ({ bind }));

    await expect(
      listSubdomainsPendingCleanup(
        {
          DB: { prepare },
        } as never,
        runtimeConfig,
      ),
    ).resolves.toEqual([pendingRow]);

    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("NOT EXISTS"));
    expect(prepare).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY s.last_used_at ASC"),
    );
    expect(prepare).toHaveBeenCalledWith(
      expect.stringContaining("s.cleanup_next_attempt_at IS NOT NULL"),
    );
    expect(prepare).toHaveBeenCalledWith(
      expect.stringContaining("d.zone_id IS NOT NULL"),
    );
    expect(bind).toHaveBeenCalledWith("2026-04-08T12:00:00.000Z", 1);
  });

  it("honors the kill switch by skipping candidate selection entirely", async () => {
    const prepare = vi.fn();

    await expect(
      listSubdomainsPendingCleanup(
        {
          DB: { prepare },
        } as never,
        {
          ...runtimeConfig,
          SUBDOMAIN_CLEANUP_BATCH_SIZE: 0,
          SUBDOMAIN_CLEANUP_REQUEST_BUDGET: 400,
        },
      ),
    ).resolves.toEqual([]);

    expect(prepare).not.toHaveBeenCalled();
  });

  it("deletes the local subdomain row after Cloudflare cleanup succeeds", async () => {
    const db = createDb([false, false]);
    getDb.mockReturnValue(db);

    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({ results: [pendingRow] })),
      })),
    }));

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        runtimeConfig,
      ),
    ).resolves.toBe(1);

    expect(deleteSubdomainEmailRoutingDnsRecords).toHaveBeenCalledWith(
      expect.any(Object),
      runtimeConfig,
      {
        rootDomain: "707979.xyz",
        zoneId: "zone_primary",
      },
      "ops",
      {
        projectOperation: "subdomains.cleanup",
        projectRoute: "scheduled mailbox cleanup",
      },
      {
        requestBudget: 399,
      },
    );
    expect(db.delete).toHaveBeenCalledWith(subdomains);
    expect(db.update).not.toHaveBeenCalledWith(subdomains);
  });

  it("writes a one-hour backoff for non-429 failures and continues draining backlog", async () => {
    const db = createDb([false, false, false, false]);
    getDb.mockReturnValue(db);
    deleteSubdomainEmailRoutingDnsRecords
      .mockRejectedValueOnce(new Error("DNS unavailable"))
      .mockResolvedValueOnce({
        matchedRecordCount: 4,
        requestCount: 5,
        completed: true,
      });

    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({
          results: [
            pendingRow,
            {
              ...pendingRow,
              id: "sub_beta",
              name: "beta",
            },
          ],
        })),
      })),
    }));

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        {
          ...runtimeConfig,
          SUBDOMAIN_CLEANUP_BATCH_SIZE: 2,
          SUBDOMAIN_CLEANUP_REQUEST_BUDGET: 400,
        },
      ),
    ).resolves.toBe(1);

    expect(db.update).toHaveBeenCalledWith(subdomains);
    expect(db.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        cleanupNextAttemptAt: "2026-04-08T13:00:00.000Z",
        cleanupLastError: "DNS unavailable",
      }),
    );
    expect(db.delete).toHaveBeenCalledWith(subdomains);
  });

  it("stops the batch immediately when Cloudflare returns 429", async () => {
    const db = createDb([false]);
    getDb.mockReturnValue(db);
    deleteSubdomainEmailRoutingDnsRecords.mockRejectedValueOnce(
      new ApiError(429, "Cloudflare API rate limit reached; retry later"),
    );

    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({
          results: [
            pendingRow,
            {
              ...pendingRow,
              id: "sub_beta",
              name: "beta",
            },
          ],
        })),
      })),
    }));

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        {
          ...runtimeConfig,
          SUBDOMAIN_CLEANUP_BATCH_SIZE: 2,
          SUBDOMAIN_CLEANUP_REQUEST_BUDGET: 400,
        },
      ),
    ).rejects.toMatchObject({
      status: 429,
      message: "Cloudflare API rate limit reached; retry later",
    });

    expect(deleteSubdomainEmailRoutingDnsRecords).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalledWith(subdomains);
    expect(db.delete).not.toHaveBeenCalledWith(subdomains);
  });

  it("re-enables DNS instead of deleting the row when a mailbox reappears mid-cleanup", async () => {
    const db = createDb([false, true]);
    getDb.mockReturnValue(db);

    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({ results: [pendingRow] })),
      })),
    }));

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        runtimeConfig,
      ),
    ).resolves.toBe(0);

    expect(ensureSubdomainEnabled).toHaveBeenCalledWith(
      expect.any(Object),
      runtimeConfig,
      {
        rootDomain: "707979.xyz",
        zoneId: "zone_primary",
      },
      "ops",
      {
        projectOperation: "subdomains.cleanup",
        projectRoute: "scheduled mailbox cleanup",
      },
      {
        onRequestAttempted: expect.any(Function),
      },
    );
    expect(db.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        lastUsedAt: "2026-04-08T12:00:00.000Z",
        cleanupNextAttemptAt: null,
        cleanupLastError: null,
      }),
    );
    expect(db.delete).not.toHaveBeenCalledWith(subdomains);
  });

  it("stops after the configured Cloudflare request budget is exhausted", async () => {
    const db = createDb([false, false]);
    getDb.mockReturnValue(db);

    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({
          results: [
            pendingRow,
            {
              ...pendingRow,
              id: "sub_beta",
              name: "beta",
            },
          ],
        })),
      })),
    }));

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        {
          ...runtimeConfig,
          SUBDOMAIN_CLEANUP_BATCH_SIZE: 2,
          SUBDOMAIN_CLEANUP_REQUEST_BUDGET: 5,
        },
      ),
    ).resolves.toBe(1);

    expect(deleteSubdomainEmailRoutingDnsRecords).toHaveBeenCalledTimes(1);
  });

  it("re-enables DNS when a pending-cleanup subdomain is live again", async () => {
    const db = createDb([true]);
    getDb.mockReturnValue(db);

    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({
          results: [
            {
              ...pendingRow,
              cleanupNextAttemptAt: "2026-04-08T11:30:00.000Z",
              cleanupLastError: "partial cleanup",
            },
          ],
        })),
      })),
    }));

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        {
          ...runtimeConfig,
          SUBDOMAIN_CLEANUP_REQUEST_BUDGET: 5,
        },
      ),
    ).resolves.toBe(0);

    expect(deleteSubdomainEmailRoutingDnsRecords).not.toHaveBeenCalled();
    expect(ensureSubdomainEnabled).toHaveBeenCalledTimes(1);
    expect(db.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        cleanupNextAttemptAt: null,
        cleanupLastError: null,
      }),
    );
  });

  it("reserves one Cloudflare request for DNS re-enable when a mailbox revives mid-pass", async () => {
    const db = createDb([false, true, false, false]);
    getDb.mockReturnValue(db);
    deleteSubdomainEmailRoutingDnsRecords.mockResolvedValueOnce({
      matchedRecordCount: 4,
      requestCount: 4,
      completed: true,
    });

    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({
          results: [
            pendingRow,
            {
              ...pendingRow,
              id: "sub_beta",
              name: "beta",
            },
          ],
        })),
      })),
    }));

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        {
          ...runtimeConfig,
          SUBDOMAIN_CLEANUP_BATCH_SIZE: 2,
          SUBDOMAIN_CLEANUP_REQUEST_BUDGET: 5,
        },
      ),
    ).resolves.toBe(0);

    expect(deleteSubdomainEmailRoutingDnsRecords).toHaveBeenCalledTimes(1);
    expect(deleteSubdomainEmailRoutingDnsRecords).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        SUBDOMAIN_CLEANUP_REQUEST_BUDGET: 5,
      }),
      expect.any(Object),
      "ops",
      expect.any(Object),
      {
        requestBudget: 4,
      },
    );
    expect(ensureSubdomainEnabled).toHaveBeenCalledTimes(1);
  });

  it("keeps the row pending when one host consumes the remaining request budget", async () => {
    const db = createDb([false]);
    getDb.mockReturnValue(db);
    deleteSubdomainEmailRoutingDnsRecords.mockResolvedValueOnce({
      matchedRecordCount: 4,
      requestCount: 2,
      completed: false,
    });

    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({ results: [pendingRow] })),
      })),
    }));

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        {
          ...runtimeConfig,
          SUBDOMAIN_CLEANUP_REQUEST_BUDGET: 2,
        },
      ),
    ).resolves.toBe(0);

    expect(db.delete).not.toHaveBeenCalledWith(subdomains);
    expect(db.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        cleanupNextAttemptAt: "2026-04-08T12:00:00.000Z",
        cleanupLastError: null,
      }),
    );
  });

  it("debits Cloudflare request budget even when cleanup fails mid-host", async () => {
    const db = createDb([false, false]);
    getDb.mockReturnValue(db);
    deleteSubdomainEmailRoutingDnsRecords
      .mockRejectedValueOnce(
        new ApiError(500, "delete failed", {
          cloudflareRequestCount: 5,
        }),
      )
      .mockResolvedValueOnce({
        matchedRecordCount: 4,
        requestCount: 5,
        completed: true,
      });

    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({
          results: [
            pendingRow,
            {
              ...pendingRow,
              id: "sub_beta",
              name: "beta",
            },
          ],
        })),
      })),
    }));

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        {
          ...runtimeConfig,
          SUBDOMAIN_CLEANUP_BATCH_SIZE: 2,
          SUBDOMAIN_CLEANUP_REQUEST_BUDGET: 5,
        },
      ),
    ).resolves.toBe(0);

    expect(deleteSubdomainEmailRoutingDnsRecords).toHaveBeenCalledTimes(1);
    expect(db.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        cleanupNextAttemptAt: "2026-04-08T13:00:00.000Z",
        cleanupLastError: "delete failed",
      }),
    );
  });
});
