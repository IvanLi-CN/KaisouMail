import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
const { nowIso, randomId } = vi.hoisted(() => ({
  nowIso: vi.fn(() => "2026-04-08T12:00:00.000Z"),
  randomId: vi.fn(() => "lease_cleanup"),
}));
const {
  deleteSubdomainEmailRoutingDnsRecords,
  ensureSubdomainEnabled,
  getCloudflareRateLimitState,
} = vi.hoisted(() => ({
  deleteSubdomainEmailRoutingDnsRecords: vi.fn(),
  ensureSubdomainEnabled: vi.fn(),
  getCloudflareRateLimitState: vi.fn(),
}));
const { tryAcquireRuntimeLease, releaseRuntimeLease } = vi.hoisted(() => ({
  tryAcquireRuntimeLease: vi.fn(),
  releaseRuntimeLease: vi.fn(),
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
    randomId,
  };
});

vi.mock("../services/runtime-state", () => ({
  tryAcquireRuntimeLease,
  releaseRuntimeLease,
}));

vi.mock("../services/emailRouting", async () => {
  const actual = await vi.importActual<
    typeof import("../services/emailRouting")
  >("../services/emailRouting");
  return {
    ...actual,
    deleteSubdomainEmailRoutingDnsRecords,
    ensureSubdomainEnabled,
    getCloudflareRateLimitState,
  };
});

import { mailboxes, subdomains } from "../db/schema";
import { ApiError } from "../lib/errors";
import { CloudflareRequestExecutionAbortedError } from "../services/emailRouting";
import {
  listSubdomainsPendingCleanup,
  runSubdomainCleanup,
} from "../services/subdomain-cleanup";

const runtimeConfig = {
  APP_ENV: "development",
  DEFAULT_MAILBOX_TTL_MINUTES: 60,
  CLEANUP_BATCH_SIZE: 3,
  SUBDOMAIN_CLEANUP_BATCH_SIZE: 1,
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
  const deleteWhere = vi.fn(async () => undefined);
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

const createPrepare = (rows: unknown[]) =>
  vi.fn(() => ({
    bind: vi.fn(() => ({
      all: vi.fn(async () => ({ results: rows })),
    })),
  }));

describe("subdomain cleanup service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00.000Z"));
    nowIso.mockReturnValue("2026-04-08T12:00:00.000Z");
    randomId.mockReturnValue("lease_cleanup");
    getCloudflareRateLimitState.mockResolvedValue(null);
    tryAcquireRuntimeLease.mockResolvedValue({
      owner: "lease_cleanup",
      leaseUntil: "2026-04-08T12:13:00.000Z",
    });
    releaseRuntimeLease.mockResolvedValue(undefined);
    deleteSubdomainEmailRoutingDnsRecords.mockResolvedValue({
      matchedRecordCount: 4,
      requestCount: 4,
      completed: true,
    });
    ensureSubdomainEnabled.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("queries the oldest orphaned subdomains that are ready for cleanup", async () => {
    const prepare = createPrepare([pendingRow]);

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
        },
      ),
    ).resolves.toEqual([]);

    expect(prepare).not.toHaveBeenCalled();
  });

  it("skips the pass when Cloudflare cooldown is still active", async () => {
    getCloudflareRateLimitState.mockResolvedValueOnce({
      retryAfter: "2026-04-08T12:05:00.000Z",
      retryAfterSeconds: 300,
      rateLimitContext: null,
    });
    const prepare = createPrepare([pendingRow]);

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        runtimeConfig,
      ),
    ).resolves.toBe(0);

    expect(tryAcquireRuntimeLease).not.toHaveBeenCalled();
    expect(deleteSubdomainEmailRoutingDnsRecords).not.toHaveBeenCalled();
  });

  it("skips the pass when another cleanup invocation already holds the lease", async () => {
    tryAcquireRuntimeLease.mockResolvedValueOnce(null);
    const prepare = createPrepare([pendingRow]);

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        runtimeConfig,
      ),
    ).resolves.toBe(0);

    expect(deleteSubdomainEmailRoutingDnsRecords).not.toHaveBeenCalled();
    expect(releaseRuntimeLease).not.toHaveBeenCalled();
  });

  it("releases the lease when candidate selection fails before cleanup starts", async () => {
    getDb.mockReturnValue(createDb([]));
    const prepare = vi.fn(() => {
      throw new Error("D1 unavailable");
    });

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        runtimeConfig,
      ),
    ).rejects.toThrow("D1 unavailable");

    expect(releaseRuntimeLease).toHaveBeenCalledWith(
      expect.any(Object),
      "subdomain_cleanup_lease",
      "lease_cleanup",
    );
  });

  it("marks the row pending, deletes DNS, and then removes the local row", async () => {
    const db = createDb([false, false]);
    getDb.mockReturnValue(db);
    const prepare = createPrepare([pendingRow]);

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        runtimeConfig,
      ),
    ).resolves.toBe(1);

    expect(tryAcquireRuntimeLease).toHaveBeenCalledWith(
      expect.any(Object),
      "subdomain_cleanup_lease",
      "lease_cleanup",
      "2026-04-08T12:13:00.000Z",
    );
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
      expect.objectContaining({
        beforeRequest: expect.any(Function),
        shouldContinue: expect.any(Function),
      }),
    );
    expect(db.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        cleanupNextAttemptAt: "2026-04-08T12:00:00.000Z",
        cleanupLastError: null,
      }),
    );
    expect(db.delete).toHaveBeenCalledWith(subdomains);
    expect(releaseRuntimeLease).toHaveBeenCalledWith(
      expect.any(Object),
      "subdomain_cleanup_lease",
      "lease_cleanup",
    );
  });

  it("writes a one-hour backoff for non-429 failures and continues draining backlog", async () => {
    const db = createDb([false, false, false, false]);
    getDb.mockReturnValue(db);
    deleteSubdomainEmailRoutingDnsRecords
      .mockRejectedValueOnce(new Error("DNS unavailable"))
      .mockResolvedValueOnce({
        matchedRecordCount: 4,
        requestCount: 4,
        completed: true,
      });
    const prepare = createPrepare([
      pendingRow,
      {
        ...pendingRow,
        id: "sub_beta",
        name: "beta",
      },
    ]);

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        {
          ...runtimeConfig,
          SUBDOMAIN_CLEANUP_BATCH_SIZE: 2,
        },
      ),
    ).resolves.toBe(1);

    expect(deleteSubdomainEmailRoutingDnsRecords).toHaveBeenCalledTimes(2);
    expect(db.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        cleanupNextAttemptAt: "2026-04-08T13:00:00.000Z",
        cleanupLastError: "DNS unavailable",
      }),
    );
    expect(db.delete).toHaveBeenCalledWith(subdomains);
  });

  it("aborts the current pass on 429 and leaves the row pending for next time", async () => {
    const db = createDb([false]);
    getDb.mockReturnValue(db);
    deleteSubdomainEmailRoutingDnsRecords.mockRejectedValueOnce(
      new ApiError(429, "Cloudflare API rate limit reached; retry later"),
    );
    const prepare = createPrepare([
      pendingRow,
      {
        ...pendingRow,
        id: "sub_beta",
        name: "beta",
      },
    ]);

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        {
          ...runtimeConfig,
          SUBDOMAIN_CLEANUP_BATCH_SIZE: 2,
        },
      ),
    ).resolves.toBe(0);

    expect(deleteSubdomainEmailRoutingDnsRecords).toHaveBeenCalledTimes(1);
    expect(
      db.updateWhere.mock.calls.some(
        ([values]) =>
          values?.cleanupNextAttemptAt === "2026-04-08T13:00:00.000Z",
      ),
    ).toBe(false);
    expect(db.delete).not.toHaveBeenCalledWith(subdomains);
  });

  it("re-enables DNS instead of deleting the row when a mailbox reappears mid-cleanup", async () => {
    const db = createDb([false, true]);
    getDb.mockReturnValue(db);
    const prepare = createPrepare([pendingRow]);

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
      expect.objectContaining({
        beforeRequest: expect.any(Function),
      }),
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

  it("re-enables DNS when a pending-cleanup subdomain is already live again", async () => {
    const db = createDb([true]);
    getDb.mockReturnValue(db);
    const prepare = createPrepare([
      {
        ...pendingRow,
        cleanupNextAttemptAt: "2026-04-08T11:30:00.000Z",
        cleanupLastError: "partial cleanup",
      },
    ]);

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        runtimeConfig,
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

  it("stops the pass without backoff when the helper reports the deadline is reached", async () => {
    const db = createDb([false]);
    getDb.mockReturnValue(db);
    deleteSubdomainEmailRoutingDnsRecords.mockResolvedValueOnce({
      matchedRecordCount: 4,
      requestCount: 1,
      completed: false,
    });
    const prepare = createPrepare([pendingRow]);

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        runtimeConfig,
      ),
    ).resolves.toBe(0);

    expect(db.delete).not.toHaveBeenCalledWith(subdomains);
    expect(
      db.updateWhere.mock.calls.some(
        ([values]) =>
          values?.cleanupNextAttemptAt === "2026-04-08T13:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("paces Cloudflare cleanup requests to one call per second", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00.000Z"));
    const db = createDb([false, false]);
    getDb.mockReturnValue(db);
    const prepare = createPrepare([pendingRow]);

    deleteSubdomainEmailRoutingDnsRecords.mockImplementationOnce(
      async (_env, _config, _domain, _subdomain, _requestSource, options) => {
        if (!options?.beforeRequest) {
          throw new Error("expected beforeRequest to be provided");
        }

        await options.beforeRequest();

        let secondResolved = false;
        const secondRequest = options.beforeRequest().then(() => {
          secondResolved = true;
        });

        await vi.advanceTimersByTimeAsync(999);
        expect(secondResolved).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await secondRequest;
        expect(secondResolved).toBe(true);

        return {
          matchedRecordCount: 1,
          requestCount: 2,
          completed: true,
        };
      },
    );

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        runtimeConfig,
      ),
    ).resolves.toBe(1);
  });

  it("stops the pass when the pacer reaches the wall-clock deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00.000Z"));
    const db = createDb([false]);
    getDb.mockReturnValue(db);
    const prepare = createPrepare([pendingRow]);

    deleteSubdomainEmailRoutingDnsRecords.mockImplementationOnce(
      async (_env, _config, _domain, _subdomain, _requestSource, options) => {
        if (!options?.beforeRequest) {
          throw new Error("expected beforeRequest to be provided");
        }

        await vi.setSystemTime(new Date("2026-04-08T12:12:00.000Z"));
        await expect(options.beforeRequest()).rejects.toBeInstanceOf(
          CloudflareRequestExecutionAbortedError,
        );

        throw new CloudflareRequestExecutionAbortedError(
          "deadline_reached",
          "Subdomain cleanup request deadline reached",
        );
      },
    );

    await expect(
      runSubdomainCleanup(
        {
          DB: { prepare },
        } as never,
        runtimeConfig,
      ),
    ).resolves.toBe(0);

    expect(db.delete).not.toHaveBeenCalledWith(subdomains);
  });
});
