import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("../db/client", () => ({
  getDb,
}));

import { filterMailboxesForWorkspaceScope } from "@kaisoumail/shared";
import { mailboxes, messages } from "../db/schema";
import { listMailboxesForUser } from "../services/mailboxes";

const adminUser = {
  id: "usr_admin",
  email: "admin@example.com",
  name: "Admin",
  role: "admin" as const,
};

const buildMailbox = (
  index: number,
  overrides: Record<string, unknown> = {},
) => ({
  id: `mbx_${index.toString().padStart(3, "0")}`,
  userId: adminUser.id,
  domainId: null,
  localPart: `box${index.toString().padStart(3, "0")}`,
  subdomain: "ops",
  address: `box${index.toString().padStart(3, "0")}@ops.707979.xyz`,
  source: "registered",
  routingRuleId: null,
  status: "active",
  createdAt: `2026-04-08T10:${(index % 60).toString().padStart(2, "0")}:00.000Z`,
  expiresAt: "2026-04-08T12:00:00.000Z",
  destroyedAt: null,
  ...overrides,
});

describe("mailbox listing helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps active and destroying mailboxes, excludes expired, and limits destroyed workspace history", () => {
    const rows = [
      buildMailbox(0, { status: "active" }),
      buildMailbox(1, { status: "destroying" }),
      buildMailbox(2, { status: "expired" }),
      ...Array.from({ length: 55 }, (_, index) =>
        buildMailbox(index + 10, {
          status: "destroyed",
          destroyedAt: `2026-04-08T11:${String(index).padStart(2, "0")}:00.000Z`,
        }),
      ),
      buildMailbox(999, {
        status: "destroyed",
        destroyedAt: "2026-03-28T12:00:00.000Z",
      }),
      buildMailbox(1000, {
        status: "destroyed",
        destroyedAt: null,
      }),
    ];

    const visible = filterMailboxesForWorkspaceScope(
      rows,
      "2026-04-08T12:00:00.000Z",
    );

    expect(
      visible.some((row: (typeof rows)[number]) => row.id === "mbx_000"),
    ).toBe(true);
    expect(
      visible.some((row: (typeof rows)[number]) => row.id === "mbx_001"),
    ).toBe(true);
    expect(
      visible.some((row: (typeof rows)[number]) => row.id === "mbx_002"),
    ).toBe(false);
    expect(
      visible.filter(
        (row: (typeof rows)[number]) => row.status === "destroyed",
      ),
    ).toHaveLength(50);
    expect(
      visible.some((row: (typeof rows)[number]) => row.id === "mbx_999"),
    ).toBe(false);
    expect(
      visible.some((row: (typeof rows)[number]) => row.id === "mbx_1000"),
    ).toBe(false);
    expect(
      visible.some((row: (typeof rows)[number]) => row.id === "mbx_064"),
    ).toBe(true);
    expect(
      visible.some((row: (typeof rows)[number]) => row.id === "mbx_010"),
    ).toBe(false);
    expect(
      visible
        .filter((row: (typeof rows)[number]) => row.status === "destroyed")
        .map((row: (typeof rows)[number]) => row.id)
        .slice(0, 3),
    ).toEqual(["mbx_064", "mbx_063", "mbx_062"]);
    expect(visible.at(-1)?.id).toBe("mbx_015");
  });

  it("can filter the full mailbox list by expired status", async () => {
    const rows = [
      buildMailbox(0, { status: "active" }),
      buildMailbox(1, { status: "expired" }),
      buildMailbox(2, {
        status: "destroyed",
        destroyedAt: "2026-04-08T11:00:00.000Z",
      }),
    ];
    const orderBy = vi.fn(async () => rows);
    const db = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table === mailboxes) {
            return {
              orderBy,
              where: vi.fn(() => ({
                orderBy,
                limit: vi.fn(async () => rows),
              })),
            };
          }

          if (table === messages) {
            return {
              where: vi.fn(() => ({
                orderBy: vi.fn(async () => []),
              })),
            };
          }

          throw new Error("Unexpected table");
        }),
      })),
    };
    getDb.mockReturnValue(db);

    const listed = await listMailboxesForUser(
      {} as never,
      adminUser,
      "default",
      ["expired"],
    );

    expect(listed.map((mailbox) => mailbox.id)).toEqual(["mbx_001"]);
  });

  it("loads mailbox recency in batches of 50 ids", async () => {
    const rows = Array.from({ length: 70 }, (_, index) => buildMailbox(index));
    const recentOrderBy = vi
      .fn()
      .mockResolvedValueOnce([
        {
          mailboxId: "mbx_000",
          receivedAt: "2026-04-08T11:58:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          mailboxId: "mbx_060",
          receivedAt: "2026-04-08T11:59:00.000Z",
        },
      ]);
    const db = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table === mailboxes) {
            return {
              orderBy: vi.fn(async () => rows),
              where: vi.fn(() => ({
                orderBy: vi.fn(async () => rows),
                limit: vi.fn(async () => rows),
              })),
            };
          }

          if (table === messages) {
            return {
              where: vi.fn(() => ({
                orderBy: recentOrderBy,
              })),
            };
          }

          throw new Error("Unexpected table");
        }),
      })),
    };
    getDb.mockReturnValue(db);

    const listed = await listMailboxesForUser({} as never, adminUser);

    expect(recentOrderBy).toHaveBeenCalledTimes(2);
    expect(listed).toHaveLength(70);
    expect(listed[0]?.lastReceivedAt).toBe("2026-04-08T11:58:00.000Z");
    expect(listed[60]?.lastReceivedAt).toBe("2026-04-08T11:59:00.000Z");
  });

  it("does not hydrate lastReceivedAt for destroying mailboxes", async () => {
    const rows = [buildMailbox(1, { status: "destroying" })];
    const orderBy = vi.fn();
    const db = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table === mailboxes) {
            return {
              orderBy: vi.fn(async () => rows),
              where: vi.fn(() => ({
                orderBy: vi.fn(async () => rows),
                limit: vi.fn(async () => rows),
              })),
            };
          }

          if (table === messages) {
            return {
              where: vi.fn(() => ({
                orderBy,
              })),
            };
          }

          throw new Error("Unexpected table");
        }),
      })),
    };
    getDb.mockReturnValue(db);

    const [listed] = await listMailboxesForUser({} as never, adminUser);

    expect(orderBy).not.toHaveBeenCalled();
    expect(listed?.status).toBe("destroying");
    expect(listed?.lastReceivedAt).toBeNull();
  });
});
