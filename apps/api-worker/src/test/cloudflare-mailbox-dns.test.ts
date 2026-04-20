import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { deleteSubdomainEmailRoutingDnsRecords, unlockEmailRoutingDnsRecords } =
  vi.hoisted(() => ({
    deleteSubdomainEmailRoutingDnsRecords: vi.fn(),
    unlockEmailRoutingDnsRecords: vi.fn(),
  }));

vi.mock("../services/emailRouting", async () => {
  const actual = await vi.importActual<
    typeof import("../services/emailRouting")
  >("../services/emailRouting");
  return {
    ...actual,
    deleteSubdomainEmailRoutingDnsRecords,
    unlockEmailRoutingDnsRecords,
  };
});

import {
  deleteWildcardEmailRoutingDnsRecords,
  listProjectMailboxExactDnsHosts,
  purgeProjectMailboxExactDnsHosts,
} from "../services/cloudflare-mailbox-dns";

const env = {} as never;
const baseConfig = {
  APP_ENV: "production",
  DEFAULT_MAILBOX_TTL_MINUTES: 60,
  CLEANUP_BATCH_SIZE: 3,
  SUBDOMAIN_CLEANUP_BATCH_SIZE: 50,
  EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
  CLOUDFLARE_API_TOKEN: "token_123",
  EMAIL_WORKER_NAME: "email-receiver-worker",
  SESSION_SECRET: "super-secret-session-key",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
} as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cloudflare mailbox dns helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    unlockEmailRoutingDnsRecords.mockResolvedValue(undefined);
    deleteSubdomainEmailRoutingDnsRecords.mockResolvedValue({
      matchedRecordCount: 3,
      requestCount: 4,
      completed: true,
    });
  });

  it("lists only exact project mailbox Email Routing hosts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          errors: [],
          result: [
            {
              id: "mx_ops",
              type: "MX",
              name: "ops.707979.xyz",
              content: "route1.mx.cloudflare.net",
              meta: { email_routing: true },
            },
            {
              id: "txt_deep_ops",
              type: "TXT",
              name: "deep.ops.707979.xyz",
              content: '"v=spf1 include:_spf.mx.cloudflare.net ~all"',
            },
            {
              id: "txt_custom",
              type: "TXT",
              name: "ops.707979.xyz",
              content: '"v=spf1 include:mailgun.org -all"',
            },
            {
              id: "mx_apex",
              type: "MX",
              name: "707979.xyz",
              content: "route2.mx.cloudflare.net",
              meta: { email_routing: true },
            },
            {
              id: "mx_wildcard",
              type: "MX",
              name: "*.707979.xyz",
              content: "route3.mx.cloudflare.net",
            },
            {
              id: "api_cname",
              type: "CNAME",
              name: "api.km.707979.xyz",
              content: "worker.example.com",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      listProjectMailboxExactDnsHosts(env, baseConfig, {
        rootDomain: "707979.xyz",
        zoneId: "zone_123",
      }),
    ).resolves.toEqual(["ops", "deep.ops"]);
  });

  it("purges exact hosts by unlocking each fqdn before deleting project DNS", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          errors: [],
          result: [
            {
              id: "mx_ops",
              type: "MX",
              name: "ops.707979.xyz",
              content: "route1.mx.cloudflare.net",
              meta: { email_routing: true },
            },
            {
              id: "mx_deep",
              type: "MX",
              name: "deep.ops.707979.xyz",
              content: "route2.mx.cloudflare.net",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      purgeProjectMailboxExactDnsHosts(
        env,
        baseConfig,
        {
          rootDomain: "707979.xyz",
          zoneId: "zone_123",
        },
        {
          projectOperation: "domains.catch_all.enable",
          projectRoute: "POST /api/domains/:id/catch-all/enable",
        },
      ),
    ).resolves.toEqual({
      hosts: ["ops", "deep.ops"],
      processedHosts: ["ops", "deep.ops"],
      deletedHostCount: 2,
      completed: true,
    });

    expect(unlockEmailRoutingDnsRecords).toHaveBeenNthCalledWith(
      1,
      env,
      baseConfig,
      {
        rootDomain: "707979.xyz",
        zoneId: "zone_123",
      },
      {
        projectOperation: "domains.catch_all.enable",
        projectRoute: "POST /api/domains/:id/catch-all/enable",
      },
      { name: "ops.707979.xyz" },
    );
    expect(deleteSubdomainEmailRoutingDnsRecords).toHaveBeenNthCalledWith(
      2,
      env,
      baseConfig,
      {
        rootDomain: "707979.xyz",
        zoneId: "zone_123",
      },
      "deep.ops",
      {
        projectOperation: "domains.catch_all.enable",
        projectRoute: "POST /api/domains/:id/catch-all/enable",
      },
    );
  });

  it("limits exact-host purges to a bounded batch without touching later hosts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          errors: [],
          result: [
            {
              id: "mx_ops",
              type: "MX",
              name: "ops.707979.xyz",
              content: "route1.mx.cloudflare.net",
            },
            {
              id: "mx_deep",
              type: "MX",
              name: "deep.ops.707979.xyz",
              content: "route2.mx.cloudflare.net",
            },
            {
              id: "mx_relay",
              type: "MX",
              name: "relay.707979.xyz",
              content: "route3.mx.cloudflare.net",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      purgeProjectMailboxExactDnsHosts(
        env,
        baseConfig,
        {
          rootDomain: "707979.xyz",
          zoneId: "zone_123",
        },
        {
          projectOperation: "domains.catch_all.enable",
          projectRoute: "POST /api/domains/:id/catch-all/enable",
        },
        { maxHostCount: 2 },
      ),
    ).resolves.toEqual({
      hosts: ["ops", "deep.ops", "relay"],
      processedHosts: ["ops", "deep.ops"],
      deletedHostCount: 2,
      completed: false,
    });

    expect(deleteSubdomainEmailRoutingDnsRecords).toHaveBeenCalledTimes(2);
    expect(deleteSubdomainEmailRoutingDnsRecords).not.toHaveBeenCalledWith(
      env,
      baseConfig,
      {
        rootDomain: "707979.xyz",
        zoneId: "zone_123",
      },
      "relay",
      expect.any(Object),
    );
  });

  it("deletes only wildcard Email Routing MX/TXT records when rebuilding explicit mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            errors: [],
            result: [
              {
                id: "mx_wildcard",
                type: "MX",
                name: "*.707979.xyz",
                content: "route1.mx.cloudflare.net",
              },
              {
                id: "txt_wildcard",
                type: "TXT",
                name: "*.707979.xyz",
                content: '"v=spf1 include:_spf.mx.cloudflare.net ~all"',
              },
              {
                id: "txt_custom",
                type: "TXT",
                name: "*.707979.xyz",
                content: '"v=spf1 include:mailgun.org -all"',
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            errors: [],
            result: { id: "deleted_mx" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            errors: [],
            result: { id: "deleted_txt" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    await expect(
      deleteWildcardEmailRoutingDnsRecords(env, baseConfig, {
        rootDomain: "707979.xyz",
        zoneId: "zone_123",
      }),
    ).resolves.toEqual({
      matchedRecordCount: 2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.cloudflare.com/client/v4/zones/zone_123/dns_records/mx_wildcard",
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "https://api.cloudflare.com/client/v4/zones/zone_123/dns_records/txt_wildcard",
    );
  });
});
