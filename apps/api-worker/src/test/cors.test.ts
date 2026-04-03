import { describe, expect, it } from "vitest";

import { applyCorsHeaders, resolveAllowedCorsOrigin } from "../lib/cors";

describe("cors helpers", () => {
  it("allows the configured production web origin", () => {
    expect(
      resolveAllowedCorsOrigin("https://cfm.707979.xyz", {
        APP_ENV: "production",
        WEB_APP_ORIGIN: "https://cfm.707979.xyz",
        DEFAULT_MAILBOX_TTL_MINUTES: 60,
        CLEANUP_BATCH_SIZE: 3,
        EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
        SESSION_SECRET: "super-secret-session-key",
        BOOTSTRAP_ADMIN_NAME: "Ivan",
        CF_ROUTE_RULESET_TAG: "cf-mail",
      }),
    ).toBe("https://cfm.707979.xyz");
  });

  it("allows configured local preview origins outside production", () => {
    expect(
      resolveAllowedCorsOrigin("http://localhost:4173", {
        APP_ENV: "development",
        DEFAULT_MAILBOX_TTL_MINUTES: 60,
        CLEANUP_BATCH_SIZE: 3,
        EMAIL_ROUTING_MANAGEMENT_ENABLED: false,
        SESSION_SECRET: "super-secret-session-key",
        BOOTSTRAP_ADMIN_NAME: "Ivan",
        CF_ROUTE_RULESET_TAG: "cf-mail",
      }),
    ).toBe("http://localhost:4173");
  });

  it("rejects unrelated origins", () => {
    expect(
      resolveAllowedCorsOrigin("https://evil.example.com", {
        APP_ENV: "production",
        WEB_APP_ORIGIN: "https://cfm.707979.xyz",
        DEFAULT_MAILBOX_TTL_MINUTES: 60,
        CLEANUP_BATCH_SIZE: 3,
        EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
        SESSION_SECRET: "super-secret-session-key",
        BOOTSTRAP_ADMIN_NAME: "Ivan",
        CF_ROUTE_RULESET_TAG: "cf-mail",
      }),
    ).toBeNull();
  });

  it("writes credentialed CORS headers when origin is allowed", () => {
    const headers = new Headers();
    applyCorsHeaders(headers, "https://cfm.707979.xyz", "Content-Type");
    expect(headers.get("Access-Control-Allow-Origin")).toBe(
      "https://cfm.707979.xyz",
    );
    expect(headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
  });
});
