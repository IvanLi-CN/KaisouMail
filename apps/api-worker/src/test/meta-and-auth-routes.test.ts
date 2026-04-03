import { beforeEach, describe, expect, it, vi } from "vitest";

import * as dbClient from "../db/client";
import * as authService from "../services/auth";
import * as bootstrapService from "../services/bootstrap";

vi.spyOn(bootstrapService, "ensureBootstrapAdmin").mockResolvedValue();
vi.spyOn(dbClient, "getDb").mockReturnValue({} as never);

const authenticateApiKey = vi.spyOn(authService, "authenticateApiKey");

const { createApp } = await import("../app");

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

describe("meta and auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns runtime metadata from /api/meta", async () => {
    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/meta"),
      env,
    );
    const payload = (await response.json()) as {
      rootDomain: string;
      defaultMailboxTtlMinutes: number;
      addressRules: { examples: string[] };
    };

    expect(response.status).toBe(200);
    expect(payload.rootDomain).toBe("707979.xyz");
    expect(payload.defaultMailboxTtlMinutes).toBe(60);
    expect(payload.addressRules.examples[0]).toContain("@alpha.707979.xyz");
  });

  it("returns the unified auth failure envelope for invalid api keys", async () => {
    authenticateApiKey.mockResolvedValue(null);

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
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

  it("returns the unified validation envelope for invalid auth payloads", async () => {
    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey: "short",
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid request",
      details: {
        fieldErrors: expect.any(Object),
      },
    });
  });

  it("returns details:null for unexpected 500 responses", async () => {
    authenticateApiKey.mockRejectedValue(new Error("boom"));

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
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
