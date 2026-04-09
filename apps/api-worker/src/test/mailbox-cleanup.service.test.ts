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
  destroyMailbox,
  listMailboxIdsPendingCleanup,
} from "../services/mailboxes";

const runtimeConfig = {
  APP_ENV: "development",
  DEFAULT_MAILBOX_TTL_MINUTES: 60,
  CLEANUP_BATCH_SIZE: 3,
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

    expect(mailboxIds).toEqual(["mbx_expired", "mbx_destroying"]);
  });

  it("always reserves one cleanup slot for destroying mailboxes", async () => {
    const db = {
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
      "mbx_expired_1",
      "mbx_expired_2",
      "mbx_destroying",
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

  it("deletes message rows in 50-id chunks before removing R2 objects and only marks destroyed after bucket cleanup", async () => {
    const mailbox = {
      id: "mbx_alpha",
      userId: "usr_1",
      domainId: null,
      localPart: "build",
      subdomain: "ops",
      address: "build@ops.707979.xyz",
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
      operationLog.filter((entry) => entry === "attachments"),
    ).toHaveLength(2);
    expect(operationLog.filter((entry) => entry === "recipients")).toHaveLength(
      2,
    );
    expect(operationLog.indexOf("messages")).toBeLessThan(
      operationLog.findIndex((entry) => entry.startsWith("bucket:")),
    );
    expect(
      operationLog.findIndex((entry) => entry.startsWith("bucket:")),
    ).toBeLessThan(operationLog.indexOf("mailbox:destroyed"));
    expect(operationLog.indexOf("mailbox:destroying")).toBeLessThan(
      operationLog.findIndex((entry) => entry.startsWith("bucket:")),
    );
    expect(bucketDelete).toHaveBeenCalledTimes(110);
  });

  it("restores message metadata when bucket cleanup fails so destroying cleanup can retry", async () => {
    const mailbox = {
      id: "mbx_retry",
      userId: "usr_1",
      domainId: null,
      localPart: "retry",
      subdomain: "ops",
      address: "retry@ops.707979.xyz",
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
    const relatedRecipients = relatedMessages.map((message) => ({
      id: `rcpt_${message.id}`,
      messageId: message.id,
      kind: "to" as const,
      name: null,
      address: mailbox.address,
    }));
    const relatedAttachments = relatedMessages.map((message) => ({
      id: `att_${message.id}`,
      messageId: message.id,
      filename: "retry.txt",
      contentType: "text/plain",
      sizeBytes: 8,
      contentId: null,
      disposition: "attachment" as const,
    }));
    const operationLog: string[] = [];
    const restoreInsertSizes = {
      messages: [] as number[],
      recipients: [] as number[],
      attachments: [] as number[],
    };
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
          if (table === messageRecipients) {
            return {
              where: vi.fn(async () => relatedRecipients),
            };
          }
          if (table === messageAttachments) {
            return {
              where: vi.fn(async () => relatedAttachments),
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
      insert: vi.fn((table: unknown) => ({
        values: vi.fn(async (rows: unknown | unknown[]) => {
          const length = Array.isArray(rows) ? rows.length : 1;
          if (table === messages) {
            operationLog.push("restore:messages");
            restoreInsertSizes.messages.push(length);
          }
          if (table === messageRecipients) {
            operationLog.push("restore:recipients");
            restoreInsertSizes.recipients.push(length);
          }
          if (table === messageAttachments) {
            operationLog.push("restore:attachments");
            restoreInsertSizes.attachments.push(length);
          }
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

    expect(operationLog).toContain("restore:messages");
    expect(operationLog).toContain("restore:recipients");
    expect(operationLog).toContain("restore:attachments");
    expect(restoreInsertSizes.messages.length).toBeGreaterThan(1);
    expect(restoreInsertSizes.recipients.length).toBeGreaterThan(1);
    expect(restoreInsertSizes.attachments.length).toBeGreaterThan(1);
    expect(Math.max(...restoreInsertSizes.messages)).toBeLessThanOrEqual(5);
    expect(Math.max(...restoreInsertSizes.recipients)).toBeLessThanOrEqual(20);
    expect(Math.max(...restoreInsertSizes.attachments)).toBeLessThanOrEqual(14);
    expect(operationLog).not.toContain("mailbox:destroyed");
  });
});
