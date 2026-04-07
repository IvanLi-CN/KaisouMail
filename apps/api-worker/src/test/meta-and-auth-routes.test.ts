import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateApiKey } = vi.hoisted(() => ({
  authenticateApiKey: vi.fn(),
}));
const { listActiveRootDomains } = vi.hoisted(() => ({
  listActiveRootDomains: vi.fn(),
}));

vi.mock("../services/bootstrap", () => ({
  ensureBootstrapAdmin: vi.fn(),
  ensureBootstrapDomains: vi.fn(),
}));

vi.mock("../db/client", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("../services/domains", async () => {
  const actual = await vi.importActual<typeof import("../services/domains")>(
    "../services/domains",
  );
  return {
    ...actual,
    listActiveRootDomains,
  };
});

vi.mock("../services/auth", async () => {
  const actual =
    await vi.importActual<typeof import("../services/auth")>(
      "../services/auth",
    );
  return {
    ...actual,
    authenticateApiKey,
  };
});

import { createApp } from "../app";

const env = {
  APP_ENV: "development",
  MAIL_DOMAIN: "707979.xyz",
  CLOUDFLARE_ZONE_ID: "zone_legacy",
  DEFAULT_MAILBOX_TTL_MINUTES: "60",
  CLEANUP_BATCH_SIZE: "3",
  EMAIL_ROUTING_MANAGEMENT_ENABLED: "false",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  SESSION_SECRET: "super-secret-session-key",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
} as const;

describe("meta and auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listActiveRootDomains.mockResolvedValue(["707979.xyz", "mail.example.net"]);
  });

  it("returns runtime metadata from /api/meta", async () => {
    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/meta"),
      env as never,
    );
    const payload = (await response.json()) as {
      domains: string[];
      cloudflareDomainBindingEnabled: boolean;
      cloudflareDomainLifecycleEnabled: boolean;
      defaultMailboxTtlMinutes: number;
      addressRules: { examples: string[] };
    };

    expect(response.status).toBe(200);
    expect(payload.domains).toContain("707979.xyz");
    expect(payload.cloudflareDomainBindingEnabled).toBe(false);
    expect(payload.cloudflareDomainLifecycleEnabled).toBe(false);
    expect(payload.defaultMailboxTtlMinutes).toBe(60);
    expect(payload.addressRules.examples[0]).toContain("@desk.hub.707979.xyz");
  });

  it("keeps Cloudflare lifecycle actions disabled when the runtime token is missing", async () => {
    const app = createApp();
    const response = await app.fetch(new Request("http://localhost/api/meta"), {
      ...env,
      EMAIL_ROUTING_MANAGEMENT_ENABLED: "true",
      CLOUDFLARE_ACCOUNT_ID: "account_123",
    } as never);
    const payload = (await response.json()) as {
      cloudflareDomainBindingEnabled: boolean;
      cloudflareDomainLifecycleEnabled: boolean;
    };

    expect(response.status).toBe(200);
    expect(payload.cloudflareDomainBindingEnabled).toBe(false);
    expect(payload.cloudflareDomainLifecycleEnabled).toBe(false);
  });

  it("returns the unified auth failure envelope for invalid api keys", async () => {
    authenticateApiKey.mockResolvedValue(null);

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          apiKey: "cfm_demo_secret_key",
        }),
      }),
      env as never,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid API key",
      details: null,
    });
  });

  it("returns details:null for unexpected 500 responses", async () => {
    authenticateApiKey.mockRejectedValue(new Error("boom"));

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          apiKey: "cfm_demo_secret_key",
        }),
      }),
      env as never,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
      details: null,
    });
  });

  it("returns ok from /health when runtime config is valid", async () => {
    const app = createApp();
    const response = await app.fetch(new Request("http://localhost/health"), {
      APP_ENV: "development",
      MAIL_DOMAIN: "707979.xyz",
      CLOUDFLARE_ZONE_ID: "zone_legacy",
      DEFAULT_MAILBOX_TTL_MINUTES: "60",
      CLEANUP_BATCH_SIZE: "3",
      EMAIL_ROUTING_MANAGEMENT_ENABLED: "false",
      BOOTSTRAP_ADMIN_NAME: "Ivan",
      SESSION_SECRET: "super-secret-session-key",
      CF_ROUTE_RULESET_TAG: "kaisoumail",
      DB: {
        prepare: () => ({
          first: async () => ({ ok: 1 }),
        }),
      },
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("returns a stable 500 envelope for /health when SESSION_SECRET is missing", async () => {
    const app = createApp();
    const response = await app.fetch(new Request("http://localhost/health"), {
      APP_ENV: "development",
      DEFAULT_MAILBOX_TTL_MINUTES: "60",
      CLEANUP_BATCH_SIZE: "3",
      EMAIL_ROUTING_MANAGEMENT_ENABLED: "false",
      BOOTSTRAP_ADMIN_NAME: "Ivan",
      CF_ROUTE_RULESET_TAG: "kaisoumail",
    } as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
      details: null,
    });
  });

  it("returns a stable 500 envelope plus conservative CORS for /api/version when config is missing", async () => {
    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/version", {
        headers: {
          origin: "https://cfm.707979.xyz",
          "Access-Control-Request-Headers": "Content-Type",
        },
      }),
      {
        APP_ENV: "production",
        DEFAULT_MAILBOX_TTL_MINUTES: "60",
        CLEANUP_BATCH_SIZE: "3",
        EMAIL_ROUTING_MANAGEMENT_ENABLED: "false",
        BOOTSTRAP_ADMIN_NAME: "Ivan",
        CF_ROUTE_RULESET_TAG: "kaisoumail",
        WEB_APP_ORIGIN: "https://cfm.707979.xyz/workspace",
      } as never,
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://cfm.707979.xyz",
    );
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
      details: null,
    });
  });

  it("returns the alias CORS origin for /api/version when WEB_APP_ORIGINS includes km.707979.xyz", async () => {
    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/version", {
        headers: {
          origin: "https://km.707979.xyz",
          "Access-Control-Request-Headers": "Content-Type",
        },
      }),
      {
        APP_ENV: "production",
        DEFAULT_MAILBOX_TTL_MINUTES: "60",
        CLEANUP_BATCH_SIZE: "3",
        EMAIL_ROUTING_MANAGEMENT_ENABLED: "false",
        BOOTSTRAP_ADMIN_NAME: "Ivan",
        CF_ROUTE_RULESET_TAG: "kaisoumail",
        WEB_APP_ORIGINS:
          "https://cfm.707979.xyz, https://km.707979.xyz/workspace",
      } as never,
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://km.707979.xyz",
    );
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
      details: null,
    });
  });

  it("keeps localhost preview CORS on /api/version when SESSION_SECRET is missing", async () => {
    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/version", {
        headers: {
          origin: "http://localhost:4173",
          "Access-Control-Request-Headers": "Content-Type",
        },
      }),
      {
        APP_ENV: "development",
        DEFAULT_MAILBOX_TTL_MINUTES: "60",
        CLEANUP_BATCH_SIZE: "3",
        EMAIL_ROUTING_MANAGEMENT_ENABLED: "false",
        BOOTSTRAP_ADMIN_NAME: "Ivan",
        CF_ROUTE_RULESET_TAG: "kaisoumail",
      } as never,
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:4173",
    );
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
      details: null,
    });
  });

  it("answers API preflight even when runtime config is invalid", async () => {
    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/version", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:4173",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "Authorization",
        },
      }),
      {
        APP_ENV: "development",
        DEFAULT_MAILBOX_TTL_MINUTES: "60",
        CLEANUP_BATCH_SIZE: "3",
        EMAIL_ROUTING_MANAGEMENT_ENABLED: "false",
        BOOTSTRAP_ADMIN_NAME: "Ivan",
        CF_ROUTE_RULESET_TAG: "kaisoumail",
      } as never,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:4173",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "Authorization",
    );
  });
});
