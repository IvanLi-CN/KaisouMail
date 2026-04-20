import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
const { nowIso, randomId } = vi.hoisted(() => ({
  nowIso: vi.fn(() => "2026-04-20T02:00:00.000Z"),
  randomId: vi.fn(() => "lease_cleanup"),
}));
const {
  deleteSubdomainEmailRoutingDnsRecords,
  ensureSubdomainEnabled,
  getCloudflareAuthBlockState,
  getCloudflareRateLimitState,
  unlockEmailRoutingDnsRecords,
} = vi.hoisted(() => ({
  deleteSubdomainEmailRoutingDnsRecords: vi.fn(),
  ensureSubdomainEnabled: vi.fn(),
  getCloudflareAuthBlockState: vi.fn(),
  getCloudflareRateLimitState: vi.fn(),
  unlockEmailRoutingDnsRecords: vi.fn(),
}));
const { acquireCloudflareRequestPermit } = vi.hoisted(() => ({
  acquireCloudflareRequestPermit: vi.fn(),
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
    getCloudflareAuthBlockState,
    getCloudflareRateLimitState,
    unlockEmailRoutingDnsRecords,
  };
});

vi.mock("../services/cloudflare-request-gate", () => ({
  acquireCloudflareRequestPermit,
}));

import { mailboxes, subdomains } from "../db/schema";
import { ApiError } from "../lib/errors";
import {
  consumeSubdomainCleanupQueue,
  listSubdomainsPendingCleanup,
  type PendingSubdomainCleanupRow,
  runSubdomainCleanupDispatcher,
  type SubdomainCleanupQueueMessage,
} from "../services/subdomain-cleanup";

const runtimeConfig = {
  APP_ENV: "development",
  DEFAULT_MAILBOX_TTL_MINUTES: 60,
  CLEANUP_BATCH_SIZE: 3,
  SUBDOMAIN_CLEANUP_BATCH_SIZE: 500,
  SUBDOMAIN_CLEANUP_DISPATCH_BATCH_SIZE: 2,
  EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
  CLOUDFLARE_API_TOKEN: "cf-token",
  EMAIL_WORKER_NAME: "mail-worker",
  SESSION_SECRET: "super-secret-session-key",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
} as const;

const pendingRow: PendingSubdomainCleanupRow = {
  id: "sub_ops",
  domainId: "dom_primary",
  name: "ops",
  enabledAt: "2026-04-20T00:00:00.000Z",
  lastUsedAt: "2026-04-20T01:00:00.000Z",
  cleanupNextAttemptAt: null,
  cleanupLastError: null,
  cleanupLeaseOwner: null,
  cleanupLeaseUntil: null,
  metadata: '{"mode":"explicit"}',
  rootDomain: "707979.xyz",
  zoneId: "zone_primary",
};

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

const createQueueMessage = (
  body: SubdomainCleanupQueueMessage,
): Message<SubdomainCleanupQueueMessage> =>
  ({
    id: "msg_subdomain",
    timestamp: new Date("2026-04-20T02:00:00.000Z"),
    body,
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  }) as never;

const createBatch = (message: Message<SubdomainCleanupQueueMessage>) =>
  ({
    messages: [message],
    queue: "kaisoumail-subdomain-cleanup",
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  }) as never;

describe("subdomain cleanup service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.setSystemTime(new Date("2026-04-20T02:00:00.000Z"));
    nowIso.mockReturnValue("2026-04-20T02:00:00.000Z");
    randomId
      .mockReturnValueOnce("dispatcher_lease")
      .mockReturnValueOnce("row_lease_a")
      .mockReturnValueOnce("row_lease_b");
    getCloudflareAuthBlockState.mockResolvedValue(null);
    getCloudflareRateLimitState.mockResolvedValue(null);
    tryAcquireRuntimeLease.mockResolvedValue({
      owner: "dispatcher_lease",
      leaseUntil: "2026-04-20T02:00:55.000Z",
    });
    releaseRuntimeLease.mockResolvedValue(undefined);
    deleteSubdomainEmailRoutingDnsRecords.mockResolvedValue(undefined);
    ensureSubdomainEnabled.mockResolvedValue(undefined);
    unlockEmailRoutingDnsRecords.mockResolvedValue(undefined);
    acquireCloudflareRequestPermit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("queries the oldest orphaned subdomains that are ready for cleanup", async () => {
    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({ results: [pendingRow] })),
      })),
    }));

    await expect(
      listSubdomainsPendingCleanup(
        {
          DB: { prepare },
        } as never,
        runtimeConfig,
      ),
    ).resolves.toEqual([pendingRow]);

    expect(prepare).toHaveBeenCalledWith(
      expect.stringContaining("s.cleanup_lease_until IS NULL"),
    );
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("NOT EXISTS"));
  });

  it("claims eligible rows and enqueues queue work", async () => {
    const sendBatch = vi.fn(async () => undefined);
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("FROM subdomains s")) {
        return {
          bind: vi.fn(() => ({
            all: vi.fn(async () => ({
              results: [
                pendingRow,
                { ...pendingRow, id: "sub_beta", name: "beta" },
              ],
            })),
          })),
        };
      }

      if (sql.includes("SET cleanup_lease_owner = ?")) {
        return {
          bind: vi.fn(() => ({
            run: vi.fn(async () => ({ meta: { changes: 1 } })),
          })),
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(
      runSubdomainCleanupDispatcher(
        {
          DB: { prepare },
          SUBDOMAIN_CLEANUP_QUEUE: { sendBatch },
        } as never,
        runtimeConfig,
      ),
    ).resolves.toBe(2);

    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(sendBatch).toHaveBeenCalledWith([
      {
        body: {
          subdomainId: "sub_ops",
          leaseOwner: "row_lease_a",
          dispatchedAt: "2026-04-20T02:00:00.000Z",
        },
      },
      {
        body: {
          subdomainId: "sub_beta",
          leaseOwner: "row_lease_b",
          dispatchedAt: "2026-04-20T02:00:00.000Z",
        },
      },
    ]);
    expect(releaseRuntimeLease).toHaveBeenCalledWith(
      expect.any(Object),
      "subdomain_cleanup_dispatcher_lease",
      "dispatcher_lease",
    );
  });

  it("skips dispatch entirely while Cloudflare cooldown is active", async () => {
    getCloudflareRateLimitState.mockResolvedValueOnce({
      retryAfter: "2026-04-20T02:05:00.000Z",
      retryAfterSeconds: 300,
      rateLimitContext: null,
    });

    await expect(
      runSubdomainCleanupDispatcher(
        {
          DB: { prepare: vi.fn() },
          SUBDOMAIN_CLEANUP_QUEUE: { sendBatch: vi.fn() },
        } as never,
        runtimeConfig,
      ),
    ).resolves.toBe(0);

    expect(tryAcquireRuntimeLease).not.toHaveBeenCalled();
  });

  it("marks the row pending, unlocks the exact host, deletes DNS, and then removes the local row", async () => {
    const db = createDb([false, false]);
    getDb.mockReturnValue(db);
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("WHERE s.id = ?")) {
        return {
          bind: vi.fn(() => ({
            first: vi.fn(async () => ({
              ...pendingRow,
              cleanupLeaseOwner: "row_lease_a",
              cleanupLeaseUntil: "2026-04-20T02:05:00.000Z",
            })),
          })),
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const message = createQueueMessage({
      subdomainId: "sub_ops",
      leaseOwner: "row_lease_a",
      dispatchedAt: "2026-04-20T02:00:00.000Z",
    });

    await expect(
      consumeSubdomainCleanupQueue(
        createBatch(message),
        {
          DB: { prepare },
        } as never,
        runtimeConfig,
      ),
    ).resolves.toBeUndefined();

    expect(unlockEmailRoutingDnsRecords).toHaveBeenCalledWith(
      expect.any(Object),
      runtimeConfig,
      {
        rootDomain: "707979.xyz",
        zoneId: "zone_primary",
      },
      {
        projectOperation: "subdomains.cleanup",
        projectRoute: "subdomain cleanup queue",
      },
      {
        name: "ops.707979.xyz",
      },
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
        projectRoute: "subdomain cleanup queue",
      },
    );
    expect(db.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        cleanupNextAttemptAt: "2026-04-20T02:00:00.000Z",
        cleanupLastError: null,
      }),
    );
    expect(db.delete).toHaveBeenCalledWith(subdomains);
    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it("unlocks each queued exact fqdn before deleting Email Routing DNS", async () => {
    const firstMessage = createQueueMessage({
      subdomainId: "sub_ops",
      leaseOwner: "row_lease_a",
      dispatchedAt: "2026-04-20T02:00:00.000Z",
    });
    const secondMessage = createQueueMessage({
      subdomainId: "sub_beta",
      leaseOwner: "row_lease_b",
      dispatchedAt: "2026-04-20T02:00:00.000Z",
    });
    const batch = {
      messages: [firstMessage, secondMessage],
      queue: "kaisoumail-subdomain-cleanup",
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as never;
    const db = createDb([false, false, false, false]);
    getDb.mockReturnValue(db);
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("WHERE s.id = ?")) {
        return {
          bind: vi.fn((subdomainId: string) => ({
            first: vi.fn(async () => ({
              ...pendingRow,
              id: subdomainId,
              name: subdomainId === "sub_ops" ? "ops" : "beta",
              cleanupLeaseOwner:
                subdomainId === "sub_ops" ? "row_lease_a" : "row_lease_b",
              cleanupLeaseUntil: "2026-04-20T02:05:00.000Z",
            })),
          })),
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(
      consumeSubdomainCleanupQueue(
        batch,
        {
          DB: { prepare },
        } as never,
        runtimeConfig,
      ),
    ).resolves.toBeUndefined();

    expect(unlockEmailRoutingDnsRecords).toHaveBeenCalledTimes(2);
    expect(unlockEmailRoutingDnsRecords).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      runtimeConfig,
      {
        rootDomain: "707979.xyz",
        zoneId: "zone_primary",
      },
      {
        projectOperation: "subdomains.cleanup",
        projectRoute: "subdomain cleanup queue",
      },
      {
        name: "ops.707979.xyz",
      },
    );
    expect(unlockEmailRoutingDnsRecords).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      runtimeConfig,
      {
        rootDomain: "707979.xyz",
        zoneId: "zone_primary",
      },
      {
        projectOperation: "subdomains.cleanup",
        projectRoute: "subdomain cleanup queue",
      },
      {
        name: "beta.707979.xyz",
      },
    );
    expect(deleteSubdomainEmailRoutingDnsRecords).toHaveBeenCalledTimes(2);
    expect(firstMessage.ack).toHaveBeenCalledTimes(1);
    expect(secondMessage.ack).toHaveBeenCalledTimes(1);
  });

  it("acks queued work when the domain no longer has a zone id", async () => {
    const releaseLeaseRun = vi.fn(async () => ({ meta: { changes: 1 } }));
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("WHERE s.id = ?")) {
        return {
          bind: vi.fn(() => ({
            first: vi.fn(async () => null),
          })),
        };
      }

      if (sql.includes("SET cleanup_lease_owner = NULL")) {
        return {
          bind: vi.fn(() => ({
            run: releaseLeaseRun,
          })),
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const message = createQueueMessage({
      subdomainId: "sub_ops",
      leaseOwner: "row_lease_a",
      dispatchedAt: "2026-04-20T02:00:00.000Z",
    });

    await consumeSubdomainCleanupQueue(
      createBatch(message),
      {
        DB: { prepare },
      } as never,
      runtimeConfig,
    );

    expect(releaseLeaseRun).toHaveBeenCalledTimes(1);
    expect(deleteSubdomainEmailRoutingDnsRecords).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it("honors the cleanup kill switch for already-enqueued messages", async () => {
    const releaseLeaseRun = vi.fn(async () => ({ meta: { changes: 1 } }));
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("SET cleanup_lease_owner = NULL")) {
        return {
          bind: vi.fn(() => ({
            run: releaseLeaseRun,
          })),
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const message = createQueueMessage({
      subdomainId: "sub_ops",
      leaseOwner: "row_lease_a",
      dispatchedAt: "2026-04-20T02:00:00.000Z",
    });

    await consumeSubdomainCleanupQueue(
      createBatch(message),
      {
        DB: { prepare },
      } as never,
      {
        ...runtimeConfig,
        EMAIL_ROUTING_MANAGEMENT_ENABLED: false,
      },
    );

    expect(releaseLeaseRun).toHaveBeenCalledTimes(1);
    expect(deleteSubdomainEmailRoutingDnsRecords).not.toHaveBeenCalled();
    expect(ensureSubdomainEnabled).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it("writes a one-hour backoff for non-429 failures", async () => {
    const db = createDb([false]);
    getDb.mockReturnValue(db);
    deleteSubdomainEmailRoutingDnsRecords.mockRejectedValueOnce(
      new Error("DNS unavailable"),
    );
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("WHERE s.id = ?")) {
        return {
          bind: vi.fn(() => ({
            first: vi.fn(async () => ({
              ...pendingRow,
              cleanupLeaseOwner: "row_lease_a",
              cleanupLeaseUntil: "2026-04-20T02:05:00.000Z",
            })),
          })),
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const message = createQueueMessage({
      subdomainId: "sub_ops",
      leaseOwner: "row_lease_a",
      dispatchedAt: "2026-04-20T02:00:00.000Z",
    });

    await consumeSubdomainCleanupQueue(
      createBatch(message),
      {
        DB: { prepare },
      } as never,
      runtimeConfig,
    );

    expect(db.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        cleanupNextAttemptAt: "2026-04-20T03:00:00.000Z",
        cleanupLastError: "DNS unavailable",
        cleanupLeaseOwner: null,
        cleanupLeaseUntil: null,
      }),
    );
    expect(message.retry).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it("retries the queue message on 429 without writing row backoff", async () => {
    const db = createDb([false]);
    getDb.mockReturnValue(db);
    deleteSubdomainEmailRoutingDnsRecords.mockRejectedValueOnce(
      new ApiError(429, "Cloudflare API rate limit reached; retry later"),
    );
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("WHERE s.id = ?")) {
        return {
          bind: vi.fn(() => ({
            first: vi.fn(async () => ({
              ...pendingRow,
              cleanupLeaseOwner: "row_lease_a",
              cleanupLeaseUntil: "2026-04-20T02:05:00.000Z",
            })),
          })),
        };
      }

      if (sql.includes("SET cleanup_lease_until = ?")) {
        return {
          bind: vi.fn(() => ({
            run: vi.fn(async () => ({ meta: { changes: 1 } })),
          })),
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const message = createQueueMessage({
      subdomainId: "sub_ops",
      leaseOwner: "row_lease_a",
      dispatchedAt: "2026-04-20T02:00:00.000Z",
    });

    await consumeSubdomainCleanupQueue(
      createBatch(message),
      {
        DB: { prepare },
      } as never,
      runtimeConfig,
    );

    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    expect(message.ack).not.toHaveBeenCalled();
    expect(
      db.updateWhere.mock.calls.some(
        ([values = {} as Record<string, unknown>]) =>
          values.cleanupNextAttemptAt === "2026-04-20T03:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("retries the queue message when Cloudflare auth is blocked", async () => {
    getCloudflareAuthBlockState.mockResolvedValueOnce({
      retryAfter: "2026-04-20T02:05:00.000Z",
      retryAfterSeconds: 300,
      authBlockContext: null,
    });
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("WHERE s.id = ?")) {
        return {
          bind: vi.fn(() => ({
            first: vi.fn(async () => ({
              ...pendingRow,
              cleanupLeaseOwner: "row_lease_a",
              cleanupLeaseUntil: "2026-04-20T02:05:00.000Z",
            })),
          })),
        };
      }

      if (sql.includes("SET cleanup_lease_until = ?")) {
        return {
          bind: vi.fn(() => ({
            run: vi.fn(async () => ({ meta: { changes: 1 } })),
          })),
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const message = createQueueMessage({
      subdomainId: "sub_ops",
      leaseOwner: "row_lease_a",
      dispatchedAt: "2026-04-20T02:00:00.000Z",
    });

    await consumeSubdomainCleanupQueue(
      createBatch(message),
      {
        DB: { prepare },
      } as never,
      runtimeConfig,
    );

    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 300 });
    expect(deleteSubdomainEmailRoutingDnsRecords).not.toHaveBeenCalled();
  });

  it("re-enables DNS instead of deleting the row when a mailbox reappears mid-cleanup", async () => {
    const db = createDb([false, true]);
    getDb.mockReturnValue(db);
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("WHERE s.id = ?")) {
        return {
          bind: vi.fn(() => ({
            first: vi.fn(async () => ({
              ...pendingRow,
              cleanupLeaseOwner: "row_lease_a",
              cleanupLeaseUntil: "2026-04-20T02:05:00.000Z",
            })),
          })),
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const message = createQueueMessage({
      subdomainId: "sub_ops",
      leaseOwner: "row_lease_a",
      dispatchedAt: "2026-04-20T02:00:00.000Z",
    });

    await consumeSubdomainCleanupQueue(
      createBatch(message),
      {
        DB: { prepare },
      } as never,
      runtimeConfig,
    );

    expect(ensureSubdomainEnabled).toHaveBeenCalledTimes(1);
    expect(db.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        lastUsedAt: "2026-04-20T02:00:00.000Z",
        cleanupNextAttemptAt: null,
        cleanupLastError: null,
        cleanupLeaseOwner: null,
        cleanupLeaseUntil: null,
      }),
    );
    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it("deletes wildcard-born orphan rows locally without calling Cloudflare cleanup", async () => {
    const db = createDb([false]);
    getDb.mockReturnValue(db);
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("WHERE s.id = ?")) {
        return {
          bind: vi.fn(() => ({
            first: vi.fn(async () => ({
              ...pendingRow,
              metadata: '{"mode":"wildcard"}',
              cleanupLeaseOwner: "row_lease_a",
              cleanupLeaseUntil: "2026-04-20T02:05:00.000Z",
            })),
          })),
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const message = createQueueMessage({
      subdomainId: "sub_ops",
      leaseOwner: "row_lease_a",
      dispatchedAt: "2026-04-20T02:00:00.000Z",
    });

    await consumeSubdomainCleanupQueue(
      createBatch(message),
      {
        DB: { prepare },
      } as never,
      runtimeConfig,
    );

    expect(deleteSubdomainEmailRoutingDnsRecords).not.toHaveBeenCalled();
    expect(db.delete).toHaveBeenCalledWith(subdomains);
    expect(message.ack).toHaveBeenCalledTimes(1);
  });
});
