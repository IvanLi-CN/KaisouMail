import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
const { enableDomainRouting, listZones, validateZoneAccess } = vi.hoisted(
  () => ({
    enableDomainRouting: vi.fn(),
    listZones: vi.fn(),
    validateZoneAccess: vi.fn(),
  }),
);

vi.mock("../db/client", () => ({
  getDb,
}));

vi.mock("../services/emailRouting", async () => {
  const actual = await vi.importActual<
    typeof import("../services/emailRouting")
  >("../services/emailRouting");
  return {
    ...actual,
    enableDomainRouting,
    listZones,
    validateZoneAccess,
  };
});

import {
  classifyDomainCreateState,
  createDomain,
  listDomainCatalog,
} from "../services/domains";

const baseDomain = {
  id: "dom_primary",
  rootDomain: "707979.xyz",
  zoneId: "zone_primary",
  status: "active",
  lastProvisionError: null,
  createdAt: "2026-04-03T12:00:00.000Z",
  updatedAt: "2026-04-03T12:00:00.000Z",
  lastProvisionedAt: "2026-04-03T12:00:00.000Z",
  disabledAt: null,
} as const;

const env = {} as never;
const runtimeConfig = {
  APP_ENV: "development",
  DEFAULT_MAILBOX_TTL_MINUTES: 60,
  CLEANUP_BATCH_SIZE: 3,
  EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
  CLOUDFLARE_API_TOKEN: "cf-token",
  EMAIL_WORKER_NAME: "mail-worker",
  SESSION_SECRET: "super-secret-session-key",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  CF_ROUTE_RULESET_TAG: "cf-mail",
} as const;

const createDb = (rows: unknown[]) => ({
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      orderBy: vi.fn(async () => rows),
      where: vi.fn(() => ({
        limit: vi.fn(async () => rows),
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
});

describe("domain create state", () => {
  it("creates a new record when the root domain is unknown", () => {
    expect(classifyDomainCreateState(null)).toEqual({ kind: "create" });
  });

  it("blocks duplicates while the domain is active", () => {
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
});

describe("domain catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges Cloudflare zones with local project states", async () => {
    getDb.mockReturnValue(
      createDb([
        baseDomain,
        {
          ...baseDomain,
          id: "dom_missing",
          rootDomain: "missing.example.io",
          zoneId: "zone_missing",
          status: "disabled",
          updatedAt: "2026-04-03T12:10:00.000Z",
          disabledAt: "2026-04-03T12:10:00.000Z",
        },
      ]),
    );
    listZones.mockResolvedValue([
      { id: "zone_primary", name: "707979.xyz" },
      { id: "zone_available", name: "ops.example.org" },
    ]);

    const catalog = await listDomainCatalog(env, runtimeConfig);

    expect(catalog).toEqual([
      expect.objectContaining({
        rootDomain: "707979.xyz",
        cloudflareAvailability: "available",
        projectStatus: "active",
      }),
      expect.objectContaining({
        rootDomain: "missing.example.io",
        cloudflareAvailability: "missing",
        projectStatus: "disabled",
      }),
      expect.objectContaining({
        rootDomain: "ops.example.org",
        cloudflareAvailability: "available",
        projectStatus: "not_enabled",
        id: null,
      }),
    ]);
  });

  it("rejects enabling a domain that is not present in the Cloudflare catalog", async () => {
    getDb.mockReturnValue(createDb([]));
    listZones.mockResolvedValue([
      { id: "zone_other", name: "other.example.org" },
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
    const db = createDb([]);
    getDb.mockReturnValue(db);
    listZones.mockResolvedValue([
      { id: "zone_available", name: "ops.example.org" },
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
      status: "active",
    });
  });
});
