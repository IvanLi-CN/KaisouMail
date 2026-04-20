import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  bindDomain,
  createDomain,
  createDomainCutoverTask,
  deleteDomain,
  disableDomain,
  listDomainCatalog,
  listDomains,
  retryDomainProvision,
} = vi.hoisted(() => ({
  bindDomain: vi.fn(),
  createDomain: vi.fn(),
  createDomainCutoverTask: vi.fn(),
  deleteDomain: vi.fn(),
  disableDomain: vi.fn(),
  listDomainCatalog: vi.fn(),
  listDomains: vi.fn(),
  retryDomainProvision: vi.fn(),
}));
const { resumeDomainCutoverTaskById } = vi.hoisted(() => ({
  resumeDomainCutoverTaskById: vi.fn(),
}));

vi.mock("../services/bootstrap", () => ({
  ensureBootstrapAdmin: vi.fn(),
  ensureBootstrapDomains: vi.fn(),
}));

vi.mock("../db/client", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("../services/auth", () => ({
  requireAuth: () => async (_c: never, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock("../services/domains", async () => {
  const actual = await vi.importActual<typeof import("../services/domains")>(
    "../services/domains",
  );
  return {
    ...actual,
    bindDomain,
    createDomain,
    deleteDomain,
    disableDomain,
    listDomainCatalog,
    listDomains,
    retryDomainProvision,
  };
});

vi.mock("../services/domain-cutover", async () => {
  const actual = await vi.importActual<
    typeof import("../services/domain-cutover")
  >("../services/domain-cutover");
  return {
    ...actual,
    createDomainCutoverTask,
  };
});

vi.mock("../services/domain-cutover-dispatch", async () => {
  const actual = await vi.importActual<
    typeof import("../services/domain-cutover-dispatch")
  >("../services/domain-cutover-dispatch");
  return {
    ...actual,
    resumeDomainCutoverTaskById,
  };
});

import { createApp } from "../app";
import { ApiError } from "../lib/errors";

const env = {
  APP_ENV: "development",
  DEFAULT_MAILBOX_TTL_MINUTES: "60",
  CLEANUP_BATCH_SIZE: "3",
  SUBDOMAIN_CLEANUP_BATCH_SIZE: "1",
  EMAIL_ROUTING_MANAGEMENT_ENABLED: "false",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  SESSION_SECRET: "super-secret-session-key",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
} as never;

describe("domain routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the merged Cloudflare catalog from /api/domains/catalog", async () => {
    listDomainCatalog.mockResolvedValue({
      domains: [
        {
          id: null,
          rootDomain: "ops.example.org",
          zoneId: "zone_available",
          bindingSource: null,
          cloudflareAvailability: "available",
          cloudflareStatus: "pending",
          nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
          projectStatus: "not_enabled",
          catchAllEnabled: false,
          lastProvisionError: null,
          createdAt: null,
          updatedAt: null,
          lastProvisionedAt: null,
          disabledAt: null,
        },
      ],
      cloudflareSync: {
        status: "live",
        retryAfter: null,
        retryAfterSeconds: null,
        rateLimitContext: null,
      },
    });

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/domains/catalog"),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      domains: [
        {
          id: null,
          mailDomain: "ops.example.org",
          rootDomain: "ops.example.org",
          zoneId: "zone_available",
          bindingSource: null,
          cloudflareAvailability: "available",
          cloudflareStatus: "pending",
          nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
          projectStatus: "not_enabled",
          catchAllEnabled: false,
          lastProvisionError: null,
          createdAt: null,
          updatedAt: null,
          lastProvisionedAt: null,
          disabledAt: null,
        },
      ],
      cloudflareSync: {
        status: "live",
        retryAfter: null,
        retryAfterSeconds: null,
        rateLimitContext: null,
      },
    });
  });

  it("creates project-bound domains from /api/domains/bind", async () => {
    bindDomain.mockResolvedValue({
      created: true,
      domain: {
        id: "dom_bound",
        rootDomain: "example.org",
        zoneId: "zone_bound",
        bindingSource: "project_bind",
        status: "provisioning_error",
        catchAllEnabled: false,
        lastProvisionError: "Zone is pending activation",
        createdAt: "2026-04-06T07:00:00.000Z",
        updatedAt: "2026-04-06T07:00:00.000Z",
        lastProvisionedAt: null,
        disabledAt: null,
      },
    });

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/domains/bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mailDomain: "example.org" }),
      }),
      env,
    );

    expect(bindDomain).toHaveBeenCalledWith(
      env,
      expect.any(Object),
      expect.objectContaining({
        mailDomain: "example.org",
        rootDomain: "example.org",
      }),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: "dom_bound",
      mailDomain: "example.org",
      rootDomain: "example.org",
      bindingSource: "project_bind",
    });
  });

  it("returns structured guidance when /api/domains/bind rejects direct subdomain binding", async () => {
    bindDomain.mockRejectedValue(
      new ApiError(400, "Direct subdomain binding is not supported", {
        code: "subdomain_direct_bind_not_supported",
        mailDomain: "mail.customer.com",
        recommendedApex: "customer.com",
        recommendedMailboxSubdomain: "mail",
      }),
    );

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/domains/bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mailDomain: "mail.customer.com" }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Direct subdomain binding is not supported",
      details: {
        code: "subdomain_direct_bind_not_supported",
        mailDomain: "mail.customer.com",
        recommendedApex: "customer.com",
        recommendedMailboxSubdomain: "mail",
      },
    });
  });

  it("accepts mailDomain when enabling a discovered catalog domain", async () => {
    createDomain.mockResolvedValue({
      created: true,
      domain: {
        id: "dom_catalog",
        rootDomain: "mail.customer.com",
        zoneId: "zone_mail_customer_com",
        bindingSource: "catalog",
        status: "active",
        catchAllEnabled: false,
        lastProvisionError: null,
        createdAt: "2026-04-06T07:00:00.000Z",
        updatedAt: "2026-04-06T07:00:00.000Z",
        lastProvisionedAt: "2026-04-06T07:00:00.000Z",
        disabledAt: null,
      },
    });

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mailDomain: "mail.customer.com",
          zoneId: "zone_mail_customer_com",
        }),
      }),
      env,
    );

    expect(createDomain).toHaveBeenCalledWith(
      env,
      expect.any(Object),
      expect.objectContaining({
        mailDomain: "mail.customer.com",
        rootDomain: "mail.customer.com",
        zoneId: "zone_mail_customer_com",
      }),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: "dom_catalog",
      mailDomain: "mail.customer.com",
      rootDomain: "mail.customer.com",
      bindingSource: "catalog",
    });
  });

  it("returns 204 from /api/domains/:id/delete", async () => {
    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/domains/dom_bound/delete", {
        method: "POST",
      }),
      env,
    );

    expect(deleteDomain).toHaveBeenCalledWith(
      env,
      expect.any(Object),
      "dom_bound",
    );
    expect(response.status).toBe(204);
  });

  it("enqueues async catch-all enable tasks from /api/domains/:id/catch-all/enable", async () => {
    createDomainCutoverTask.mockResolvedValue({ id: "task_enable" });
    resumeDomainCutoverTaskById.mockResolvedValue({ id: "task_enable" });
    const waitUntil = vi.fn();

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/domains/dom_bound/catch-all/enable", {
        method: "POST",
      }),
      env,
      { waitUntil } as unknown as ExecutionContext,
    );

    expect(createDomainCutoverTask).toHaveBeenCalledWith(
      env,
      expect.any(Object),
      {
        action: "enable",
        domainId: "dom_bound",
        requestedByUserId: null,
      },
    );
    expect(resumeDomainCutoverTaskById).toHaveBeenCalledWith(
      env,
      expect.any(Object),
      "task_enable",
    );
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ taskId: "task_enable" });
  });

  it("enqueues async catch-all disable tasks from /api/domains/:id/catch-all/disable", async () => {
    createDomainCutoverTask.mockResolvedValue({ id: "task_disable" });
    resumeDomainCutoverTaskById.mockResolvedValue({ id: "task_disable" });
    const waitUntil = vi.fn();

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/domains/dom_bound/catch-all/disable", {
        method: "POST",
      }),
      env,
      { waitUntil } as unknown as ExecutionContext,
    );

    expect(createDomainCutoverTask).toHaveBeenCalledWith(
      env,
      expect.any(Object),
      {
        action: "disable",
        domainId: "dom_bound",
        requestedByUserId: null,
      },
    );
    expect(resumeDomainCutoverTaskById).toHaveBeenCalledWith(
      env,
      expect.any(Object),
      "task_disable",
    );
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ taskId: "task_disable" });
  });
});
