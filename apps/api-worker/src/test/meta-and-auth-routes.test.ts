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
  CF_ROUTE_RULESET_TAG: "cf-mail",
} as never;

describe("meta and auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listActiveRootDomains.mockResolvedValue(["707979.xyz", "mail.example.net"]);
  });

  it("returns runtime metadata from /api/meta", async () => {
    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/meta"),
      env,
    );
    const payload = (await response.json()) as {
      domains: string[];
      defaultMailboxTtlMinutes: number;
      addressRules: { examples: string[] };
    };

    expect(response.status).toBe(200);
    expect(payload.domains).toContain("707979.xyz");
    expect(payload.defaultMailboxTtlMinutes).toBe(60);
    expect(payload.addressRules.examples[0]).toContain("@alpha.707979.xyz");
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
      env,
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
      env,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
      details: null,
    });
  });
});
