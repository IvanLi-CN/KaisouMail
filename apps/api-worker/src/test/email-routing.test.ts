import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getRuntimeStateValue, setRuntimeStateValue } = vi.hoisted(() => ({
  getRuntimeStateValue: vi.fn(),
  setRuntimeStateValue: vi.fn(),
}));

vi.mock("../services/runtime-state", () => ({
  getRuntimeStateValue,
  setRuntimeStateValue,
}));

import {
  createRoutingRule,
  createZone,
  deleteRoutingRule,
  deleteZone,
  listZones,
} from "../services/emailRouting";

const baseConfig = {
  APP_ENV: "production",
  CLOUDFLARE_ACCOUNT_ID: "account_123",
  EMAIL_WORKER_NAME: "email-receiver-worker",
  DEFAULT_MAILBOX_TTL_MINUTES: 60,
  CLEANUP_BATCH_SIZE: 3,
  EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
  CLOUDFLARE_API_TOKEN: "token_123",
  SESSION_SECRET: "super-secret-session-key",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
} as const;

const env = {} as never;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("email routing service", () => {
  beforeEach(() => {
    getRuntimeStateValue.mockResolvedValue(null);
    setRuntimeStateValue.mockResolvedValue(undefined);
  });

  it("lists zones with Cloudflare status and nameservers", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          errors: [],
          result: [
            {
              id: "zone_123",
              name: "relay.example.test",
              status: "pending",
              name_servers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(listZones(env, baseConfig)).resolves.toEqual([
      {
        id: "zone_123",
        name: "relay.example.test",
        status: "pending",
        nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
      },
    ]);
  });

  it("creates a full Cloudflare zone inside the configured account", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          errors: [],
          result: {
            id: "zone_123",
            name: "relay.example.test",
            status: "pending",
            name_servers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const zone = await createZone(env, baseConfig, "relay.example.test");

    expect(zone).toEqual({
      id: "zone_123",
      name: "relay.example.test",
      status: "pending",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.method).toBe("POST");
    expect(init?.body).toContain('"type":"full"');
    expect(init?.body).toContain('"id":"account_123"');
  });

  it("treats missing Cloudflare zones as already deleted", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ message: "Zone not found" }],
          result: null,
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      deleteZone(env, baseConfig, {
        rootDomain: "relay.example.test",
        zoneId: "zone_123",
      }),
    ).resolves.toEqual({ alreadyMissing: true });
  });

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
      env,
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
        env,
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

  it("treats missing routing rules as already deleted", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 1002, message: "Rule not found" }],
          result: null,
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      deleteRoutingRule(
        env,
        baseConfig,
        {
          rootDomain: "relay.example.test",
          zoneId: "zone_123",
        },
        "rule_missing",
      ),
    ).resolves.toBeUndefined();
  });

  it("does not swallow zone-level 404s when deleting a routing rule", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 7003, message: "No route for the URI" }],
          result: null,
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      deleteRoutingRule(
        env,
        baseConfig,
        {
          rootDomain: "relay.example.test",
          zoneId: "zone_stale",
        },
        "rule_123",
      ),
    ).rejects.toMatchObject({
      status: 404,
      message: "No route for the URI",
    });
  });

  it("stores Cloudflare cooldown from retry-after headers when the API returns 429", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ message: "Rate limited" }],
          result: null,
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "120",
          },
        },
      ),
    );

    await expect(listZones(env, baseConfig)).rejects.toMatchObject({
      status: 429,
      message: "Cloudflare API rate limit reached; retry later",
      details: expect.objectContaining({
        retryAfterSeconds: 120,
        source: "cloudflare",
      }),
      headers: {
        "retry-after": "120",
      },
    });

    expect(setRuntimeStateValue).toHaveBeenCalledWith(
      env,
      "cloudflare_api_rate_limited_until",
      expect.any(String),
    );
  });
});
