import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createDomain,
  disableDomain,
  listDomainCatalog,
  listDomains,
  retryDomainProvision,
} = vi.hoisted(() => ({
  createDomain: vi.fn(),
  disableDomain: vi.fn(),
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
    createDomain,
    disableDomain,
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
  CF_ROUTE_RULESET_TAG: "cf-mail",
} as never;

describe("domain routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the merged Cloudflare catalog from /api/domains/catalog", async () => {
    listDomainCatalog.mockResolvedValue([
      {
        id: null,
        rootDomain: "ops.example.org",
        zoneId: "zone_available",
        cloudflareAvailability: "available",
        projectStatus: "not_enabled",
        lastProvisionError: null,
        createdAt: null,
        updatedAt: null,
        lastProvisionedAt: null,
        disabledAt: null,
      },
    ]);

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
          cloudflareAvailability: "available",
          projectStatus: "not_enabled",
          lastProvisionError: null,
          createdAt: null,
          updatedAt: null,
          lastProvisionedAt: null,
          disabledAt: null,
        },
      ],
    });
  });
});
