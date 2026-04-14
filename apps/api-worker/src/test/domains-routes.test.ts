import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  bindDomain,
  createDomain,
  deleteDomain,
  disableDomain,
  disableDomainCatchAll,
  enableDomainCatchAll,
  listDomainCatalog,
  listDomains,
  retryDomainProvision,
} = vi.hoisted(() => ({
  bindDomain: vi.fn(),
  createDomain: vi.fn(),
  deleteDomain: vi.fn(),
  disableDomain: vi.fn(),
  disableDomainCatchAll: vi.fn(),
  enableDomainCatchAll: vi.fn(),
  listDomainCatalog: vi.fn(),
  listDomains: vi.fn(),
  retryDomainProvision: vi.fn(),
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
    disableDomainCatchAll,
    enableDomainCatchAll,
    listDomainCatalog,
    listDomains,
    retryDomainProvision,
  };
});

import { createApp } from "../app";

const env = {
  APP_ENV: "development",
  DEFAULT_MAILBOX_TTL_MINUTES: "60",
  CLEANUP_BATCH_SIZE: "3",
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
      },
    });
  });

  it("creates project-bound domains from /api/domains/bind", async () => {
    bindDomain.mockResolvedValue({
      created: true,
      domain: {
        id: "dom_bound",
        rootDomain: "bound.example.org",
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
        body: JSON.stringify({ rootDomain: "bound.example.org" }),
      }),
      env,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: "dom_bound",
      rootDomain: "bound.example.org",
      bindingSource: "project_bind",
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

  it("enables catch-all from /api/domains/:id/catch-all/enable", async () => {
    enableDomainCatchAll.mockResolvedValue({
      id: "dom_bound",
      rootDomain: "bound.example.org",
      zoneId: "zone_bound",
      bindingSource: "project_bind",
      status: "active",
      catchAllEnabled: true,
      lastProvisionError: null,
      createdAt: "2026-04-06T07:00:00.000Z",
      updatedAt: "2026-04-06T07:05:00.000Z",
      lastProvisionedAt: "2026-04-06T07:00:00.000Z",
      disabledAt: null,
    });

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/domains/dom_bound/catch-all/enable", {
        method: "POST",
      }),
      env,
    );

    expect(enableDomainCatchAll).toHaveBeenCalledWith(
      env,
      expect.any(Object),
      "dom_bound",
      undefined,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "dom_bound",
      catchAllEnabled: true,
    });
  });

  it("disables catch-all from /api/domains/:id/catch-all/disable", async () => {
    disableDomainCatchAll.mockResolvedValue({
      id: "dom_bound",
      rootDomain: "bound.example.org",
      zoneId: "zone_bound",
      bindingSource: "project_bind",
      status: "active",
      catchAllEnabled: false,
      lastProvisionError: null,
      createdAt: "2026-04-06T07:00:00.000Z",
      updatedAt: "2026-04-06T07:06:00.000Z",
      lastProvisionedAt: "2026-04-06T07:00:00.000Z",
      disabledAt: null,
    });

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/domains/dom_bound/catch-all/disable", {
        method: "POST",
      }),
      env,
    );

    expect(disableDomainCatchAll).toHaveBeenCalledWith(
      env,
      expect.any(Object),
      "dom_bound",
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "dom_bound",
      catchAllEnabled: false,
    });
  });
});
