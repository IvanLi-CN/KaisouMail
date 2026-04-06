import { describe, expect, it } from "vitest";

import { parseRuntimeConfig } from "../env";
import {
  applyCorsHeaders,
  resolveAllowedCorsOrigin,
  resolveAllowedCorsOriginFromEnv,
} from "../lib/cors";

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
        CF_ROUTE_RULESET_TAG: "kaisoumail",
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
        CF_ROUTE_RULESET_TAG: "kaisoumail",
      }),
    ).toBe("http://localhost:4173");
  });

  it("allows production requests when WEB_APP_ORIGIN includes a path", () => {
    const config = parseRuntimeConfig({
      APP_ENV: "production",
      DEFAULT_MAILBOX_TTL_MINUTES: "60",
      CLEANUP_BATCH_SIZE: "3",
      EMAIL_ROUTING_MANAGEMENT_ENABLED: "false",
      BOOTSTRAP_ADMIN_NAME: "Ivan",
      SESSION_SECRET: "super-secret-session-key",
      CF_ROUTE_RULESET_TAG: "kaisoumail",
      WEB_APP_ORIGIN: "https://cfm.707979.xyz/workspace",
    } as never);

    expect(resolveAllowedCorsOrigin("https://cfm.707979.xyz", config)).toBe(
      "https://cfm.707979.xyz",
    );
  });

  it("keeps localhost preview CORS when runtime config is invalid", () => {
    expect(
      resolveAllowedCorsOriginFromEnv("http://localhost:4173", {
        APP_ENV: "development",
      }),
    ).toBe("http://localhost:4173");
  });

  it("ignores invalid WEB_APP_ORIGIN values in fallback CORS resolution", () => {
    expect(
      resolveAllowedCorsOriginFromEnv("https://cfm.707979.xyz", {
        APP_ENV: "production",
        WEB_APP_ORIGIN: "not-a-valid-url",
      }),
    ).toBeNull();
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
        CF_ROUTE_RULESET_TAG: "kaisoumail",
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
