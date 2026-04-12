import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
const { ensureCatchAllMailboxForAddress, listScopedMailboxRowsForUser } =
  vi.hoisted(() => ({
    ensureCatchAllMailboxForAddress: vi.fn(),
    listScopedMailboxRowsForUser: vi.fn(),
  }));
const { resolveCatchAllDomainForAddress } = vi.hoisted(() => ({
  resolveCatchAllDomainForAddress: vi.fn(),
}));
const {
  resolveVerificationDetectionForMessage,
  createRetryableVerificationFallback,
} = vi.hoisted(() => ({
  resolveVerificationDetectionForMessage: vi.fn(),
  createRetryableVerificationFallback: vi.fn(),
}));

vi.mock("../db/client", () => ({
  getDb,
}));

vi.mock("../services/mailboxes", () => ({
  ensureCatchAllMailboxForAddress,
  listScopedMailboxRowsForUser,
}));

vi.mock("../services/domains", () => ({
  resolveCatchAllDomainForAddress,
}));

vi.mock("../services/message-verification", async () => {
  const actual = await vi.importActual<
    typeof import("../services/message-verification")
  >("../services/message-verification");

  return {
    ...actual,
    resolveVerificationDetectionForMessage,
    createRetryableVerificationFallback,
  };
});

import { mailboxes, messages } from "../db/schema";
import {
  getMessageDetailForUser,
  getRawMessageResponseForUser,
  listMessagesForUser,
  storeIncomingMessage,
} from "../services/messages";

const adminUser = {
  id: "usr_admin",
  email: "admin@example.com",
  name: "Admin",
  role: "admin" as const,
};

const buildMessageRow = (
  id: string,
  mailboxAddress: string,
  receivedAt: string,
  verification?: {
    code: string;
    source: "subject" | "body";
    method: "rules" | "ai";
  } | null,
) => ({
  id,
  userId: adminUser.id,
  mailboxId: `mbx_${id}`,
  mailboxAddress,
  envelopeFrom: null,
  envelopeTo: mailboxAddress,
  fromName: "Sender",
  fromAddress: "sender@example.com",
  subject: `Subject ${id}`,
  previewText: `Preview ${id}`,
  messageIdHeader: null,
  dateHeader: null,
  receivedAt,
  sizeBytes: 128,
  attachmentCount: 0,
  hasHtml: false,
  verificationCode: verification?.code ?? null,
  verificationSource: verification?.source ?? null,
  verificationMethod: verification?.method ?? null,
  verificationCheckedAt: verification ? receivedAt : null,
  verificationRetryAfter: null,
  parseStatus: "parsed",
  rawR2Key: `raw/${id}.eml`,
  parsedR2Key: `parsed/${id}.json`,
});

const asJoinedMessage = (row: ReturnType<typeof buildMessageRow>) => ({
  message: row,
});

describe("message service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listScopedMailboxRowsForUser.mockResolvedValue([]);
    resolveCatchAllDomainForAddress.mockResolvedValue(null);
    ensureCatchAllMailboxForAddress.mockResolvedValue(null);
    createRetryableVerificationFallback.mockReturnValue({
      verification: null,
      shouldRetry: true,
      retryAfter: "2099-01-01T00:00:00.000Z",
    });
  });

  const buildMessageDb = (orderBy: ReturnType<typeof vi.fn>) => ({
    select: vi.fn((fields?: unknown) => ({
      from: vi.fn((table: unknown) => {
        if (
          table !== messages ||
          !fields ||
          !("message" in (fields as Record<string, unknown>))
        ) {
          throw new Error("Unexpected table");
        }
        return {
          innerJoin: vi.fn((joinedTable: unknown) => {
            if (joinedTable !== mailboxes) {
              throw new Error("Unexpected join table");
            }
            return {
              where: vi.fn(() => ({
                orderBy,
              })),
            };
          }),
        };
      }),
    })),
  });

  it("batches mailbox address filters at 50 and returns a globally sorted list", async () => {
    const mailboxAddresses = Array.from(
      { length: 70 },
      (_, index) => `box-${index.toString().padStart(3, "0")}@ops.707979.xyz`,
    );
    const orderBy = vi
      .fn()
      .mockResolvedValueOnce([
        asJoinedMessage(
          buildMessageRow(
            "msg_old",
            mailboxAddresses[0] ?? "box-000@ops.707979.xyz",
            "2026-04-08T11:58:00.000Z",
          ),
        ),
      ])
      .mockResolvedValueOnce([
        asJoinedMessage(
          buildMessageRow(
            "msg_new",
            mailboxAddresses[60] ?? "box-060@ops.707979.xyz",
            "2026-04-08T11:59:00.000Z",
          ),
        ),
      ]);
    const db = buildMessageDb(orderBy);
    getDb.mockReturnValue(db);

    const listed = await listMessagesForUser(
      {} as never,
      adminUser,
      mailboxAddresses,
      [],
      null,
    );

    expect(orderBy).toHaveBeenCalledTimes(2);
    expect(listed.map((message) => message.id)).toEqual(["msg_new", "msg_old"]);
  });

  it("maps verification metadata into message summaries", async () => {
    const orderBy = vi.fn().mockResolvedValue([
      asJoinedMessage(
        buildMessageRow(
          "msg_verify",
          "verify@ops.707979.xyz",
          "2026-04-08T11:59:00.000Z",
          {
            code: "551177",
            source: "subject",
            method: "ai",
          },
        ),
      ),
    ]);
    const db = buildMessageDb(orderBy);
    getDb.mockReturnValue(db);

    const listed = await listMessagesForUser(
      {} as never,
      adminUser,
      [],
      [],
      null,
    );

    expect(listed[0]?.verification).toEqual({
      code: "551177",
      source: "subject",
      method: "ai",
    });
  });

  it("intersects explicit mailbox filters with workspace-visible mailboxes", async () => {
    const visibleAddress = "visible@ops.707979.xyz";
    listScopedMailboxRowsForUser.mockResolvedValue([
      {
        id: "mbx_visible",
        userId: adminUser.id,
        domainId: null,
        localPart: "visible",
        subdomain: "ops",
        address: visibleAddress,
        source: "registered",
        routingRuleId: null,
        status: "active",
        createdAt: "2026-04-08T10:00:00.000Z",
        expiresAt: "2026-04-08T12:00:00.000Z",
        destroyedAt: null,
      },
    ]);
    const orderBy = vi
      .fn()
      .mockResolvedValue([
        asJoinedMessage(
          buildMessageRow(
            "msg_visible",
            visibleAddress,
            "2026-04-08T11:59:00.000Z",
          ),
        ),
      ]);
    const db = buildMessageDb(orderBy);
    getDb.mockReturnValue(db);

    const listed = await listMessagesForUser(
      {} as never,
      adminUser,
      [visibleAddress, "hidden@ops.707979.xyz"],
      [],
      null,
      "workspace",
    );

    expect(listScopedMailboxRowsForUser).toHaveBeenCalledWith(
      {} as never,
      adminUser,
      "workspace",
    );
    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.mailboxAddress).toBe(visibleAddress);
  });

  it("filters workspace messages by visible mailbox ids when an address is reused", async () => {
    const reusedAddress = "reused@ops.707979.xyz";
    listScopedMailboxRowsForUser.mockResolvedValue([
      {
        id: "mbx_visible",
        userId: adminUser.id,
        domainId: null,
        localPart: "reused",
        subdomain: "ops",
        address: reusedAddress,
        source: "registered",
        routingRuleId: null,
        status: "active",
        createdAt: "2026-04-08T10:00:00.000Z",
        expiresAt: "2026-04-08T12:00:00.000Z",
        destroyedAt: null,
      },
    ]);
    const orderBy = vi
      .fn()
      .mockResolvedValue([
        asJoinedMessage(
          buildMessageRow(
            "msg_visible",
            reusedAddress,
            "2026-04-08T11:59:00.000Z",
          ),
        ),
      ]);
    const db = buildMessageDb(orderBy);
    getDb.mockReturnValue(db);

    const listed = await listMessagesForUser(
      {} as never,
      adminUser,
      [reusedAddress],
      [],
      null,
      "workspace",
    );

    expect(listScopedMailboxRowsForUser).toHaveBeenCalledWith(
      {} as never,
      adminUser,
      "workspace",
    );
    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe("msg_visible");
  });

  it("hides destroying mailbox messages from the shared message feed", async () => {
    const orderBy = vi.fn().mockResolvedValue([]);
    const db = buildMessageDb(orderBy);
    getDb.mockReturnValue(db);

    const listed = await listMessagesForUser(
      {} as never,
      adminUser,
      [],
      [],
      null,
    );

    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(listed).toEqual([]);
  });

  it("filters workspace messages by explicit mailbox ids when an address is reused", async () => {
    const reusedAddress = "reused@ops.707979.xyz";
    listScopedMailboxRowsForUser.mockResolvedValue([
      {
        id: "mbx_visible_new",
        userId: adminUser.id,
        domainId: null,
        localPart: "reused",
        subdomain: "ops",
        address: reusedAddress,
        source: "registered",
        routingRuleId: null,
        status: "active",
        createdAt: "2026-04-08T10:00:00.000Z",
        expiresAt: "2026-04-08T12:00:00.000Z",
        destroyedAt: null,
      },
      {
        id: "mbx_visible_old",
        userId: adminUser.id,
        domainId: null,
        localPart: "reused",
        subdomain: "ops",
        address: reusedAddress,
        source: "registered",
        routingRuleId: null,
        status: "destroyed",
        createdAt: "2026-04-08T09:00:00.000Z",
        expiresAt: "2026-04-08T11:00:00.000Z",
        destroyedAt: "2026-04-08T11:30:00.000Z",
      },
    ]);
    const orderBy = vi
      .fn()
      .mockResolvedValue([
        asJoinedMessage(
          buildMessageRow(
            "msg_visible_new",
            reusedAddress,
            "2026-04-08T11:59:00.000Z",
          ),
        ),
      ]);
    const db = buildMessageDb(orderBy);
    getDb.mockReturnValue(db);

    const listed = await listMessagesForUser(
      {} as never,
      adminUser,
      [],
      ["mbx_visible_new"],
      null,
      "workspace",
    );

    expect(listScopedMailboxRowsForUser).toHaveBeenCalledWith(
      {} as never,
      adminUser,
      "workspace",
    );
    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe("msg_visible_new");
  });

  it("includes verification metadata in message details", async () => {
    const joinedRow = {
      message: buildMessageRow(
        "msg_detail_verify",
        "verify@ops.707979.xyz",
        "2026-04-08T11:59:00.000Z",
        {
          code: "842911",
          source: "body",
          method: "rules",
        },
      ),
      mailboxStatus: "active",
    };
    const db = {
      select: vi.fn((fields?: unknown) => {
        if (!fields) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(async () => []),
            })),
          };
        }

        return {
          from: vi.fn((table: unknown) => {
            if (
              table !== messages ||
              !("message" in (fields as Record<string, unknown>))
            ) {
              throw new Error("Unexpected table");
            }

            return {
              innerJoin: vi.fn((joinedTable: unknown) => {
                if (joinedTable !== mailboxes) {
                  throw new Error("Unexpected join table");
                }

                return {
                  where: vi.fn(() => ({
                    limit: vi.fn(async () => [joinedRow]),
                  })),
                };
              }),
            };
          }),
        };
      }),
    };
    getDb.mockReturnValue(db);

    const detail = await getMessageDetailForUser(
      {
        MAIL_BUCKET: {
          get: vi.fn(async () => ({
            text: async () =>
              JSON.stringify({
                html: null,
                text: "Use verification code 842911 to continue.",
                headers: [],
              }),
          })),
        },
      } as never,
      adminUser,
      "msg_detail_verify",
    );

    expect(detail.verification).toEqual({
      code: "842911",
      source: "body",
      method: "rules",
    });
  });

  it("blocks detail and raw reads while the mailbox is destroying", async () => {
    const joinedRow = {
      message: buildMessageRow(
        "msg_hidden",
        "hidden@ops.707979.xyz",
        "2026-04-08T11:59:00.000Z",
      ),
      mailboxStatus: "destroying",
    };
    const db = {
      select: vi.fn((fields?: unknown) => ({
        from: vi.fn((table: unknown) => {
          if (
            table !== messages ||
            !fields ||
            !("message" in (fields as Record<string, unknown>))
          ) {
            throw new Error("Unexpected table");
          }
          return {
            innerJoin: vi.fn((joinedTable: unknown) => {
              if (joinedTable !== mailboxes) {
                throw new Error("Unexpected join table");
              }
              return {
                where: vi.fn(() => ({
                  limit: vi.fn(async () => [joinedRow]),
                })),
              };
            }),
          };
        }),
      })),
    };
    getDb.mockReturnValue(db);

    await expect(
      getMessageDetailForUser(
        { MAIL_BUCKET: { get: vi.fn() } } as never,
        adminUser,
        "msg_hidden",
      ),
    ).rejects.toThrow("Message not found");
    await expect(
      getRawMessageResponseForUser(
        { MAIL_BUCKET: { get: vi.fn() } } as never,
        adminUser,
        "msg_hidden",
      ),
    ).rejects.toThrow("Message not found");
  });

  it("stores incoming mail even when verification detection throws", async () => {
    const insertedMessages: Array<Record<string, unknown>> = [];
    const mailboxRow = {
      id: "mbx_active",
      userId: adminUser.id,
      domainId: null,
      localPart: "verify",
      subdomain: "ops",
      address: "verify@ops.707979.xyz",
      source: "registered",
      routingRuleId: null,
      status: "active",
      createdAt: "2026-04-08T10:00:00.000Z",
      expiresAt: "2099-04-08T12:00:00.000Z",
      destroyedAt: null,
    };
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn(
        async (
          values: Record<string, unknown> | Array<Record<string, unknown>>,
        ) => {
          if (table === messages && !Array.isArray(values)) {
            insertedMessages.push(values);
          }
        },
      ),
    }));
    const db = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table !== mailboxes) throw new Error("Unexpected table");
          return {
            where: vi.fn(() => ({
              limit: vi.fn(async () => [mailboxRow]),
            })),
          };
        }),
      })),
      insert,
    };
    getDb.mockReturnValue(db);
    resolveVerificationDetectionForMessage.mockRejectedValue(
      new Error("runtime state unavailable"),
    );

    const bucketPut = vi.fn(async () => undefined);
    const rawMessage = [
      "From: Sender <sender@example.com>",
      "To: verify@ops.707979.xyz",
      "Subject: Verification email",
      "",
      "Use verification code 842911 to continue.",
    ].join("\r\n");

    await expect(
      storeIncomingMessage(
        {
          MAIL_BUCKET: {
            put: bucketPut,
          },
        } as never,
        {
          from: "sender@example.com",
          to: "verify@ops.707979.xyz",
          raw: new TextEncoder().encode(rawMessage),
          setReject: vi.fn(),
        } as never,
      ),
    ).resolves.toBeUndefined();

    expect(resolveVerificationDetectionForMessage).toHaveBeenCalledTimes(1);
    expect(createRetryableVerificationFallback).toHaveBeenCalledTimes(1);
    expect(bucketPut).toHaveBeenCalledTimes(2);
    expect(insertedMessages).toHaveLength(1);
    expect(insertedMessages[0]).toEqual(
      expect.objectContaining({
        verificationCode: null,
        verificationSource: null,
        verificationMethod: null,
        verificationCheckedAt: null,
        verificationRetryAfter: "2099-01-01T00:00:00.000Z",
      }),
    );
  });

  it("materializes a catch-all mailbox before storing the message", async () => {
    const insertedMessages: Array<Record<string, unknown>> = [];
    const catchAllMailbox = {
      id: "mbx_catch_all",
      userId: adminUser.id,
      domainId: "dom_secondary",
      localPart: "noreply",
      subdomain: "wild",
      address: "noreply@wild.mail.example.net",
      source: "catch_all",
      routingRuleId: null,
      status: "active",
      createdAt: "2026-04-08T10:00:00.000Z",
      expiresAt: null,
      destroyedAt: null,
    };
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn(
        async (
          values: Record<string, unknown> | Array<Record<string, unknown>>,
        ) => {
          if (table === messages && !Array.isArray(values)) {
            insertedMessages.push(values);
          }
        },
      ),
    }));
    const db = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table !== mailboxes) throw new Error("Unexpected table");
          return {
            where: vi.fn(() => ({
              limit: vi.fn(async () => []),
            })),
          };
        }),
      })),
      insert,
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
    };
    getDb.mockReturnValue(db);
    resolveCatchAllDomainForAddress.mockResolvedValue({
      id: "dom_secondary",
      rootDomain: "mail.example.net",
      zoneId: "zone_secondary",
      bindingSource: "project_bind",
      status: "active",
      catchAllEnabled: true,
      catchAllOwnerUserId: adminUser.id,
      catchAllRestoreStateJson:
        '{"enabled":false,"name":"Catch all","matchers":[{"type":"all"}],"actions":[]}',
      catchAllUpdatedAt: "2026-04-08T09:58:00.000Z",
      lastProvisionError: null,
      createdAt: "2026-04-08T09:00:00.000Z",
      updatedAt: "2026-04-08T09:58:00.000Z",
      lastProvisionedAt: "2026-04-08T09:10:00.000Z",
      disabledAt: null,
      deletedAt: null,
    });
    ensureCatchAllMailboxForAddress.mockResolvedValue(catchAllMailbox);
    resolveVerificationDetectionForMessage.mockResolvedValue({
      verification: null,
      shouldRetry: false,
      retryAfter: null,
    });

    await storeIncomingMessage(
      {
        MAIL_BUCKET: {
          put: vi.fn(async () => undefined),
        },
      } as never,
      {
        from: "sender@example.com",
        to: "noreply@wild.mail.example.net",
        raw: new TextEncoder().encode(
          [
            "From: Sender <sender@example.com>",
            "To: noreply@wild.mail.example.net",
            "Subject: Catch all mail",
            "",
            "hello",
          ].join("\r\n"),
        ),
        setReject: vi.fn(),
      } as never,
    );

    expect(resolveCatchAllDomainForAddress).toHaveBeenCalledWith(
      expect.objectContaining({
        MAIL_BUCKET: expect.any(Object),
      }),
      "noreply@wild.mail.example.net",
    );
    expect(ensureCatchAllMailboxForAddress).toHaveBeenCalledWith(
      expect.objectContaining({
        MAIL_BUCKET: expect.any(Object),
      }),
      expect.objectContaining({ id: "dom_secondary" }),
      "noreply@wild.mail.example.net",
    );
    expect(insertedMessages).toHaveLength(1);
    expect(insertedMessages[0]).toEqual(
      expect.objectContaining({
        mailboxId: "mbx_catch_all",
        mailboxAddress: "noreply@wild.mail.example.net",
      }),
    );
  });

  it("persists incoming mail before verification detection resolves", async () => {
    const insertedMessages: Array<Record<string, unknown>> = [];
    const messageUpdates: Array<Record<string, unknown>> = [];
    const mailboxRow = {
      id: "mbx_active",
      userId: adminUser.id,
      domainId: null,
      localPart: "verify",
      subdomain: "ops",
      address: "verify@ops.707979.xyz",
      source: "registered",
      routingRuleId: null,
      status: "active",
      createdAt: "2026-04-08T10:00:00.000Z",
      expiresAt: "2099-04-08T12:00:00.000Z",
      destroyedAt: null,
    };
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn(
        async (
          values: Record<string, unknown> | Array<Record<string, unknown>>,
        ) => {
          if (table === messages && !Array.isArray(values)) {
            insertedMessages.push(values);
          }
        },
      ),
    }));
    const update = vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          messageUpdates.push(values);
        }),
      })),
    }));
    const db = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table !== mailboxes) throw new Error("Unexpected table");
          return {
            where: vi.fn(() => ({
              limit: vi.fn(async () => [mailboxRow]),
            })),
          };
        }),
      })),
      insert,
      update,
    };
    getDb.mockReturnValue(db);

    let resolveDetection:
      | ((value: {
          verification: {
            code: string;
            source: "subject" | "body";
            method: "rules" | "ai";
          };
          shouldRetry: boolean;
          retryAfter: string | null;
        }) => void)
      | undefined;
    resolveVerificationDetectionForMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveDetection = resolve;
      }),
    );

    const storePromise = storeIncomingMessage(
      {
        MAIL_BUCKET: {
          put: vi.fn(async () => undefined),
        },
      } as never,
      {
        from: "sender@example.com",
        to: "verify@ops.707979.xyz",
        raw: new TextEncoder().encode(
          [
            "From: Sender <sender@example.com>",
            "To: verify@ops.707979.xyz",
            "Subject: Verification email",
            "",
            "Use verification code 842911 to continue.",
          ].join("\r\n"),
        ),
        setReject: vi.fn(),
      } as never,
    );

    await vi.waitFor(() => {
      expect(insertedMessages).toHaveLength(1);
    });
    expect(messageUpdates).toHaveLength(0);

    if (!resolveDetection) {
      throw new Error("Expected verification detection resolver");
    }

    resolveDetection({
      verification: {
        code: "842911",
        source: "body",
        method: "rules",
      },
      shouldRetry: false,
      retryAfter: null,
    });
    await storePromise;

    expect(messageUpdates).toContainEqual(
      expect.objectContaining({
        verificationCode: "842911",
        verificationSource: "body",
        verificationMethod: "rules",
        verificationCheckedAt: expect.any(String),
        verificationRetryAfter: null,
      }),
    );
  });
});
