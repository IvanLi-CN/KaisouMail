import { mailboxSchema } from "@cf-mail/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMailboxForUser, ensureMailboxForUser, resolveMailboxForUser } =
  vi.hoisted(() => ({
    createMailboxForUser: vi.fn(),
    ensureMailboxForUser: vi.fn(),
    resolveMailboxForUser: vi.fn(),
  }));

vi.mock("../services/auth", () => ({
  requireAuth:
    () =>
    async (
      c: { set: (key: string, value: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set("authUser", {
        id: "usr_1",
        email: "owner@example.com",
        name: "Owner",
        role: "member",
      });
      await next();
    },
}));

vi.mock("../services/mailboxes", () => ({
  createMailboxForUser,
  destroyMailbox: vi.fn(),
  ensureMailboxForUser,
  getMailboxForUser: vi.fn(),
  listMailboxesForUser: vi.fn(),
  resolveMailboxForUser,
}));

import { mailboxRoutes } from "../routes/mailboxes";

const env = {
  APP_ENV: "development",
  MAIL_DOMAIN: "707979.xyz",
  DEFAULT_MAILBOX_TTL_MINUTES: "60",
  CLEANUP_BATCH_SIZE: "3",
  EMAIL_ROUTING_MANAGEMENT_ENABLED: "false",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  SESSION_SECRET: "super-secret-session-key",
  CF_ROUTE_RULESET_TAG: "cf-mail",
} as never;

const activeMailbox = mailboxSchema.parse({
  id: "mbx_alpha",
  userId: "usr_1",
  localPart: "build",
  subdomain: "alpha",
  rootDomain: "707979.xyz",
  address: "build@alpha.707979.xyz",
  status: "active",
  createdAt: "2026-04-03T12:00:00.000Z",
  lastReceivedAt: null,
  expiresAt: "2026-04-03T13:00:00.000Z",
  destroyedAt: null,
  routingRuleId: "rule_alpha",
});

describe("mailbox routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 when ensure creates a mailbox", async () => {
    ensureMailboxForUser.mockResolvedValue({
      mailbox: activeMailbox,
      created: true,
    });

    const response = await mailboxRoutes.fetch(
      new Request("http://localhost/ensure", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          address: activeMailbox.address,
        }),
      }),
      env,
    );

    expect(response.status).toBe(201);
  });

  it("allows mailbox creation without an explicit root domain", async () => {
    createMailboxForUser.mockResolvedValue(activeMailbox);

    const response = await mailboxRoutes.fetch(
      new Request("http://localhost/", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          localPart: "build",
          subdomain: "alpha",
          expiresInMinutes: 60,
        }),
      }),
      env,
    );

    expect(response.status).toBe(201);
    expect(createMailboxForUser).toHaveBeenCalledWith(
      env,
      expect.any(Object),
      expect.objectContaining({ id: "usr_1" }),
      expect.objectContaining({
        localPart: "build",
        subdomain: "alpha",
        expiresInMinutes: 60,
      }),
    );
  });

  it("returns 200 when ensure reuses an active mailbox", async () => {
    ensureMailboxForUser.mockResolvedValue({
      mailbox: activeMailbox,
      created: false,
    });

    const response = await mailboxRoutes.fetch(
      new Request("http://localhost/ensure", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          localPart: "build",
          subdomain: "alpha",
          rootDomain: "707979.xyz",
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);
  });

  it("allows ensure without an explicit root domain for localPart/subdomain", async () => {
    ensureMailboxForUser.mockResolvedValue({
      mailbox: activeMailbox,
      created: false,
    });

    const response = await mailboxRoutes.fetch(
      new Request("http://localhost/ensure", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          localPart: "build",
          subdomain: "alpha",
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);
  });

  it("rejects invalid ensure bodies", async () => {
    const response = await mailboxRoutes.fetch(
      new Request("http://localhost/ensure", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          address: activeMailbox.address,
          localPart: "build",
          subdomain: "alpha",
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
  });

  it("rejects invalid resolve queries before hitting the service", async () => {
    const response = await mailboxRoutes.fetch(
      new Request("http://localhost/resolve?address=not-an-email"),
      env,
    );

    expect(resolveMailboxForUser).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });
});
