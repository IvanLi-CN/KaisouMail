import { mailboxSchema } from "@cf-mail/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authService from "../services/auth";
import * as mailboxService from "../services/mailboxes";

const authUser = {
  id: "usr_1",
  email: "owner@example.com",
  name: "Owner",
  role: "member" as const,
};

vi.spyOn(authService, "requireAuth").mockImplementation(
  () =>
    async (
      c: { set: (key: string, value: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set("authUser", authUser);
      await next();
    },
);

const createMailboxForUser = vi.spyOn(mailboxService, "createMailboxForUser");
vi.spyOn(mailboxService, "destroyMailbox").mockImplementation(vi.fn());
const ensureMailboxForUser = vi.spyOn(mailboxService, "ensureMailboxForUser");
vi.spyOn(mailboxService, "getMailboxForUser").mockImplementation(vi.fn());
vi.spyOn(mailboxService, "listMailboxesForUser").mockImplementation(vi.fn());
const resolveMailboxForUser = vi.spyOn(mailboxService, "resolveMailboxForUser");

const { mailboxRoutes } = await import("../routes/mailboxes");

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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: activeMailbox.address }),
      }),
      env,
    );

    expect(response.status).toBe(201);
  });

  it("returns 200 when ensure reuses an active mailbox", async () => {
    ensureMailboxForUser.mockResolvedValue({
      mailbox: activeMailbox,
      created: false,
    });

    const response = await mailboxRoutes.fetch(
      new Request("http://localhost/ensure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          localPart: "build",
          subdomain: "alpha",
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);
  });

  it("allows mailbox creation without extra lookup fields", async () => {
    createMailboxForUser.mockResolvedValue(activeMailbox);

    const response = await mailboxRoutes.fetch(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "content-type": "application/json" },
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
      authUser,
      expect.objectContaining({
        localPart: "build",
        subdomain: "alpha",
        expiresInMinutes: 60,
      }),
    );
  });

  it("rejects invalid ensure bodies", async () => {
    const response = await mailboxRoutes.fetch(
      new Request("http://localhost/ensure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: activeMailbox.address,
          localPart: "build",
          subdomain: "alpha",
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid request",
      details: {
        formErrors: expect.any(Array),
      },
    });
  });

  it("rejects invalid resolve queries before hitting the service", async () => {
    const response = await mailboxRoutes.fetch(
      new Request("http://localhost/resolve?address=not-an-email"),
      env,
    );

    expect(resolveMailboxForUser).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid request",
      details: {
        fieldErrors: expect.any(Object),
      },
    });
  });
});
