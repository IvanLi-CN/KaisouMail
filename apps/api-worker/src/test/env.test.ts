import { describe, expect, it } from "vitest";

import {
  parseRuntimeConfig,
  REQUIRED_RUNTIME_SECRETS,
  resolveConfiguredWebAppOrigin,
  safeParseRuntimeConfig,
} from "../env";

const baseEnv = {
  APP_ENV: "development",
  DEFAULT_MAILBOX_TTL_MINUTES: "60",
  CLEANUP_BATCH_SIZE: "3",
  EMAIL_ROUTING_MANAGEMENT_ENABLED: "false",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  SESSION_SECRET: "super-secret-session-key",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
} as const;

describe("runtime config parsing", () => {
  it("declares SESSION_SECRET as the only hard-required runtime secret", () => {
    expect(REQUIRED_RUNTIME_SECRETS).toEqual(["SESSION_SECRET"]);
  });

  it("prefers CLOUDFLARE_RUNTIME_API_TOKEN over the shared token", () => {
    const config = parseRuntimeConfig({
      ...baseEnv,
      CLOUDFLARE_API_TOKEN: "shared-token",
      CLOUDFLARE_RUNTIME_API_TOKEN: "runtime-token",
    } as never);

    expect(config.CLOUDFLARE_API_TOKEN).toBe("runtime-token");
    expect(config.CLOUDFLARE_RUNTIME_API_TOKEN).toBe("runtime-token");
  });

  it("falls back to CLOUDFLARE_API_TOKEN when no runtime token is provided", () => {
    const config = parseRuntimeConfig({
      ...baseEnv,
      CLOUDFLARE_API_TOKEN: "shared-token",
    } as never);

    expect(config.CLOUDFLARE_API_TOKEN).toBe("shared-token");
    expect(config.CLOUDFLARE_RUNTIME_API_TOKEN).toBeUndefined();
  });

  it("parses without BOOTSTRAP_ADMIN_API_KEY when bootstrap is disabled", () => {
    const result = safeParseRuntimeConfig({
      ...baseEnv,
      BOOTSTRAP_ADMIN_EMAIL: undefined,
      BOOTSTRAP_ADMIN_API_KEY: undefined,
    } as never);

    expect(result.success).toBe(true);
  });

  it("fails fast when SESSION_SECRET is missing", () => {
    const result = safeParseRuntimeConfig({
      APP_ENV: "development",
      DEFAULT_MAILBOX_TTL_MINUTES: "60",
      CLEANUP_BATCH_SIZE: "3",
      EMAIL_ROUTING_MANAGEMENT_ENABLED: "false",
      BOOTSTRAP_ADMIN_NAME: "Ivan",
      CF_ROUTE_RULESET_TAG: "kaisoumail",
    } as never);

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected config parse to fail");
    }

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["SESSION_SECRET"],
        }),
      ]),
    );
  });

  it("normalizes a valid WEB_APP_ORIGIN to its origin form", () => {
    expect(
      resolveConfiguredWebAppOrigin({
        WEB_APP_ORIGIN: "https://cfm.707979.xyz/login",
      }),
    ).toBe("https://cfm.707979.xyz");
  });

  it("ignores an invalid WEB_APP_ORIGIN when computing fallback CORS", () => {
    expect(
      resolveConfiguredWebAppOrigin({
        WEB_APP_ORIGIN: "not-a-valid-url",
      }),
    ).toBeUndefined();
  });
});
