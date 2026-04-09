import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
const { listScopedMailboxRowsForUser } = vi.hoisted(() => ({
  listScopedMailboxRowsForUser: vi.fn(),
}));

vi.mock("../db/client", () => ({
  getDb,
}));

vi.mock("../services/mailboxes", () => ({
  listScopedMailboxRowsForUser,
}));

import { messages } from "../db/schema";
import { listMessagesForUser } from "../services/messages";

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
  parseStatus: "parsed",
  rawR2Key: `raw/${id}.eml`,
  parsedR2Key: `parsed/${id}.json`,
});

describe("message service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listScopedMailboxRowsForUser.mockResolvedValue([]);
  });

  it("batches mailbox address filters at 50 and returns a globally sorted list", async () => {
    const mailboxAddresses = Array.from(
      { length: 70 },
      (_, index) => `box-${index.toString().padStart(3, "0")}@ops.707979.xyz`,
    );
    const orderBy = vi
      .fn()
      .mockResolvedValueOnce([
        buildMessageRow(
          "msg_old",
          mailboxAddresses[0] ?? "box-000@ops.707979.xyz",
          "2026-04-08T11:58:00.000Z",
        ),
      ])
      .mockResolvedValueOnce([
        buildMessageRow(
          "msg_new",
          mailboxAddresses[60] ?? "box-060@ops.707979.xyz",
          "2026-04-08T11:59:00.000Z",
        ),
      ]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table !== messages) throw new Error("Unexpected table");
          return {
            where: vi.fn(() => ({
              orderBy,
            })),
            orderBy,
          };
        }),
      })),
    };
    getDb.mockReturnValue(db);

    const listed = await listMessagesForUser(
      {} as never,
      adminUser,
      mailboxAddresses,
      null,
    );

    expect(orderBy).toHaveBeenCalledTimes(2);
    expect(listed.map((message) => message.id)).toEqual(["msg_new", "msg_old"]);
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
        buildMessageRow(
          "msg_visible",
          visibleAddress,
          "2026-04-08T11:59:00.000Z",
        ),
      ]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table !== messages) throw new Error("Unexpected table");
          return {
            where: vi.fn(() => ({
              orderBy,
            })),
            orderBy,
          };
        }),
      })),
    };
    getDb.mockReturnValue(db);

    const listed = await listMessagesForUser(
      {} as never,
      adminUser,
      [visibleAddress, "hidden@ops.707979.xyz"],
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
        buildMessageRow(
          "msg_visible",
          reusedAddress,
          "2026-04-08T11:59:00.000Z",
        ),
      ]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table !== messages) throw new Error("Unexpected table");
          return {
            where: vi.fn(() => ({
              orderBy,
            })),
            orderBy,
          };
        }),
      })),
    };
    getDb.mockReturnValue(db);

    const listed = await listMessagesForUser(
      {} as never,
      adminUser,
      [reusedAddress],
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
});
