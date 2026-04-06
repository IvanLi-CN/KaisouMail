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
  classifyMailboxAddressState,
  createMailboxForUser,
  resolveRequestedMailboxAddress,
} from "../services/mailboxes";

const baseMailbox = {
  id: "mbx_alpha",
  userId: "usr_1",
  domainId: "dom_primary",
  localPart: "build",
  subdomain: "alpha",
  address: "build@alpha.707979.xyz",
  routingRuleId: "rule_alpha",
  status: "active",
  createdAt: "2026-04-03T12:00:00.000Z",
  expiresAt: "2026-04-03T13:00:00.000Z",
  destroyedAt: null,
} as const;

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
  EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
  CLOUDFLARE_API_TOKEN: "cf-token",
  EMAIL_WORKER_NAME: "mail-worker",
  SESSION_SECRET: "super-secret-session-key",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
} as const;

const createMailboxDb = (options?: {
  domainRows?: unknown[];
  mailboxRows?: unknown[];
  subdomainRows?: unknown[];
  subdomainInsertError?: Error | null;
  subdomainUpdateError?: Error | null;
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

  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => rowsForTable(table)),
          orderBy: vi.fn(async () => rowsForTable(table)),
        })),
        orderBy: vi.fn(async () => rowsForTable(table)),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async () => {
        if (table === subdomains && options?.subdomainInsertError) {
          throw options.subdomainInsertError;
        }
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => {
          if (table === subdomains && options?.subdomainUpdateError) {
            throw options.subdomainUpdateError;
          }
        }),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  };
};

describe("mailbox service helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses an active mailbox visible to the caller", () => {
    const result = classifyMailboxAddressState([baseMailbox], memberUser);
    expect(result.kind).toBe("reuse");
    if (result.kind === "reuse") {
      expect(result.row.id).toBe("mbx_alpha");
    }
  });

  it("treats another user's active mailbox as a conflict", () => {
    const result = classifyMailboxAddressState(
      [
        {
          ...baseMailbox,
          userId: "usr_2",
        },
      ],
      memberUser,
    );

    expect(result.kind).toBe("conflict");
  });

  it("allows recreating an address when only destroyed mailboxes remain", () => {
    const result = classifyMailboxAddressState(
      [
        {
          ...baseMailbox,
          status: "destroyed",
          destroyedAt: "2026-04-03T12:30:00.000Z",
          routingRuleId: null,
        },
      ],
      memberUser,
    );

    expect(result.kind).toBe("create");
  });

  it("parses an ensured address against the configured root domain", () => {
    expect(
      resolveRequestedMailboxAddress(
        {
          address: "Build@Ops.Alpha.707979.xyz",
        },
        ["707979.xyz", "mail.example.net"],
      ),
    ).toEqual({
      localPart: "build",
      subdomain: "ops.alpha",
      rootDomain: "707979.xyz",
      address: "build@ops.alpha.707979.xyz",
    });
  });

  it("picks an active root domain when ensure input omits it", () => {
    const originalRandom = Math.random;
    Math.random = () => 0.99;

    try {
      expect(
        resolveRequestedMailboxAddress(
          {
            localPart: "build",
            subdomain: "ops.alpha",
          },
          ["707979.xyz", "mail.example.net"],
        ),
      ).toEqual({
        localPart: "build",
        subdomain: "ops.alpha",
        rootDomain: "mail.example.net",
        address: "build@ops.alpha.mail.example.net",
      });
    } finally {
      Math.random = originalRandom;
    }
  });

  it("rolls back a created mailbox when subdomain persistence fails", async () => {
    const domain = {
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
    const db = createMailboxDb({
      domainRows: [
        {
          id: domain.id,
          status: "active",
          zoneId: domain.zoneId,
          deletedAt: null,
        },
      ],
      mailboxRows: [],
      subdomainRows: [],
      subdomainInsertError: new Error("subdomain write failed"),
    });
    getDb.mockReturnValue(db);
    requireActiveDomainByRootDomain.mockResolvedValue(domain);
    ensureSubdomainEnabled.mockResolvedValue(undefined);
    createRoutingRule.mockResolvedValue("rule_new");

    const env = {
      DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn(async () => ({
              meta: {
                changes: 1,
              },
            })),
          })),
        })),
      },
    } as never;

    await expect(
      createMailboxForUser(env, runtimeConfig, memberUser, {
        localPart: "build",
        subdomain: "ops",
        rootDomain: domain.rootDomain,
      }),
    ).rejects.toThrow("subdomain write failed");

    expect(deleteRoutingRule).toHaveBeenCalledWith(
      runtimeConfig,
      domain,
      "rule_new",
    );
    expect(db.delete).toHaveBeenCalledWith(mailboxes);
  });

  it("aborts mailbox creation when the domain row has been rebound to another zone", async () => {
    const domain = {
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
    const db = createMailboxDb({
      domainRows: [
        {
          id: domain.id,
          status: "active",
          zoneId: "zone_rebound",
          deletedAt: null,
        },
      ],
      mailboxRows: [],
      subdomainRows: [],
    });
    getDb.mockReturnValue(db);
    requireActiveDomainByRootDomain.mockResolvedValue(domain);

    await expect(
      createMailboxForUser(
        {
          DB: {
            prepare: vi.fn(),
          },
        } as never,
        runtimeConfig,
        memberUser,
        {
          localPart: "build",
          subdomain: "ops",
          rootDomain: domain.rootDomain,
        },
      ),
    ).rejects.toThrow("Mailbox domain is no longer available");

    expect(ensureSubdomainEnabled).not.toHaveBeenCalled();
    expect(createRoutingRule).not.toHaveBeenCalled();
  });
});
