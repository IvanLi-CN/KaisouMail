import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
const {
  createZone,
  deleteZone,
  enableDomainRouting,
  listZones,
  validateZoneAccess,
} = vi.hoisted(() => ({
  createZone: vi.fn(),
  deleteZone: vi.fn(),
  enableDomainRouting: vi.fn(),
  listZones: vi.fn(),
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
    createZone,
    deleteZone,
    enableDomainRouting,
    listZones,
    validateZoneAccess,
  };
});

import { domains, mailboxes } from "../db/schema";
import {
  bindDomain,
  classifyDomainCreateState,
  createDomain,
  deleteDomain,
  listDomainCatalog,
} from "../services/domains";

const baseDomain = {
  id: "dom_primary",
  rootDomain: "707979.xyz",
  zoneId: "zone_primary",
  bindingSource: "catalog",
  status: "active",
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

    expect(catalog).toEqual([
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

    expect(validateZoneAccess).toHaveBeenCalledWith(runtimeConfig, {
      rootDomain: "ops.example.org",
      zoneId: "zone_available",
    });
    expect(enableDomainRouting).toHaveBeenCalledWith(runtimeConfig, {
      rootDomain: "ops.example.org",
      zoneId: "zone_available",
    });
    expect(db.insert).toHaveBeenCalled();
    expect(result.domain).toMatchObject({
      rootDomain: "ops.example.org",
      zoneId: "zone_available",
      bindingSource: "catalog",
      status: "active",
    });
  });

  it("creates a project-bound domain through Cloudflare bind", async () => {
    const db = createDb();
    getDb.mockReturnValue(db);
    createZone.mockResolvedValue({
      id: "zone_bound",
      name: "bound.example.org",
      status: "pending",
      nameServers: ["amy.ns.cloudflare.com", "kai.ns.cloudflare.com"],
    });
    validateZoneAccess.mockResolvedValue(undefined);
    enableDomainRouting.mockResolvedValue(undefined);

    const result = await bindDomain(env, runtimeConfig, {
      rootDomain: "bound.example.org",
    });

    expect(createZone).toHaveBeenCalledWith(runtimeConfig, "bound.example.org");
    expect(result.domain).toMatchObject({
      rootDomain: "bound.example.org",
      zoneId: "zone_bound",
      bindingSource: "project_bind",
    });
  });

  it("soft deletes project-bound domains after removing the Cloudflare zone", async () => {
    const db = createDb({
      domainRows: [
        {
          ...baseDomain,
          id: "dom_bound",
          rootDomain: "bound.example.org",
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

    expect(deleteZone).toHaveBeenCalledWith(runtimeConfig, {
      rootDomain: "bound.example.org",
      zoneId: "zone_bound",
    });
    expect(db.update).toHaveBeenCalled();
    expect(db.delete).toHaveBeenCalled();
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

  it("blocks deleting domains that still have active mailboxes", async () => {
    getDb.mockReturnValue(
      createDb({
        domainRows: [
          {
            ...baseDomain,
            id: "dom_bound",
            rootDomain: "bound.example.org",
            zoneId: "zone_bound",
            bindingSource: "project_bind",
          },
        ],
        mailboxRows: [{ id: "mbx_active" }],
      }),
    );

    await expect(
      deleteDomain(env, runtimeConfig, "dom_bound"),
    ).rejects.toMatchObject({
      status: 409,
      message: "Mailbox domain still has active mailboxes",
    });
  });
});
