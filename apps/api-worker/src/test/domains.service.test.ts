import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/errors";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
const {
  createRoutingRule,
  createZone,
  deleteRoutingRule,
  deleteZone,
  enableDomainRouting,
  ensureSubdomainEnabled,
  ensureWildcardEmailRoutingDnsRecords,
  getCatchAllRule,
  listZones,
  updateCatchAllRule,
  validateZoneAccess,
} = vi.hoisted(() => ({
  createRoutingRule: vi.fn(),
  createZone: vi.fn(),
  deleteRoutingRule: vi.fn(),
  deleteZone: vi.fn(),
  enableDomainRouting: vi.fn(),
  ensureSubdomainEnabled: vi.fn(),
  ensureWildcardEmailRoutingDnsRecords: vi.fn(),
  getCatchAllRule: vi.fn(),
  listZones: vi.fn(),
  updateCatchAllRule: vi.fn(),
  validateZoneAccess: vi.fn(),
}));

vi.mock("../db/client", () => ({
  getDb,
}));

vi.mock("../services/emailRouting", async () => {
  const actual = await vi.importActual<
    typeof import("../services/emailRouting")
  >("../services/emailRouting");
  return {
    ...actual,
    createRoutingRule,
    createZone,
    deleteRoutingRule,
    deleteZone,
    enableDomainRouting,
    ensureSubdomainEnabled,
    ensureWildcardEmailRoutingDnsRecords,
    getCatchAllRule,
    listZones,
    updateCatchAllRule,
    validateZoneAccess,
  };
});

import { domains, mailboxes } from "../db/schema";
import {
  disableDomainCatchAll,
  enableDomainCatchAll,
} from "../services/domains";

const baseDomain = {
  id: "dom_primary",
  rootDomain: "707979.xyz",
  zoneId: "zone_primary",
  bindingSource: "catalog",
  status: "active",
  catchAllEnabled: false,
  catchAllOwnerUserId: null,
  catchAllRestoreStateJson: null,
  catchAllUpdatedAt: null,
  subdomainDnsMode: "explicit",
  wildcardDnsVerifiedAt: null,
  wildcardDnsLastError: null,
  lastProvisionError: null,
  createdAt: "2026-04-03T12:00:00.000Z",
  updatedAt: "2026-04-03T12:00:00.000Z",
  lastProvisionedAt: "2026-04-03T12:00:00.000Z",
  disabledAt: null,
  deletedAt: null,
} as const;

const env = {} as never;
const runtimeConfig = {
  APP_ENV: "development",
  CLOUDFLARE_ACCOUNT_ID: "account_123",
  DEFAULT_MAILBOX_TTL_MINUTES: 60,
  CLEANUP_BATCH_SIZE: 3,
  SUBDOMAIN_CLEANUP_BATCH_SIZE: 1,
  EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
  CLOUDFLARE_API_TOKEN: "cf-token",
  EMAIL_WORKER_NAME: "mail-worker",
  SESSION_SECRET: "super-secret-session-key",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
} as const;

const createDb = (options?: {
  domainRows?: unknown[];
  mailboxRows?: unknown[];
}) => {
  const domainRows = options?.domainRows ?? [];
  const mailboxRows = options?.mailboxRows ?? [];
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> =
    [];

  const rowsForTable = (table: unknown) => {
    if (table === domains) return domainRows;
    if (table === mailboxes) return mailboxRows;
    return [];
  };

  const db = {
    updates,
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        orderBy: vi.fn(async () => rowsForTable(table)),
        where: vi.fn(() => ({
          limit: vi.fn(async () => rowsForTable(table)),
          orderBy: vi.fn(async () => rowsForTable(table)),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((_values?: unknown) => ({
        onConflictDoUpdate: vi.fn(async () => undefined),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          updates.push({ table, values });
        }),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  };

  return db;
};

describe("domains catch-all wildcard cutover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps non-allowlisted domains on explicit mode when enabling catch-all", async () => {
    const db = createDb({
      domainRows: [baseDomain],
    });
    getDb.mockReturnValue(db);
    getCatchAllRule.mockResolvedValue({
      enabled: false,
      name: "Catch all",
      matchers: [{ type: "all" }],
      actions: [{ type: "forward", value: ["owner@example.com"] }],
    });
    updateCatchAllRule.mockResolvedValue(undefined);

    const result = await enableDomainCatchAll(
      env,
      runtimeConfig,
      baseDomain.id,
      { id: "usr_admin" },
    );

    expect(ensureWildcardEmailRoutingDnsRecords).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      catchAllEnabled: true,
      subdomainDnsMode: "explicit",
      wildcardDnsLastError: null,
    });
  });

  it("cuts allowlisted domains over to wildcard before mutating the Cloudflare catch-all rule", async () => {
    const db = createDb({
      domainRows: [baseDomain],
    });
    getDb.mockReturnValue(db);
    ensureWildcardEmailRoutingDnsRecords.mockResolvedValue(undefined);
    getCatchAllRule.mockResolvedValue({
      enabled: false,
      name: "Catch all",
      matchers: [{ type: "all" }],
      actions: [{ type: "forward", value: ["owner@example.com"] }],
    });
    updateCatchAllRule.mockResolvedValue(undefined);

    const result = await enableDomainCatchAll(
      env,
      {
        ...runtimeConfig,
        WILDCARD_SUBDOMAIN_DNS_ENABLED: true,
        WILDCARD_SUBDOMAIN_DNS_ALLOWLIST: [baseDomain.rootDomain],
      },
      baseDomain.id,
      { id: "usr_admin" },
    );

    expect(ensureWildcardEmailRoutingDnsRecords).toHaveBeenCalledTimes(1);
    expect(
      ensureWildcardEmailRoutingDnsRecords.mock.invocationCallOrder[0],
    ).toBeLessThan(getCatchAllRule.mock.invocationCallOrder[0]);
    expect(
      ensureWildcardEmailRoutingDnsRecords.mock.invocationCallOrder[0],
    ).toBeLessThan(updateCatchAllRule.mock.invocationCallOrder[0]);
    expect(result).toMatchObject({
      catchAllEnabled: true,
      subdomainDnsMode: "wildcard",
      wildcardDnsLastError: null,
    });
    expect(result.wildcardDnsVerifiedAt).toEqual(expect.any(String));
  });

  it("blocks initial allowlisted cutover when wildcard DNS ensure fails", async () => {
    const db = createDb({
      domainRows: [baseDomain],
    });
    getDb.mockReturnValue(db);
    ensureWildcardEmailRoutingDnsRecords.mockRejectedValue(
      new Error("Wildcard MX conflict"),
    );

    await expect(
      enableDomainCatchAll(
        env,
        {
          ...runtimeConfig,
          WILDCARD_SUBDOMAIN_DNS_ENABLED: true,
          WILDCARD_SUBDOMAIN_DNS_ALLOWLIST: [baseDomain.rootDomain],
        },
        baseDomain.id,
        { id: "usr_admin" },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Wildcard MX conflict",
    });

    expect(getCatchAllRule).not.toHaveBeenCalled();
    expect(updateCatchAllRule).not.toHaveBeenCalled();
    expect(db.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: domains,
          values: expect.objectContaining({
            wildcardDnsLastError: "Wildcard MX conflict",
          }),
        }),
      ]),
    );
  });

  it("rejects reconcile attempts for already-enabled catch-all domains when wildcard DNS ensure fails", async () => {
    const catchAllDomain = {
      ...baseDomain,
      catchAllEnabled: true,
      catchAllOwnerUserId: "usr_admin",
      catchAllRestoreStateJson: JSON.stringify({
        enabled: false,
        name: "Catch all",
        matchers: [{ type: "all" }],
        actions: [{ type: "forward", value: ["owner@example.com"] }],
      }),
      catchAllUpdatedAt: "2026-04-03T12:30:00.000Z",
      subdomainDnsMode: "explicit" as const,
    };
    const db = createDb({
      domainRows: [catchAllDomain],
    });
    getDb.mockReturnValue(db);
    ensureWildcardEmailRoutingDnsRecords.mockRejectedValue(
      new ApiError(409, "Record quota exceeded."),
    );

    await expect(
      enableDomainCatchAll(
        env,
        {
          ...runtimeConfig,
          WILDCARD_SUBDOMAIN_DNS_ENABLED: true,
          WILDCARD_SUBDOMAIN_DNS_ALLOWLIST: [catchAllDomain.rootDomain],
        },
        catchAllDomain.id,
        { id: "usr_admin" },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Record quota exceeded.",
    });

    expect(getCatchAllRule).not.toHaveBeenCalled();
    expect(updateCatchAllRule).not.toHaveBeenCalled();
    expect(db.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: domains,
          values: expect.objectContaining({
            wildcardDnsLastError: "Record quota exceeded.",
          }),
        }),
      ]),
    );
  });

  it("backfills explicit DNS/routes when disabling catch-all as the manual rollback path", async () => {
    const catchAllDomain = {
      ...baseDomain,
      catchAllEnabled: true,
      catchAllOwnerUserId: "usr_admin",
      catchAllRestoreStateJson: JSON.stringify({
        enabled: false,
        name: "Catch all",
        matchers: [{ type: "all" }],
        actions: [{ type: "forward", value: ["owner@example.com"] }],
      }),
      catchAllUpdatedAt: "2026-04-03T12:30:00.000Z",
      subdomainDnsMode: "wildcard" as const,
      wildcardDnsVerifiedAt: "2026-04-03T12:40:00.000Z",
    };
    const db = createDb({
      domainRows: [catchAllDomain],
      mailboxRows: [
        {
          id: "mbx_registered",
          address: "build@ops.707979.xyz",
          subdomain: "ops",
          domainId: catchAllDomain.id,
          source: "registered",
          routingRuleId: null,
          status: "active",
        },
      ],
    });
    getDb.mockReturnValue(db);
    ensureSubdomainEnabled.mockResolvedValue(undefined);
    createRoutingRule.mockResolvedValue("rule_backfilled");
    updateCatchAllRule.mockResolvedValue(undefined);

    const result = await disableDomainCatchAll(
      env,
      runtimeConfig,
      catchAllDomain.id,
    );

    expect(ensureSubdomainEnabled).toHaveBeenCalledWith(
      env,
      runtimeConfig,
      catchAllDomain,
      "ops",
      {
        projectOperation: "domains.catch_all.disable",
        projectRoute: "POST /api/domains/:id/catch-all/disable",
      },
    );
    expect(createRoutingRule).toHaveBeenCalledWith(
      env,
      runtimeConfig,
      catchAllDomain,
      "build@ops.707979.xyz",
      {
        projectOperation: "domains.catch_all.disable",
        projectRoute: "POST /api/domains/:id/catch-all/disable",
      },
    );
    expect(result).toMatchObject({
      catchAllEnabled: false,
      subdomainDnsMode: "explicit",
      wildcardDnsLastError: null,
    });
  });
});
