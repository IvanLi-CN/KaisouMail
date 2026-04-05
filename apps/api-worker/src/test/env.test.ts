import { describe, expect, it } from "vitest";

import { parseRuntimeConfig } from "../env";

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
});
