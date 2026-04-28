import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
const { deleteRoutingRule } = vi.hoisted(() => ({
  deleteRoutingRule: vi.fn(),
}));
const { resolveMailboxDomain } = vi.hoisted(() => ({
  resolveMailboxDomain: vi.fn(),
}));
const { nowIso } = vi.hoisted(() => ({
  nowIso: vi.fn(() => "2026-04-08T12:00:00.000Z"),
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
    deleteRoutingRule,
  };
});

vi.mock("../services/domains", async () => {
  const actual = await vi.importActual<typeof import("../services/domains")>(
    "../services/domains",
  );
  return {
    ...actual,
    resolveMailboxDomain,
  };
});

import {
  mailboxes,
  messageAttachments,
  messageRecipients,
  messages,
} from "../db/schema";
import {
  autorepairStaleDestroyingMailboxes,
  destroyMailbox,
  listMailboxIdsPendingCleanup,
} from "../services/mailboxes";

const runtimeConfig = {
  APP_ENV: "development",
  DEFAULT_MAILBOX_TTL_MINUTES: 60,
  CLEANUP_BATCH_SIZE: 3,
  MAILBOX_CLEANUP_AUTOREPAIR_MIN_AGE_MINUTES: 120,
  MAILBOX_CLEANUP_REPAIR_BATCH_SIZE: 100,
  SUBDOMAIN_CLEANUP_BATCH_SIZE: 1,
  EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
  CLOUDFLARE_API_TOKEN: "cf-token",
  EMAIL_WORKER_NAME: "mail-worker",
  SESSION_SECRET: "super-secret-session-key",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
} as const;

describe("mailbox cleanup service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nowIso.mockReturnValue("2026-04-08T12:00:00.000Z");
  });

  it("retries destroying mailboxes after expired active rows", async () => {
    const db = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(async () => [{ id: "mbx_destroying" }]),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(async () => [{ id: "mbx_expired" }]),
              })),
            })),
          })),
        }),
    };
    getDb.mockReturnValue(db);

    const mailboxIds = await listMailboxIdsPendingCleanup(
      {} as never,
      runtimeConfig,
    );

    expect(mailboxIds).toEqual(["mbx_destroying", "mbx_expired"]);
  });

  it("always reserves one cleanup slot for destroying mailboxes", async () => {
    const db = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(async () => [{ id: "mbx_destroying" }]),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(async () => [
                  { id: "mbx_expired_1" },
                  { id: "mbx_expired_2" },
                ]),
              })),
            })),
          })),
        }),
    };
    getDb.mockReturnValue(db);

    const mailboxIds = await listMailboxIdsPendingCleanup(
      {} as never,
      runtimeConfig,
    );

    expect(mailboxIds).toEqual([
      "mbx_destroying",
      "mbx_expired_1",
      "mbx_expired_2",
    ]);
  });

  it("selects later eligible destroying mailboxes when older failures are cooling down", async () => {
    const db = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(async () => [
                  { id: "mbx_later_destroying_ready" },
                ]),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(async () => [
                  { id: "mbx_expired_1" },
                  { id: "mbx_expired_2" },
                ]),
              })),
            })),
          })),
        }),
    };
    getDb.mockReturnValue(db);

    const mailboxIds = await listMailboxIdsPendingCleanup(
      {} as never,
      runtimeConfig,
    );

    expect(mailboxIds).toEqual([
      "mbx_later_destroying_ready",
      "mbx_expired_1",
      "mbx_expired_2",
    ]);
  });

  it("alternates single-slot cleanup between expired and destroying mailboxes", async () => {
    const destroyingQuery = {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => [{ id: "mbx_destroying" }]),
          })),
        })),
      })),
    };
    const activeQuery = {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => [{ id: "mbx_expired" }]),
          })),
        })),
      })),
    };
    const db = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
      select: vi
        .fn()
        .mockReturnValueOnce(destroyingQuery)
        .mockReturnValueOnce(activeQuery)
        .mockReturnValueOnce(destroyingQuery)
        .mockReturnValueOnce(activeQuery),
    };
    getDb.mockReturnValue(db);

    nowIso.mockReturnValueOnce("2026-04-08T12:00:00.000Z");
    const firstBatch = await listMailboxIdsPendingCleanup({} as never, {
      ...runtimeConfig,
      CLEANUP_BATCH_SIZE: 1,
    });

    nowIso.mockReturnValueOnce("2026-04-08T12:01:00.000Z");
    const secondBatch = await listMailboxIdsPendingCleanup({} as never, {
      ...runtimeConfig,
      CLEANUP_BATCH_SIZE: 1,
    });

    expect(firstBatch).toHaveLength(1);
    expect(secondBatch).toHaveLength(1);
    expect(new Set([...firstBatch, ...secondBatch])).toEqual(
      new Set(["mbx_destroying", "mbx_expired"]),
    );
  });

  it("deletes R2 objects before removing message rows and only marks destroyed after bucket cleanup", async () => {
    const mailbox = {
      id: "mbx_alpha",
      userId: "usr_1",
      domainId: null,
      localPart: "build",
      subdomain: "ops",
      address: "build@ops.707979.xyz",
      source: "registered",
      routingRuleId: "rule_alpha",
      status: "active",
      createdAt: "2026-04-08T10:00:00.000Z",
      expiresAt: "2026-04-08T12:00:00.000Z",
      destroyedAt: null,
    };
    const relatedMessages = Array.from({ length: 55 }, (_, index) => ({
      id: `msg_${index.toString().padStart(3, "0")}`,
      userId: mailbox.userId,
      mailboxId: mailbox.id,
      mailboxAddress: mailbox.address,
      envelopeFrom: null,
      envelopeTo: mailbox.address,
      fromName: null,
      fromAddress: null,
      subject: `Subject ${index}`,
      previewText: `Preview ${index}`,
      messageIdHeader: null,
      dateHeader: null,
      receivedAt: "2026-04-08T11:00:00.000Z",
      sizeBytes: 128,
      attachmentCount: 0,
      hasHtml: false,
      parseStatus: "parsed",
      rawR2Key: `raw/${index}.eml`,
      parsedR2Key: `parsed/${index}.json`,
    }));
    const operationLog: string[] = [];
    const db = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table === mailboxes) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => [mailbox]),
              })),
            };
          }

          if (table === messages) {
            return {
              where: vi.fn(async () => relatedMessages),
            };
          }

          if (table === messageRecipients || table === messageAttachments) {
            return {
              where: vi.fn(async () => []),
            };
          }

          throw new Error("Unexpected table");
        }),
      })),
      update: vi.fn((table: unknown) => ({
        set: vi.fn((values: { status?: string }) => ({
          where: vi.fn(async () => {
            if (table === mailboxes && values.status === "destroying") {
              operationLog.push("mailbox:destroying");
            }
            if (table === mailboxes && values.status === "destroyed") {
              operationLog.push("mailbox:destroyed");
            }
          }),
        })),
      })),
      delete: vi.fn((table: unknown) => ({
        where: vi.fn(async () => {
          if (table === messageAttachments) operationLog.push("attachments");
          if (table === messageRecipients) operationLog.push("recipients");
          if (table === messages) operationLog.push("messages");
        }),
      })),
    };
    getDb.mockReturnValue(db);
    resolveMailboxDomain.mockResolvedValue({
      rootDomain: "707979.xyz",
      zoneId: "zone_alpha",
    });
    deleteRoutingRule.mockImplementation(async () => {
      operationLog.push("routing");
    });

    const bucketDelete = vi.fn(async (key: string) => {
      operationLog.push(`bucket:${key}`);
    });

    await destroyMailbox(
      {
        MAIL_BUCKET: {
          delete: bucketDelete,
        },
      } as never,
      runtimeConfig,
      mailbox.id,
    );

    expect(
      operationLog.findIndex((entry) => entry.startsWith("bucket:")),
    ).toBeLessThan(operationLog.indexOf("attachments"));
    expect(operationLog.indexOf("attachments")).toBeLessThan(
      operationLog.indexOf("messages"),
    );
    expect(
      operationLog.filter((entry) => entry === "attachments"),
    ).toHaveLength(2);
    expect(operationLog.filter((entry) => entry === "recipients")).toHaveLength(
      2,
    );
    expect(operationLog.indexOf("messages")).toBeLessThan(
      operationLog.indexOf("mailbox:destroyed"),
    );
    expect(operationLog.indexOf("mailbox:destroying")).toBeLessThan(
      operationLog.findIndex((entry) => entry.startsWith("bucket:")),
    );
    expect(bucketDelete).toHaveBeenCalledTimes(110);
  });

  it("keeps message metadata when bucket cleanup fails so destroying cleanup can retry", async () => {
    const mailbox = {
      id: "mbx_retry",
      userId: "usr_1",
      domainId: null,
      localPart: "retry",
      subdomain: "ops",
      address: "retry@ops.707979.xyz",
      source: "registered",
      routingRuleId: null,
      status: "active",
      createdAt: "2026-04-08T10:00:00.000Z",
      expiresAt: "2026-04-08T12:00:00.000Z",
      destroyedAt: null,
    };
    const relatedMessages = Array.from({ length: 25 }, (_, index) => ({
      id: `msg_retry_${index.toString().padStart(2, "0")}`,
      userId: mailbox.userId,
      mailboxId: mailbox.id,
      mailboxAddress: mailbox.address,
      envelopeFrom: null,
      envelopeTo: mailbox.address,
      fromName: null,
      fromAddress: null,
      subject: `Retry me ${index}`,
      previewText: `Retry me ${index}`,
      messageIdHeader: null,
      dateHeader: null,
      receivedAt: "2026-04-08T11:00:00.000Z",
      sizeBytes: 128,
      attachmentCount: 1,
      hasHtml: false,
      parseStatus: "parsed",
      rawR2Key: `raw/retry-${index}.eml`,
      parsedR2Key: `parsed/retry-${index}.json`,
    }));
    const operationLog: string[] = [];
    const updateValues: unknown[] = [];
    const db = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table === mailboxes) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => [mailbox]),
              })),
            };
          }
          if (table === messages) {
            return {
              where: vi.fn(async () => relatedMessages),
            };
          }

          throw new Error("Unexpected table");
        }),
      })),
      update: vi.fn((table: unknown) => ({
        set: vi.fn((values: { status?: string }) => ({
          where: vi.fn(async () => {
            if (table === mailboxes) updateValues.push(values);
            if (table === mailboxes && values.status === "destroying") {
              operationLog.push("mailbox:destroying");
            }
            if (table === mailboxes && values.status === "destroyed") {
              operationLog.push("mailbox:destroyed");
            }
          }),
        })),
      })),
      delete: vi.fn((table: unknown) => ({
        where: vi.fn(async () => {
          if (table === messageAttachments) operationLog.push("attachments");
          if (table === messageRecipients) operationLog.push("recipients");
          if (table === messages) operationLog.push("messages");
        }),
      })),
    };
    getDb.mockReturnValue(db);

    const bucketDelete = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("R2 temporary failure"));

    await expect(
      destroyMailbox(
        {
          MAIL_BUCKET: {
            delete: bucketDelete,
          },
        } as never,
        runtimeConfig,
        mailbox.id,
      ),
    ).rejects.toThrow("R2 temporary failure");

    expect(operationLog).not.toContain("attachments");
    expect(operationLog).not.toContain("recipients");
    expect(operationLog).not.toContain("messages");
    expect(operationLog).not.toContain("mailbox:destroyed");
    expect(updateValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cleanupNextAttemptAt: "2026-04-08T13:00:00.000Z",
          cleanupLastError: "R2 temporary failure",
        }),
      ]),
    );
  });

  it("autorepairs stale destroying mailboxes only when they have no routing rule or messages", async () => {
    const prepare = vi
      .fn()
      .mockReturnValueOnce({
        bind: vi.fn((cutoff: string, limit: number) => ({
          all: vi.fn(async () => {
            expect(cutoff).toBe("2026-04-08T10:00:00.000Z");
            expect(limit).toBe(100);
            return {
              results: [{ id: "mbx_safe_1" }, { id: "mbx_safe_2" }],
            };
          }),
        })),
      })
      .mockReturnValueOnce({
        bind: vi.fn((destroyedAt: string, ...mailboxIds: string[]) => ({
          run: vi.fn(async () => {
            expect(destroyedAt).toBe("2026-04-08T12:00:00.000Z");
            expect(mailboxIds).toEqual(["mbx_safe_1", "mbx_safe_2"]);
            return { meta: { changes: 2 } };
          }),
        })),
      });

    const repairedCount = await autorepairStaleDestroyingMailboxes(
      {
        DB: {
          prepare,
        },
      } as never,
      runtimeConfig,
    );

    expect(repairedCount).toBe(2);
    expect(prepare).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("m.routing_rule_id IS NULL"),
    );
    expect(prepare).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("NOT EXISTS"),
    );
    expect(prepare).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("routing_rule_id IS NULL"),
    );
    expect(prepare).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("NOT EXISTS"),
    );
  });
});
