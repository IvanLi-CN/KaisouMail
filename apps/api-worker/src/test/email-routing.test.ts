import { afterEach, describe, expect, it, vi } from "vitest";

import { createRoutingRule } from "../services/emailRouting";

const baseConfig = {
  APP_ENV: "production",
  EMAIL_WORKER_NAME: "email-receiver-worker",
  DEFAULT_MAILBOX_TTL_MINUTES: 60,
  CLEANUP_BATCH_SIZE: 3,
  EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
  CLOUDFLARE_API_TOKEN: "token_123",
  SESSION_SECRET: "super-secret-session-key",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  CF_ROUTE_RULESET_TAG: "cf-mail",
} as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("email routing service", () => {
  it("sends the configured email worker name when creating a rule", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          errors: [],
          result: { id: "rule_123" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const ruleId = await createRoutingRule(
      baseConfig,
      {
        rootDomain: "707979.xyz",
        zoneId: "zone_123",
      },
      "smoke@ops.alpha.707979.xyz",
    );

    expect(ruleId).toBe("rule_123");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.method).toBe("POST");
    expect(init?.body).toContain('"type":"worker"');
    expect(init?.body).toContain('"value":["email-receiver-worker"]');
  });

  it("fails fast when live email routing is enabled without EMAIL_WORKER_NAME", async () => {
    await expect(
      createRoutingRule(
        {
          ...baseConfig,
          EMAIL_WORKER_NAME: undefined,
        },
        {
          rootDomain: "707979.xyz",
          zoneId: "zone_123",
        },
        "smoke@ops.alpha.707979.xyz",
      ),
    ).rejects.toMatchObject({
      status: 500,
      message:
        "Email Routing management is enabled but EMAIL_WORKER_NAME is not configured",
    });
  });
});
