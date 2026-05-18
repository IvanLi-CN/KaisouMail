import { mailboxSchema } from "@kaisoumail/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createMailboxForUser,
  ensureMailboxForUser,
  listMailboxesForUser,
  resolveMailboxForUser,
  resetMailboxTtlForUser,
  updateMailboxTagsForUser,
} = vi.hoisted(() => ({
  createMailboxForUser: vi.fn(),
  ensureMailboxForUser: vi.fn(),
  listMailboxesForUser: vi.fn(),
  resolveMailboxForUser: vi.fn(),
  resetMailboxTtlForUser: vi.fn(),
  updateMailboxTagsForUser: vi.fn(),
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
      c.set("authContext", {
        method: "web",
        apiKey: null,
      });
      await next();
    },
}));

vi.mock("../services/mailboxes", () => ({
  createMailboxForUser,
  destroyMailbox: vi.fn(),
  ensureMailboxForUser,
  getMailboxForUser: vi.fn(),
  listMailboxesForUser,
  resolveMailboxForUser,
  resetMailboxTtlForUser,
  updateMailboxTagsForUser,
}));

import { mailboxRoutes } from "../routes/mailboxes";

const env = {
  APP_ENV: "development",
  MAIL_DOMAIN: "707979.xyz",
  DEFAULT_MAILBOX_TTL_MINUTES: "60",
  CLEANUP_BATCH_SIZE: "3",
  SUBDOMAIN_CLEANUP_BATCH_SIZE: "1",
  EMAIL_ROUTING_MANAGEMENT_ENABLED: "false",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  SESSION_SECRET: "super-secret-session-key",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
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
  source: "registered",
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

  it("passes workspace scope to mailbox listing", async () => {
    listMailboxesForUser.mockResolvedValue([activeMailbox]);

    const response = await mailboxRoutes.fetch(
      new Request("http://localhost/?scope=workspace"),
      env,
    );

    expect(response.status).toBe(200);
    expect(listMailboxesForUser).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: "usr_1" }),
      "workspace",
      undefined,
      undefined,
    );
  });

  it("passes status filters to mailbox listing", async () => {
    listMailboxesForUser.mockResolvedValue([activeMailbox]);

    const response = await mailboxRoutes.fetch(
      new Request("http://localhost/?status=expired&status=destroying"),
      env,
    );

    expect(response.status).toBe(200);
    expect(listMailboxesForUser).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: "usr_1" }),
      "default",
      ["expired", "destroying"],
      undefined,
    );
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
      expect.objectContaining({ method: "web" }),
    );
  });

  it("accepts mailDomain as the canonical mailbox creation field", async () => {
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
          mailDomain: "707979.xyz",
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
        mailDomain: "707979.xyz",
        rootDomain: "707979.xyz",
      }),
      expect.objectContaining({ method: "web" }),
    );
  });

  it("passes unlimited TTL through mailbox creation", async () => {
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
          expiresInMinutes: null,
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
        expiresInMinutes: null,
      }),
      expect.objectContaining({ method: "web" }),
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

  it("accepts mailDomain for segmented ensure requests", async () => {
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
          mailDomain: "707979.xyz",
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(ensureMailboxForUser).toHaveBeenCalledWith(
      env,
      expect.any(Object),
      expect.objectContaining({ id: "usr_1" }),
      expect.objectContaining({
        mailDomain: "707979.xyz",
        rootDomain: "707979.xyz",
      }),
      expect.objectContaining({ method: "web" }),
    );
  });

  it("passes tag filters to mailbox listing", async () => {
    listMailboxesForUser.mockResolvedValue([activeMailbox]);

    const response = await mailboxRoutes.fetch(
      new Request("http://localhost/?tag=ci&tag=ops"),
      env,
    );

    expect(response.status).toBe(200);
    expect(listMailboxesForUser).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: "usr_1" }),
      "default",
      undefined,
      ["ci", "ops"],
    );
  });

  it("passes tag updates to the mailbox service", async () => {
    updateMailboxTagsForUser.mockResolvedValue({
      ...activeMailbox,
      tags: ["ci", "ops"],
    });

    const response = await mailboxRoutes.fetch(
      new Request("http://localhost/mbx_alpha/tags", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tags: ["CI", "ops", "ci"],
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(updateMailboxTagsForUser).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: "usr_1" }),
      "mbx_alpha",
      { tags: ["ci", "ops"] },
    );
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

  it("passes TTL reset requests to the mailbox service", async () => {
    resetMailboxTtlForUser.mockResolvedValue({
      ...activeMailbox,
      expiresAt: "2026-04-03T14:00:00.000Z",
    });

    const response = await mailboxRoutes.fetch(
      new Request("http://localhost/mbx_alpha/ttl", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          expiresInMinutes: 120,
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(resetMailboxTtlForUser).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: "usr_1" }),
      "mbx_alpha",
      { expiresInMinutes: 120 },
    );
  });

  it("accepts long-term TTL reset requests", async () => {
    resetMailboxTtlForUser.mockResolvedValue({
      ...activeMailbox,
      expiresAt: null,
    });

    const response = await mailboxRoutes.fetch(
      new Request("http://localhost/mbx_alpha/ttl", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          expiresInMinutes: null,
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(resetMailboxTtlForUser).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: "usr_1" }),
      "mbx_alpha",
      { expiresInMinutes: null },
    );
  });
});
