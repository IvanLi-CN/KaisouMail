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
    getCatchAllRule,
    listZones,
    updateCatchAllRule,
    validateZoneAccess,
  };
});

import { domains, mailboxes } from "../db/schema";
import {
  bindDomain,
  classifyDomainCreateState,
  createDomain,
  deleteDomain,
  disableDomain,
  disableDomainCatchAll,
  enableDomainCatchAll,
  listDomainCatalog,
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

  const rowsForTable = (table: unknown) => {
    if (table === domains) return domainRows;
    if (table === mailboxes) return mailboxRows;
    return [];
  };

  return {
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
      values: vi.fn(async () => undefined),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  };
};

const createSequencedDb = (options?: {
  domainRows?: unknown[][];
  mailboxRows?: unknown[][];
}) => {
  const domainRows = [...(options?.domainRows ?? [[]])];
  const mailboxRows = [...(options?.mailboxRows ?? [[]])];

  const nextRowsForTable = (table: unknown) => {
    const queue =
      table === domains ? domainRows : table === mailboxes ? mailboxRows : [[]];
    if (queue.length > 1) {
      return queue.shift() ?? [];
    }
    return queue[0] ?? [];
  };

  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        orderBy: vi.fn(async () => nextRowsForTable(table)),
        where: vi.fn(() => ({
          limit: vi.fn(async () => nextRowsForTable(table)),
          orderBy: vi.fn(async () => nextRowsForTable(table)),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async () => undefined),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  };
};

describe("domain create state", () => {
  it("creates a new record when the root domain is unknown", () => {
    expect(classifyDomainCreateState(null)).toEqual({ kind: "create" });
  });

  it("blocks duplicates while the domain is active and not deleted", () => {
    const result = classifyDomainCreateState(baseDomain);
    expect(result.kind).toBe("conflict");
  });

  it("reuses non-active records so admins can repair the zone id", () => {
    const result = classifyDomainCreateState({
      ...baseDomain,
      status: "provisioning_error",
      catchAllEnabled: false,
      lastProvisionError: "Zone access denied",
      lastProvisionedAt: null,
    });
    expect(result.kind).toBe("replace");
  });

  it("reuses soft-deleted records so the same root domain can be rebound", () => {
    const result = classifyDomainCreateState({
      ...baseDomain,
      deletedAt: "2026-04-04T00:00:00.000Z",
    });
    expect(result.kind).toBe("replace");
  });
});

describe("domain catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges Cloudflare zones with local project states", async () => {
    getDb.mockReturnValue(
      createDb({
        domainRows: [
          baseDomain,
          {
            ...baseDomain,
            id: "dom_missing",
            rootDomain: "missing.example.io",
            zoneId: "zone_missing",
            bindingSource: "project_bind",
            status: "disabled",
            updatedAt: "2026-04-03T12:10:00.000Z",
            disabledAt: "2026-04-03T12:10:00.000Z",
          },
        ],
      }),
    );
    listZones.mockResolvedValue([
      {
        id: "zone_primary",
        name: "707979.xyz",
        status: "active",
        nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
      },
      {
        id: "zone_available",
        name: "ops.example.org",
        status: "pending",
        nameServers: ["sue.ns.cloudflare.com", "taro.ns.cloudflare.com"],
      },
    ]);

    const catalog = await listDomainCatalog(env, runtimeConfig);

    expect(catalog.cloudflareSync).toEqual({
      status: "live",
      retryAfter: null,
      retryAfterSeconds: null,
      rateLimitContext: null,
    });
    expect(catalog.domains).toEqual([
      expect.objectContaining({
        rootDomain: "707979.xyz",
        bindingSource: "catalog",
        cloudflareAvailability: "available",
        cloudflareStatus: "active",
        nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
        projectStatus: "active",
      }),
      expect.objectContaining({
        rootDomain: "missing.example.io",
        bindingSource: "project_bind",
        cloudflareAvailability: "missing",
        cloudflareStatus: null,
        nameServers: [],
        projectStatus: "disabled",
      }),
      expect.objectContaining({
        rootDomain: "ops.example.org",
        bindingSource: null,
        cloudflareAvailability: "available",
        cloudflareStatus: "pending",
        nameServers: ["sue.ns.cloudflare.com", "taro.ns.cloudflare.com"],
        projectStatus: "not_enabled",
        id: null,
      }),
    ]);
  });

  it("degrades the catalog to local rows when Cloudflare is rate limited", async () => {
    getDb.mockReturnValue(
      createDb({
        domainRows: [baseDomain],
      }),
    );
    listZones.mockRejectedValue(
      new ApiError(
        429,
        "Cloudflare API rate limit reached; retry later",
        {
          retryAfter: "2026-04-14T10:00:00.000Z",
          retryAfterSeconds: 120,
          source: "cloudflare",
          rateLimitContext: {
            triggeredAt: "2026-04-14T09:58:00.000Z",
            projectOperation: "mailboxes.ensure",
            projectRoute: "POST /api/mailboxes/ensure",
            cloudflareMethod: "POST",
            cloudflarePath: "/zones/zone_primary/email/routing/rules",
            lastBlockedAt: null,
            lastBlockedBy: null,
          },
        },
        { "retry-after": "120" },
      ),
    );

    const catalog = await listDomainCatalog(env, runtimeConfig);

    expect(catalog.cloudflareSync).toEqual({
      status: "rate_limited",
      retryAfter: "2026-04-14T10:00:00.000Z",
      retryAfterSeconds: 120,
      rateLimitContext: {
        triggeredAt: "2026-04-14T09:58:00.000Z",
        projectOperation: "mailboxes.ensure",
        projectRoute: "POST /api/mailboxes/ensure",
        cloudflareMethod: "POST",
        cloudflarePath: "/zones/zone_primary/email/routing/rules",
        lastBlockedAt: null,
        lastBlockedBy: null,
      },
    });
    expect(catalog.domains).toEqual([
      expect.objectContaining({
        rootDomain: "707979.xyz",
        cloudflareAvailability: "missing",
        projectStatus: "active",
      }),
    ]);
  });

  it("rejects enabling a domain that is not present in the Cloudflare catalog", async () => {
    getDb.mockReturnValue(createDb());
    listZones.mockResolvedValue([
      {
        id: "zone_other",
        name: "other.example.org",
        status: "active",
        nameServers: [],
      },
    ]);

    await expect(
      createDomain(env, runtimeConfig, {
        rootDomain: "ops.example.org",
        zoneId: "zone_available",
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Mailbox domain is not available in Cloudflare",
    });
  });

  it("creates a local record for a discovered Cloudflare domain", async () => {
    const db = createDb();
    getDb.mockReturnValue(db);
    listZones.mockResolvedValue([
      {
        id: "zone_available",
        name: "ops.example.org",
        status: "active",
        nameServers: [],
      },
    ]);
    validateZoneAccess.mockResolvedValue(undefined);
    enableDomainRouting.mockResolvedValue(undefined);

    const result = await createDomain(env, runtimeConfig, {
      rootDomain: "ops.example.org",
      zoneId: "zone_available",
    });

    expect(validateZoneAccess).toHaveBeenCalledWith(
      env,
      runtimeConfig,
      {
        rootDomain: "ops.example.org",
        zoneId: "zone_available",
      },
      {
        projectOperation: "domains.create",
        projectRoute: "POST /api/domains",
      },
    );
    expect(enableDomainRouting).toHaveBeenCalledWith(
      env,
      runtimeConfig,
      {
        rootDomain: "ops.example.org",
        zoneId: "zone_available",
      },
      {
        projectOperation: "domains.create",
        projectRoute: "POST /api/domains",
      },
    );
    expect(db.insert).toHaveBeenCalled();
    expect(result.domain).toMatchObject({
      rootDomain: "ops.example.org",
      zoneId: "zone_available",
      bindingSource: "catalog",
      status: "active",
    });
  });

  it("keeps project-bound source when re-enabling the same discovered zone", async () => {
    const db = createDb({
      domainRows: [
        {
          ...baseDomain,
          id: "dom_replaced",
          rootDomain: "ops.example.org",
          zoneId: "zone_available",
          bindingSource: "project_bind",
          status: "disabled",
          disabledAt: "2026-04-04T00:00:00.000Z",
        },
      ],
    });
    getDb.mockReturnValue(db);
    listZones.mockResolvedValue([
      {
        id: "zone_available",
        name: "ops.example.org",
        status: "active",
        nameServers: [],
      },
    ]);
    validateZoneAccess.mockResolvedValue(undefined);
    enableDomainRouting.mockResolvedValue(undefined);

    const result = await createDomain(env, runtimeConfig, {
      rootDomain: "ops.example.org",
      zoneId: "zone_available",
    });

    expect(result.domain).toMatchObject({
      rootDomain: "ops.example.org",
      zoneId: "zone_available",
      bindingSource: "project_bind",
      status: "active",
    });
  });

  it("restores a soft-deleted project-bound zone from the catalog without losing delete access", async () => {
    const db = createDb({
      domainRows: [
        {
          ...baseDomain,
          id: "dom_replaced",
          rootDomain: "ops.example.org",
          zoneId: "zone_available",
          bindingSource: "project_bind",
          status: "disabled",
          disabledAt: "2026-04-04T00:00:00.000Z",
          deletedAt: "2026-04-04T00:01:00.000Z",
        },
      ],
    });
    getDb.mockReturnValue(db);
    listZones.mockResolvedValue([
      {
        id: "zone_available",
        name: "ops.example.org",
        status: "active",
        nameServers: [],
      },
    ]);
    validateZoneAccess.mockResolvedValue(undefined);
    enableDomainRouting.mockResolvedValue(undefined);

    const result = await createDomain(env, runtimeConfig, {
      rootDomain: "ops.example.org",
      zoneId: "zone_available",
    });

    expect(result.domain).toMatchObject({
      rootDomain: "ops.example.org",
      zoneId: "zone_available",
      bindingSource: "project_bind",
      status: "active",
    });
  });

  it("resets stale catch-all state when recreating a soft-deleted domain", async () => {
    const db = createDb({
      domainRows: [
        {
          ...baseDomain,
          id: "dom_replaced",
          rootDomain: "ops.example.org",
          zoneId: "zone_old",
          bindingSource: "project_bind",
          status: "disabled",
          catchAllEnabled: true,
          catchAllOwnerUserId: "usr_admin",
          catchAllRestoreStateJson: JSON.stringify({
            enabled: false,
            name: "Catch all",
            matchers: [{ type: "all" }],
            actions: [{ type: "forward", value: ["owner@example.com"] }],
          }),
          catchAllUpdatedAt: "2026-04-04T00:02:00.000Z",
          disabledAt: "2026-04-04T00:00:00.000Z",
          deletedAt: "2026-04-04T00:01:00.000Z",
        },
      ],
    });
    getDb.mockReturnValue(db);
    listZones.mockResolvedValue([
      {
        id: "zone_available",
        name: "ops.example.org",
        status: "active",
        nameServers: [],
      },
    ]);
    validateZoneAccess.mockResolvedValue(undefined);
    enableDomainRouting.mockResolvedValue(undefined);

    const result = await createDomain(env, runtimeConfig, {
      rootDomain: "ops.example.org",
      zoneId: "zone_available",
    });

    expect(result.domain).toMatchObject({
      rootDomain: "ops.example.org",
      zoneId: "zone_available",
      bindingSource: "catalog",
      status: "active",
      catchAllEnabled: false,
    });
  });

  it("creates a project-bound domain through Cloudflare bind", async () => {
    const db = createDb();
    getDb.mockReturnValue(db);
    createZone.mockResolvedValue({
      id: "zone_bound",
      name: "example.org",
      status: "pending",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
    });
    validateZoneAccess.mockResolvedValue(undefined);
    enableDomainRouting.mockResolvedValue(undefined);

    const result = await bindDomain(env, runtimeConfig, {
      rootDomain: "example.org",
    });

    expect(createZone).toHaveBeenCalledWith(env, runtimeConfig, "example.org", {
      projectOperation: "domains.bind",
      projectRoute: "POST /api/domains/bind",
    });
    expect(result.domain).toMatchObject({
      rootDomain: "example.org",
      zoneId: "zone_bound",
      bindingSource: "project_bind",
    });
  });

  it("rejects direct subdomain bind requests before creating a Cloudflare zone", async () => {
    const db = createDb();
    getDb.mockReturnValue(db);

    await expect(
      bindDomain(env, runtimeConfig, {
        rootDomain: "mail.example.org",
      }),
    ).rejects.toMatchObject({
      status: 400,
      details: {
        code: "subdomain_direct_bind_not_supported",
        mailDomain: "mail.example.org",
        recommendedApex: "example.org",
        recommendedMailboxSubdomain: "mail",
      },
    });

    expect(createZone).not.toHaveBeenCalled();
    expect(validateZoneAccess).not.toHaveBeenCalled();
    expect(enableDomainRouting).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("reuses existing disabled domains instead of creating a duplicate Cloudflare zone", async () => {
    const db = createDb({
      domainRows: [
        {
          ...baseDomain,
          id: "dom_disabled",
          rootDomain: "example.org",
          zoneId: "zone_existing",
          bindingSource: "catalog",
          status: "disabled",
          disabledAt: "2026-04-04T00:00:00.000Z",
        },
      ],
    });
    getDb.mockReturnValue(db);
    listZones.mockResolvedValue([
      {
        id: "zone_existing",
        name: "example.org",
        status: "active",
        nameServers: [],
      },
    ]);
    validateZoneAccess.mockResolvedValue(undefined);
    enableDomainRouting.mockResolvedValue(undefined);

    const result = await bindDomain(env, runtimeConfig, {
      rootDomain: "example.org",
    });

    expect(createZone).not.toHaveBeenCalled();
    expect(result.domain).toMatchObject({
      rootDomain: "example.org",
      zoneId: "zone_existing",
      bindingSource: "catalog",
      status: "active",
    });
  });

  it("reuses existing disabled subdomain zones instead of forcing apex guidance", async () => {
    const db = createDb({
      domainRows: [
        {
          ...baseDomain,
          id: "dom_subdomain_disabled",
          rootDomain: "mail.example.org",
          zoneId: "zone_subdomain_existing",
          bindingSource: "catalog",
          status: "disabled",
          disabledAt: "2026-04-04T00:00:00.000Z",
        },
      ],
    });
    getDb.mockReturnValue(db);
    listZones.mockResolvedValue([
      {
        id: "zone_subdomain_existing",
        name: "mail.example.org",
        status: "active",
        nameServers: [],
      },
    ]);
    validateZoneAccess.mockResolvedValue(undefined);
    enableDomainRouting.mockResolvedValue(undefined);

    const result = await bindDomain(env, runtimeConfig, {
      rootDomain: "mail.example.org",
    });

    expect(createZone).not.toHaveBeenCalled();
    expect(result.domain).toMatchObject({
      rootDomain: "mail.example.org",
      zoneId: "zone_subdomain_existing",
      bindingSource: "catalog",
      status: "active",
    });
  });

  it("still rejects direct subdomain bind when no reusable subdomain zone exists", async () => {
    const db = createDb({
      domainRows: [
        {
          ...baseDomain,
          id: "dom_subdomain_stale",
          rootDomain: "mail.example.org",
          zoneId: "zone_subdomain_stale",
          bindingSource: "catalog",
          status: "disabled",
          disabledAt: "2026-04-04T00:00:00.000Z",
        },
      ],
    });
    getDb.mockReturnValue(db);
    listZones.mockResolvedValue([
      {
        id: "zone_other",
        name: "other.example.org",
        status: "active",
        nameServers: [],
      },
    ]);

    await expect(
      bindDomain(env, runtimeConfig, {
        rootDomain: "mail.example.org",
      }),
    ).rejects.toMatchObject({
      status: 400,
      details: {
        code: "subdomain_direct_bind_not_supported",
        mailDomain: "mail.example.org",
        recommendedApex: "example.org",
        recommendedMailboxSubdomain: "mail",
      },
    });

    expect(createZone).not.toHaveBeenCalled();
  });

  it("returns catalog guidance when a subdomain zone already exists in Cloudflare", async () => {
    const db = createDb();
    getDb.mockReturnValue(db);
    listZones.mockResolvedValue([
      {
        id: "zone_mail_example_org",
        name: "mail.example.org",
        status: "active",
        nameServers: [],
      },
    ]);

    await expect(
      bindDomain(env, runtimeConfig, {
        rootDomain: "mail.example.org",
      }),
    ).rejects.toMatchObject({
      status: 409,
      details: {
        code: "subdomain_zone_available_in_catalog",
        mailDomain: "mail.example.org",
        zoneId: "zone_mail_example_org",
      },
    });

    expect(createZone).not.toHaveBeenCalled();
  });

  it("creates a fresh Cloudflare zone when a stale disabled domain no longer matches the catalog", async () => {
    const db = createDb({
      domainRows: [
        {
          ...baseDomain,
          id: "dom_disabled",
          rootDomain: "example.org",
          zoneId: "zone_stale",
          bindingSource: "catalog",
          status: "disabled",
          disabledAt: "2026-04-04T00:00:00.000Z",
        },
      ],
    });
    getDb.mockReturnValue(db);
    listZones.mockResolvedValue([
      {
        id: "zone_unrelated",
        name: "other.example.org",
        status: "active",
        nameServers: [],
      },
    ]);
    validateZoneAccess.mockResolvedValue(undefined);
    enableDomainRouting.mockResolvedValue(undefined);
    createZone.mockResolvedValue({
      id: "zone_bound",
      name: "example.org",
      status: "pending",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
    });

    const result = await bindDomain(env, runtimeConfig, {
      rootDomain: "example.org",
    });

    expect(createZone).toHaveBeenCalledWith(env, runtimeConfig, "example.org", {
      projectOperation: "domains.bind",
      projectRoute: "POST /api/domains/bind",
    });
    expect(validateZoneAccess).toHaveBeenCalledTimes(1);
    expect(result.domain).toMatchObject({
      rootDomain: "example.org",
      zoneId: "zone_bound",
      bindingSource: "project_bind",
      status: "active",
    });
  });

  it("keeps a concurrently persisted zone instead of deleting it during bind cleanup", async () => {
    const winningDomain = {
      ...baseDomain,
      id: "dom_bound",
      rootDomain: "example.org",
      zoneId: "zone_bound",
      bindingSource: "project_bind",
    };
    const db = createSequencedDb({
      domainRows: [[], [winningDomain]],
    });
    getDb.mockReturnValue(db);
    createZone.mockResolvedValue({
      id: "zone_bound",
      name: "example.org",
      status: "pending",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
    });
    validateZoneAccess.mockResolvedValue(undefined);
    enableDomainRouting.mockResolvedValue(undefined);

    const result = await bindDomain(env, runtimeConfig, {
      rootDomain: "example.org",
    });

    expect(result.domain).toMatchObject({
      rootDomain: "example.org",
      zoneId: "zone_bound",
      bindingSource: "project_bind",
      status: "active",
    });
    expect(deleteZone).not.toHaveBeenCalled();
  });

  it("keeps retryable bind failures as project-bound provisioning errors", async () => {
    const db = createDb();
    getDb.mockReturnValue(db);
    createZone.mockResolvedValue({
      id: "zone_bound",
      name: "example.org",
      status: "pending",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
    });
    validateZoneAccess.mockRejectedValue(
      new ApiError(409, "Zone is pending activation"),
    );

    const result = await bindDomain(env, runtimeConfig, {
      rootDomain: "example.org",
    });

    expect(result.domain).toMatchObject({
      rootDomain: "example.org",
      zoneId: "zone_bound",
      status: "provisioning_error",
      catchAllEnabled: false,
      lastProvisionError: "Zone is pending activation",
    });
    expect(deleteZone).not.toHaveBeenCalled();
  });

  it("fails fast on bind when Cloudflare is rate limited without persisting provisioning_error", async () => {
    const db = createDb();
    getDb.mockReturnValue(db);
    createZone.mockResolvedValue({
      id: "zone_bound",
      name: "example.org",
      status: "pending",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
    });
    validateZoneAccess.mockRejectedValue(
      new ApiError(
        429,
        "Cloudflare API rate limit reached; retry later",
        {
          retryAfter: "2026-04-14T10:00:00.000Z",
          retryAfterSeconds: 120,
          source: "cloudflare",
        },
        { "retry-after": "120" },
      ),
    );
    deleteZone.mockResolvedValue({ alreadyMissing: false });

    await expect(
      bindDomain(env, runtimeConfig, {
        rootDomain: "example.org",
      }),
    ).rejects.toMatchObject({
      status: 429,
      details: expect.objectContaining({
        retryAfterSeconds: 120,
      }),
      headers: {
        "retry-after": "120",
      },
    });

    expect(db.insert).not.toHaveBeenCalled();
    expect(deleteZone).toHaveBeenCalledWith(
      env,
      runtimeConfig,
      {
        rootDomain: "example.org",
        zoneId: "zone_bound",
      },
      {
        projectOperation: "domains.bind",
        projectRoute: "POST /api/domains/bind",
      },
      {
        bypassRateLimitCheck: true,
      },
    );
  });

  it("preserves bind 429 metadata when cleanup is also rate limited", async () => {
    const db = createDb();
    getDb.mockReturnValue(db);
    createZone.mockResolvedValue({
      id: "zone_bound",
      name: "example.org",
      status: "pending",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
    });
    validateZoneAccess.mockRejectedValue(
      new ApiError(
        429,
        "Cloudflare API rate limit reached; retry later",
        {
          retryAfter: "2026-04-14T10:00:00.000Z",
          retryAfterSeconds: 120,
          source: "cloudflare",
        },
        { "retry-after": "120" },
      ),
    );
    deleteZone.mockRejectedValue(
      new ApiError(
        429,
        "Cloudflare cleanup rate limit reached; retry later",
        {
          retryAfter: "2026-04-14T10:03:00.000Z",
          retryAfterSeconds: 300,
          source: "cloudflare",
        },
        { "retry-after": "300" },
      ),
    );

    await expect(
      bindDomain(env, runtimeConfig, {
        rootDomain: "example.org",
      }),
    ).rejects.toMatchObject({
      status: 429,
      message: "Cloudflare API rate limit reached; retry later",
      details: expect.objectContaining({
        retryAfterSeconds: 120,
        cleanupRequired: true,
        cleanupError: "Cloudflare cleanup rate limit reached; retry later",
      }),
      headers: {
        "retry-after": "120",
      },
    });

    expect(db.insert).not.toHaveBeenCalled();
    expect(deleteZone).toHaveBeenCalledWith(
      env,
      runtimeConfig,
      {
        rootDomain: "example.org",
        zoneId: "zone_bound",
      },
      {
        projectOperation: "domains.bind",
        projectRoute: "POST /api/domains/bind",
      },
      {
        bypassRateLimitCheck: true,
      },
    );
  });

  it("rolls back bound zones when initial provisioning fails fatally", async () => {
    const db = createDb();
    getDb.mockReturnValue(db);
    createZone.mockResolvedValue({
      id: "zone_bound",
      name: "example.org",
      status: "pending",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
    });
    validateZoneAccess.mockRejectedValue(
      new ApiError(
        500,
        "Email Routing management is enabled but EMAIL_WORKER_NAME is not configured",
      ),
    );
    deleteZone.mockResolvedValue({ alreadyMissing: false });

    await expect(
      bindDomain(env, runtimeConfig, {
        rootDomain: "example.org",
      }),
    ).rejects.toMatchObject({
      status: 500,
      message:
        "Email Routing management is enabled but EMAIL_WORKER_NAME is not configured",
    });

    expect(deleteZone).toHaveBeenCalledWith(
      env,
      runtimeConfig,
      {
        rootDomain: "example.org",
        zoneId: "zone_bound",
      },
      {
        projectOperation: "domains.bind",
        projectRoute: "POST /api/domains/bind",
      },
      {
        bypassRateLimitCheck: false,
      },
    );
  });

  it("cleans up the Cloudflare zone when bind persistence fails", async () => {
    const db = {
      ...createDb(),
      insert: vi.fn(() => ({
        values: vi.fn(async () => {
          throw new Error("D1 write failed");
        }),
      })),
    };
    getDb.mockReturnValue(db);
    createZone.mockResolvedValue({
      id: "zone_bound",
      name: "example.org",
      status: "pending",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
    });
    validateZoneAccess.mockResolvedValue(undefined);
    enableDomainRouting.mockResolvedValue(undefined);
    deleteZone.mockResolvedValue({ alreadyMissing: false });

    await expect(
      bindDomain(env, runtimeConfig, {
        rootDomain: "example.org",
      }),
    ).rejects.toThrow("D1 write failed");

    expect(deleteZone).toHaveBeenCalledWith(
      env,
      runtimeConfig,
      {
        rootDomain: "example.org",
        zoneId: "zone_bound",
      },
      {
        projectOperation: "domains.bind",
        projectRoute: "POST /api/domains/bind",
      },
      {
        bypassRateLimitCheck: false,
      },
    );
  });

  it("soft deletes project-bound domains after removing the Cloudflare zone", async () => {
    const db = createDb({
      domainRows: [
        {
          ...baseDomain,
          id: "dom_bound",
          rootDomain: "example.org",
          zoneId: "zone_bound",
          bindingSource: "project_bind",
        },
      ],
      mailboxRows: [],
    });
    getDb.mockReturnValue(db);
    deleteZone.mockResolvedValue({ alreadyMissing: false });

    await expect(
      deleteDomain(env, runtimeConfig, "dom_bound"),
    ).resolves.toBeUndefined();

    expect(deleteZone).toHaveBeenCalledWith(
      env,
      runtimeConfig,
      {
        rootDomain: "example.org",
        zoneId: "zone_bound",
      },
      {
        projectOperation: "domains.delete",
        projectRoute: "POST /api/domains/:id/delete",
      },
    );
    expect(db.update).toHaveBeenCalled();
    expect(db.delete).toHaveBeenCalled();
  });

  it("retries deleting already soft-deleted project-bound domains", async () => {
    const db = createDb({
      domainRows: [
        {
          ...baseDomain,
          id: "dom_bound",
          rootDomain: "example.org",
          zoneId: "zone_bound",
          bindingSource: "project_bind",
          status: "disabled",
          disabledAt: "2026-04-04T00:00:00.000Z",
          deletedAt: "2026-04-04T00:01:00.000Z",
        },
      ],
      mailboxRows: [],
    });
    getDb.mockReturnValue(db);
    deleteZone.mockResolvedValue({ alreadyMissing: false });

    await expect(
      deleteDomain(env, runtimeConfig, "dom_bound"),
    ).resolves.toBeUndefined();

    expect(deleteZone).toHaveBeenCalledWith(
      env,
      runtimeConfig,
      {
        rootDomain: "example.org",
        zoneId: "zone_bound",
      },
      {
        projectOperation: "domains.delete",
        projectRoute: "POST /api/domains/:id/delete",
      },
    );
    expect(db.update).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("restores the local domain state if the Cloudflare delete fails", async () => {
    const db = createDb({
      domainRows: [
        {
          ...baseDomain,
          id: "dom_bound",
          rootDomain: "example.org",
          zoneId: "zone_bound",
          bindingSource: "project_bind",
        },
      ],
      mailboxRows: [],
    });
    getDb.mockReturnValue(db);
    deleteZone.mockRejectedValue(new ApiError(502, "Cloudflare unavailable"));

    await expect(
      deleteDomain(env, runtimeConfig, "dom_bound"),
    ).rejects.toMatchObject({
      status: 502,
      message: "Cloudflare unavailable",
    });

    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it("blocks deleting catalog domains", async () => {
    getDb.mockReturnValue(
      createDb({
        domainRows: [baseDomain],
      }),
    );

    await expect(
      deleteDomain(env, runtimeConfig, "dom_primary"),
    ).rejects.toMatchObject({
      status: 409,
      message: "Only project-bound domains can be deleted",
    });
  });

  it("blocks deleting domains that still have non-destroyed mailboxes", async () => {
    const db = createDb({
      domainRows: [
        {
          ...baseDomain,
          id: "dom_bound",
          rootDomain: "example.org",
          zoneId: "zone_bound",
          bindingSource: "project_bind",
        },
      ],
      mailboxRows: [
        {
          id: "mbx_destroying",
          address: "mail@box.example.org",
          subdomain: "box",
          domainId: "dom_bound",
          status: "destroying",
        },
      ],
    });
    getDb.mockReturnValue(db);

    await expect(
      deleteDomain(env, runtimeConfig, "dom_bound"),
    ).rejects.toMatchObject({
      status: 409,
      message: "Mailbox domain still has non-destroyed mailboxes",
    });
    expect(db.update).toHaveBeenCalledTimes(2);
    expect(deleteZone).not.toHaveBeenCalled();
  });

  it("blocks deleting domains that still have legacy mailboxes without domain ids", async () => {
    getDb.mockReturnValue(
      createDb({
        domainRows: [
          {
            ...baseDomain,
            id: "dom_bound",
            rootDomain: "example.org",
            zoneId: "zone_bound",
            bindingSource: "project_bind",
          },
        ],
        mailboxRows: [
          {
            id: "mbx_legacy",
            address: "mail@box.example.org",
            subdomain: "box",
            domainId: null,
            status: "active",
          },
        ],
      }),
    );

    await expect(
      deleteDomain(env, runtimeConfig, "dom_bound"),
    ).rejects.toMatchObject({
      status: 409,
      message: "Mailbox domain still has non-destroyed mailboxes",
    });
  });

  it("enables catch-all by snapshotting the current Cloudflare rule", async () => {
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

    expect(getCatchAllRule).toHaveBeenCalledWith(
      env,
      runtimeConfig,
      baseDomain,
      {
        projectOperation: "domains.catch_all.enable",
        projectRoute: "POST /api/domains/:id/catch-all/enable",
      },
    );
    expect(updateCatchAllRule).toHaveBeenCalledWith(
      env,
      runtimeConfig,
      baseDomain,
      expect.objectContaining({
        enabled: true,
        actions: [{ type: "worker", value: [runtimeConfig.EMAIL_WORKER_NAME] }],
      }),
      {
        projectOperation: "domains.catch_all.enable",
        projectRoute: "POST /api/domains/:id/catch-all/enable",
      },
    );
    expect(result).toMatchObject({
      id: baseDomain.id,
      catchAllEnabled: true,
    });
  });

  it("disables catch-all by restoring the saved Cloudflare rule snapshot", async () => {
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
    };
    const db = {
      ...createDb({
        domainRows: [catchAllDomain],
      }),
      update: vi.fn((_table: unknown) => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
    };
    getDb.mockReturnValue(db);
    updateCatchAllRule.mockResolvedValue(undefined);

    const result = await disableDomainCatchAll(
      env,
      runtimeConfig,
      catchAllDomain.id,
    );

    expect(updateCatchAllRule).toHaveBeenCalledWith(
      env,
      runtimeConfig,
      catchAllDomain,
      {
        enabled: false,
        name: "Catch all",
        matchers: [{ type: "all" }],
        actions: [{ type: "forward", value: ["owner@example.com"] }],
      },
      {
        projectOperation: "domains.catch_all.disable",
        projectRoute: "POST /api/domains/:id/catch-all/disable",
      },
    );
    expect(result).toMatchObject({
      id: catchAllDomain.id,
      catchAllEnabled: false,
    });
    expect(db.update).toHaveBeenCalledWith(mailboxes);
  });

  it("backfills registered mailbox routes before disabling catch-all", async () => {
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

    await disableDomainCatchAll(env, runtimeConfig, catchAllDomain.id);

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
  });

  it("keeps catch-all enabled when route backfill fails", async () => {
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
    createRoutingRule.mockRejectedValue(
      new ApiError(
        429,
        "Cloudflare API rate limit reached; retry later",
        {
          retryAfter: "2026-04-14T10:00:00.000Z",
          retryAfterSeconds: 120,
          source: "cloudflare",
        },
        { "retry-after": "120" },
      ),
    );

    await expect(
      disableDomainCatchAll(env, runtimeConfig, catchAllDomain.id),
    ).rejects.toMatchObject({
      status: 429,
      message: "Cloudflare API rate limit reached; retry later",
    });

    expect(updateCatchAllRule).not.toHaveBeenCalled();
    expect(deleteRoutingRule).not.toHaveBeenCalled();
  });

  it("refuses to disable catch-all when Cloudflare routing management is off", async () => {
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
    };
    const db = createDb({
      domainRows: [catchAllDomain],
    });
    getDb.mockReturnValue(db);

    await expect(
      disableDomainCatchAll(
        env,
        {
          ...runtimeConfig,
          EMAIL_ROUTING_MANAGEMENT_ENABLED: false,
        },
        catchAllDomain.id,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "Catch-all disable requires EMAIL_ROUTING_MANAGEMENT_ENABLED=true",
    });
    expect(updateCatchAllRule).not.toHaveBeenCalled();
  });

  it("blocks domain disable when catch-all is enabled but management is now off", async () => {
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
    };
    const db = createSequencedDb({
      domainRows: [[catchAllDomain], [catchAllDomain]],
    });
    getDb.mockReturnValue(db);

    await expect(
      disableDomain(
        env,
        {
          ...runtimeConfig,
          EMAIL_ROUTING_MANAGEMENT_ENABLED: false,
        },
        catchAllDomain.id,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "Catch-all disable requires EMAIL_ROUTING_MANAGEMENT_ENABLED=true",
    });

    expect(updateCatchAllRule).not.toHaveBeenCalled();
  });
});
