import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
const { createRoutingRule, deleteRoutingRule, ensureSubdomainEnabled } =
  vi.hoisted(() => ({
    createRoutingRule: vi.fn(),
    deleteRoutingRule: vi.fn(),
    ensureSubdomainEnabled: vi.fn(),
  }));
const { ensureMailboxSubdomainOnboardedForWildcardDns } = vi.hoisted(() => ({
  ensureMailboxSubdomainOnboardedForWildcardDns: vi.fn(),
}));
const {
  listActiveRootDomains,
  pickRandomActiveDomain,
  requireActiveDomainByRootDomain,
  resolveMailboxDomain,
} = vi.hoisted(() => ({
  listActiveRootDomains: vi.fn(),
  pickRandomActiveDomain: vi.fn(),
  requireActiveDomainByRootDomain: vi.fn(),
  resolveMailboxDomain: vi.fn(),
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
    deleteRoutingRule,
    ensureSubdomainEnabled,
  };
});

vi.mock("../services/cloudflare-mailbox-dns", async () => {
  const actual = await vi.importActual<
    typeof import("../services/cloudflare-mailbox-dns")
  >("../services/cloudflare-mailbox-dns");
  return {
    ...actual,
    ensureMailboxSubdomainOnboardedForWildcardDns,
  };
});

vi.mock("../services/domains", async () => {
  const actual = await vi.importActual<typeof import("../services/domains")>(
    "../services/domains",
  );
  return {
    ...actual,
    listActiveRootDomains,
    pickRandomActiveDomain,
    requireActiveDomainByRootDomain,
    resolveMailboxDomain,
  };
});

import { domains, mailboxes, subdomains } from "../db/schema";
import {
  createMailboxForUser,
  ensureMailboxForUser,
} from "../services/mailboxes";

const memberUser = {
  id: "usr_1",
  email: "member@example.com",
  name: "Member",
  role: "member",
} as const;

const runtimeConfig = {
  APP_ENV: "development",
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

const insertSuccessEnv = {
  DB: {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn(async () => ({ meta: { changes: 1 } })),
      })),
    })),
  },
} as never;

const createMailboxDb = (options?: {
  domainRows?: unknown[];
  mailboxRows?: unknown[];
  subdomainRows?: unknown[];
  onSubdomainInsert?: (values: unknown) => void;
}) => {
  const domainRows = options?.domainRows ?? [];
  const mailboxRows = options?.mailboxRows ?? [];
  const subdomainRows = options?.subdomainRows ?? [];

  const rowsForTable = (table: unknown) => {
    if (table === domains) return domainRows;
    if (table === mailboxes) return mailboxRows;
    if (table === subdomains) return subdomainRows;
    return [];
  };

  const buildWhereResult = (table: unknown) =>
    Object.assign(Promise.resolve(rowsForTable(table)), {
      limit: vi.fn(async () => rowsForTable(table)),
      orderBy: vi.fn(async () => rowsForTable(table)),
    });

  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => buildWhereResult(table)),
        orderBy: vi.fn(async () => rowsForTable(table)),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (values: unknown) => {
        if (table === subdomains) {
          options?.onSubdomainInsert?.(values);
        }
      }),
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

describe("mailboxes wildcard migration guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureMailboxSubdomainOnboardedForWildcardDns.mockResolvedValue({
      fqdn: "ops.707979.xyz",
    });
  });

  it("blocks create on allowlisted catch-all domains that have not finished wildcard cutover", async () => {
    const domain = {
      id: "dom_primary",
      rootDomain: "707979.xyz",
      zoneId: "zone_primary",
      bindingSource: "catalog",
      status: "active",
      catchAllEnabled: true,
      catchAllOwnerUserId: "usr_1",
      subdomainDnsMode: "explicit",
      wildcardDnsVerifiedAt: null,
      wildcardDnsLastError: "Record quota exceeded.",
      createdAt: "2026-04-03T12:00:00.000Z",
      updatedAt: "2026-04-03T12:00:00.000Z",
      lastProvisionedAt: "2026-04-03T12:00:00.000Z",
      disabledAt: null,
      deletedAt: null,
    } as const;
    const db = createMailboxDb({
      domainRows: [
        {
          id: domain.id,
          rootDomain: domain.rootDomain,
          status: "active",
          zoneId: domain.zoneId,
          deletedAt: null,
          catchAllEnabled: true,
          catchAllOwnerUserId: "usr_1",
          subdomainDnsMode: "explicit",
          wildcardDnsVerifiedAt: null,
          wildcardDnsLastError: "Record quota exceeded.",
        },
      ],
      mailboxRows: [],
      subdomainRows: [],
    });
    getDb.mockReturnValue(db);
    requireActiveDomainByRootDomain.mockResolvedValue(domain);

    await expect(
      createMailboxForUser(
        insertSuccessEnv,
        {
          ...runtimeConfig,
          WILDCARD_SUBDOMAIN_DNS_ENABLED: true,
          WILDCARD_SUBDOMAIN_DNS_ALLOWLIST: [domain.rootDomain],
        },
        memberUser,
        {
          localPart: "build",
          subdomain: "ops",
          rootDomain: domain.rootDomain,
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "Catch-all domain must finish wildcard DNS migration before mailbox writes can continue",
    });

    expect(ensureSubdomainEnabled).not.toHaveBeenCalled();
    expect(
      ensureMailboxSubdomainOnboardedForWildcardDns,
    ).not.toHaveBeenCalled();
    expect(createRoutingRule).not.toHaveBeenCalled();
    expect(db.delete).toHaveBeenCalledWith(mailboxes);
  });

  it("blocks ensure/promote on allowlisted catch-all domains that are still explicit", async () => {
    const domain = {
      id: "dom_primary",
      rootDomain: "707979.xyz",
      zoneId: "zone_primary",
      bindingSource: "catalog",
      status: "active",
      catchAllEnabled: true,
      catchAllOwnerUserId: "usr_1",
      subdomainDnsMode: "explicit",
      wildcardDnsVerifiedAt: null,
      wildcardDnsLastError: "Record quota exceeded.",
      createdAt: "2026-04-03T12:00:00.000Z",
      updatedAt: "2026-04-03T12:00:00.000Z",
      lastProvisionedAt: "2026-04-03T12:00:00.000Z",
      disabledAt: null,
      deletedAt: null,
    } as const;
    const catchAllMailbox = {
      id: "mbx_alpha",
      userId: "usr_1",
      domainId: domain.id,
      localPart: "build",
      subdomain: "ops",
      address: "build@ops.707979.xyz",
      source: "catch_all",
      routingRuleId: null,
      status: "active",
      createdAt: "2026-04-03T12:00:00.000Z",
      expiresAt: null,
      destroyedAt: null,
    } as const;
    const db = createMailboxDb({
      domainRows: [{ id: domain.id, rootDomain: domain.rootDomain }],
      mailboxRows: [catchAllMailbox],
      subdomainRows: [],
    });
    getDb.mockReturnValue(db);
    listActiveRootDomains.mockResolvedValue([domain.rootDomain]);
    resolveMailboxDomain.mockResolvedValue(domain);

    await expect(
      ensureMailboxForUser(
        {} as never,
        {
          ...runtimeConfig,
          WILDCARD_SUBDOMAIN_DNS_ENABLED: true,
          WILDCARD_SUBDOMAIN_DNS_ALLOWLIST: [domain.rootDomain],
        },
        memberUser,
        {
          address: catchAllMailbox.address,
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "Catch-all domain must finish wildcard DNS migration before mailbox writes can continue",
    });

    expect(ensureSubdomainEnabled).not.toHaveBeenCalled();
    expect(
      ensureMailboxSubdomainOnboardedForWildcardDns,
    ).not.toHaveBeenCalled();
    expect(createRoutingRule).not.toHaveBeenCalled();
  });

  it("keeps non-allowlisted catch-all domains on explicit DNS during mailbox create", async () => {
    const domain = {
      id: "dom_primary",
      rootDomain: "707979.xyz",
      zoneId: "zone_primary",
      bindingSource: "catalog",
      status: "active",
      catchAllEnabled: true,
      catchAllOwnerUserId: "usr_1",
      subdomainDnsMode: "explicit",
      wildcardDnsVerifiedAt: null,
      wildcardDnsLastError: null,
      createdAt: "2026-04-03T12:00:00.000Z",
      updatedAt: "2026-04-03T12:00:00.000Z",
      lastProvisionedAt: "2026-04-03T12:00:00.000Z",
      disabledAt: null,
      deletedAt: null,
    } as const;
    const db = createMailboxDb({
      domainRows: [
        {
          id: domain.id,
          rootDomain: domain.rootDomain,
          status: "active",
          zoneId: domain.zoneId,
          deletedAt: null,
          catchAllEnabled: true,
          catchAllOwnerUserId: "usr_1",
          subdomainDnsMode: "explicit",
          wildcardDnsVerifiedAt: null,
          wildcardDnsLastError: null,
        },
      ],
      mailboxRows: [],
      subdomainRows: [],
    });
    getDb.mockReturnValue(db);
    requireActiveDomainByRootDomain.mockResolvedValue(domain);
    ensureSubdomainEnabled.mockResolvedValue(undefined);

    const created = await createMailboxForUser(
      insertSuccessEnv,
      runtimeConfig,
      memberUser,
      {
        localPart: "build",
        subdomain: "ops",
        rootDomain: domain.rootDomain,
      },
    );

    expect(ensureSubdomainEnabled).toHaveBeenCalledTimes(1);
    expect(
      ensureMailboxSubdomainOnboardedForWildcardDns,
    ).not.toHaveBeenCalled();
    expect(createRoutingRule).not.toHaveBeenCalled();
    expect(created).toMatchObject({
      address: "build@ops.707979.xyz",
      routingRuleId: null,
      source: "registered",
    });
  });

  it("onboards fresh wildcard subdomains through Cloudflare while keeping wildcard metadata", async () => {
    const subdomainInsertValues: unknown[] = [];
    const domain = {
      id: "dom_primary",
      rootDomain: "707979.xyz",
      zoneId: "zone_primary",
      bindingSource: "catalog",
      status: "active",
      catchAllEnabled: true,
      catchAllOwnerUserId: "usr_1",
      subdomainDnsMode: "wildcard",
      wildcardDnsVerifiedAt: "2026-04-03T12:05:00.000Z",
      wildcardDnsLastError: null,
      createdAt: "2026-04-03T12:00:00.000Z",
      updatedAt: "2026-04-03T12:05:00.000Z",
      lastProvisionedAt: "2026-04-03T12:00:00.000Z",
      disabledAt: null,
      deletedAt: null,
    } as const;
    const db = createMailboxDb({
      domainRows: [
        {
          id: domain.id,
          rootDomain: domain.rootDomain,
          status: "active",
          zoneId: domain.zoneId,
          deletedAt: null,
          catchAllEnabled: true,
          catchAllOwnerUserId: "usr_1",
          subdomainDnsMode: "wildcard",
          wildcardDnsVerifiedAt: domain.wildcardDnsVerifiedAt,
          wildcardDnsLastError: null,
        },
      ],
      mailboxRows: [],
      subdomainRows: [],
      onSubdomainInsert: (values) => subdomainInsertValues.push(values),
    });
    getDb.mockReturnValue(db);
    requireActiveDomainByRootDomain.mockResolvedValue(domain);

    const created = await createMailboxForUser(
      insertSuccessEnv,
      runtimeConfig,
      memberUser,
      {
        localPart: "build",
        subdomain: "ops",
        rootDomain: domain.rootDomain,
      },
    );

    expect(ensureSubdomainEnabled).not.toHaveBeenCalled();
    expect(ensureMailboxSubdomainOnboardedForWildcardDns).toHaveBeenCalledTimes(
      1,
    );
    expect(ensureMailboxSubdomainOnboardedForWildcardDns).toHaveBeenCalledWith(
      insertSuccessEnv,
      runtimeConfig,
      domain,
      "ops",
      {
        projectOperation: "mailboxes.create",
        projectRoute: "POST /api/mailboxes",
      },
    );
    expect(createRoutingRule).not.toHaveBeenCalled();
    expect(subdomainInsertValues).toEqual([
      expect.objectContaining({
        domainId: domain.id,
        name: "ops",
        metadata: JSON.stringify({
          mode: "wildcard",
          deliveryProvisioned: true,
        }),
      }),
    ]);
    expect(created).toMatchObject({
      address: "build@ops.707979.xyz",
      routingRuleId: null,
      source: "registered",
    });
  });

  it("reuses already-onboarded wildcard subdomains without re-running Cloudflare onboarding", async () => {
    const domain = {
      id: "dom_primary",
      rootDomain: "707979.xyz",
      zoneId: "zone_primary",
      bindingSource: "catalog",
      status: "active",
      catchAllEnabled: true,
      catchAllOwnerUserId: "usr_1",
      subdomainDnsMode: "wildcard",
      wildcardDnsVerifiedAt: "2026-04-03T12:05:00.000Z",
      wildcardDnsLastError: null,
      createdAt: "2026-04-03T12:00:00.000Z",
      updatedAt: "2026-04-03T12:05:00.000Z",
      lastProvisionedAt: "2026-04-03T12:00:00.000Z",
      disabledAt: null,
      deletedAt: null,
    } as const;
    const db = createMailboxDb({
      domainRows: [
        {
          id: domain.id,
          rootDomain: domain.rootDomain,
          status: "active",
          zoneId: domain.zoneId,
          deletedAt: null,
          catchAllEnabled: true,
          catchAllOwnerUserId: "usr_1",
          subdomainDnsMode: "wildcard",
          wildcardDnsVerifiedAt: domain.wildcardDnsVerifiedAt,
          wildcardDnsLastError: null,
        },
      ],
      mailboxRows: [],
      subdomainRows: [
        {
          id: "sub_ops",
          domainId: domain.id,
          name: "ops",
          enabledAt: "2026-04-03T12:05:00.000Z",
          lastUsedAt: "2026-04-03T12:05:00.000Z",
          cleanupNextAttemptAt: null,
          cleanupLastError: null,
          metadata: JSON.stringify({
            mode: "wildcard",
            deliveryProvisioned: true,
          }),
        },
      ],
    });
    getDb.mockReturnValue(db);
    requireActiveDomainByRootDomain.mockResolvedValue(domain);

    const created = await createMailboxForUser(
      insertSuccessEnv,
      runtimeConfig,
      memberUser,
      {
        localPart: "alerts",
        subdomain: "ops",
        rootDomain: domain.rootDomain,
      },
    );

    expect(
      ensureMailboxSubdomainOnboardedForWildcardDns,
    ).not.toHaveBeenCalled();
    expect(ensureSubdomainEnabled).not.toHaveBeenCalled();
    expect(createRoutingRule).not.toHaveBeenCalled();
    expect(created).toMatchObject({
      address: "alerts@ops.707979.xyz",
      routingRuleId: null,
      source: "registered",
    });
  });
});