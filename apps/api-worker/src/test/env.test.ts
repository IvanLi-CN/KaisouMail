import { describe, expect, it } from "vitest";

import {
  parseRuntimeConfig,
  REQUIRED_RUNTIME_SECRETS,
  resolveConfiguredWebAppOrigin,
  resolveConfiguredWebAppOrigins,
  safeParseRuntimeConfig,
} from "../env";

const baseEnv = {
  APP_ENV: "development",
  DEFAULT_MAILBOX_TTL_MINUTES: "60",
  CLEANUP_BATCH_SIZE: "3",
  SUBDOMAIN_CLEANUP_BATCH_SIZE: "1",
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
      SUBDOMAIN_CLEANUP_BATCH_SIZE: "1",
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

  it("normalizes WEB_APP_ORIGINS into a de-duplicated origin list", () => {
    expect(
      resolveConfiguredWebAppOrigins({
        WEB_APP_ORIGIN: "https://cfm.707979.xyz/login",
        WEB_APP_ORIGINS:
          "https://km.707979.xyz/workspace, https://cfm.707979.xyz, not-a-valid-url",
      }),
    ).toEqual(["https://cfm.707979.xyz", "https://km.707979.xyz"]);
  });

  it("stores WEB_APP_ORIGIN as a normalized origin in runtime config", () => {
    const config = parseRuntimeConfig({
      ...baseEnv,
      WEB_APP_ORIGIN: "https://cfm.707979.xyz/workspace",
    } as never);

    expect(config.WEB_APP_ORIGIN).toBe("https://cfm.707979.xyz");
  });

  it("stores WEB_APP_ORIGINS as normalized origins in runtime config", () => {
    const config = parseRuntimeConfig({
      ...baseEnv,
      WEB_APP_ORIGIN: "https://cfm.707979.xyz/workspace",
      WEB_APP_ORIGINS: "https://cfm.707979.xyz, https://km.707979.xyz/login",
    } as never);

    expect(config.WEB_APP_ORIGIN).toBe("https://cfm.707979.xyz");
    expect(config.WEB_APP_ORIGINS).toEqual([
      "https://cfm.707979.xyz",
      "https://km.707979.xyz",
    ]);
  });

  it("ignores an invalid WEB_APP_ORIGIN when computing fallback CORS", () => {
    expect(
      resolveConfiguredWebAppOrigin({
        WEB_APP_ORIGIN: "not-a-valid-url",
      }),
    ).toBeUndefined();
  });

  it("parses boolean runtime flags from string env values", () => {
    const disabled = parseRuntimeConfig(baseEnv as never);
    const enabled = parseRuntimeConfig({
      ...baseEnv,
      EMAIL_ROUTING_MANAGEMENT_ENABLED: "true",
    } as never);

    expect(disabled.EMAIL_ROUTING_MANAGEMENT_ENABLED).toBe(false);
    expect(enabled.EMAIL_ROUTING_MANAGEMENT_ENABLED).toBe(true);
  });

  it("defaults subdomain cleanup to a conservative backlog window per scheduled run", () => {
    const config = parseRuntimeConfig({
      ...baseEnv,
      SUBDOMAIN_CLEANUP_BATCH_SIZE: undefined,
    } as never);

    expect(config.SUBDOMAIN_CLEANUP_BATCH_SIZE).toBe(50);
  });

  it("defaults mailbox cleanup autorepair to a guarded stale-row window", () => {
    const config = parseRuntimeConfig({
      ...baseEnv,
      MAILBOX_CLEANUP_AUTOREPAIR_MIN_AGE_MINUTES: undefined,
      MAILBOX_CLEANUP_REPAIR_BATCH_SIZE: undefined,
    } as never);

    expect(config.MAILBOX_CLEANUP_AUTOREPAIR_MIN_AGE_MINUTES).toBe(120);
    expect(config.MAILBOX_CLEANUP_REPAIR_BATCH_SIZE).toBe(100);
  });

  it("accepts zero as the mailbox cleanup autorepair kill switch", () => {
    const config = parseRuntimeConfig({
      ...baseEnv,
      MAILBOX_CLEANUP_REPAIR_BATCH_SIZE: "0",
    } as never);

    expect(config.MAILBOX_CLEANUP_REPAIR_BATCH_SIZE).toBe(0);
  });

  it("accepts zero as the subdomain cleanup kill switch", () => {
    const config = parseRuntimeConfig({
      ...baseEnv,
      SUBDOMAIN_CLEANUP_BATCH_SIZE: "0",
    } as never);

    expect(config.SUBDOMAIN_CLEANUP_BATCH_SIZE).toBe(0);
  });

  it("defaults subdomain cleanup dispatch to one minute worth of queue fan-out", () => {
    const config = parseRuntimeConfig({
      ...baseEnv,
      SUBDOMAIN_CLEANUP_DISPATCH_BATCH_SIZE: undefined,
    } as never);

    expect(config.SUBDOMAIN_CLEANUP_DISPATCH_BATCH_SIZE).toBe(48);
  });

  it("accepts runtime config without any separate Cloudflare request budget knob", () => {
    const result = safeParseRuntimeConfig(baseEnv as never);

    expect(result.success).toBe(true);
  });
});
