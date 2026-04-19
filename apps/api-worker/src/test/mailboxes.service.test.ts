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
  ensureMailboxForUser,
  resolveRequestedMailboxAddress,
} from "../services/mailboxes";

const baseMailbox = {
  id: "mbx_alpha",
  userId: "usr_1",
  domainId: "dom_primary",
  localPart: "build",
  subdomain: "alpha",
  address: "build@alpha.707979.xyz",
  source: "registered",
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
  SUBDOMAIN_CLEANUP_BATCH_SIZE: 1,
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
  onSubdomainInsert?: (values: unknown) => void;
  onSubdomainUpdate?: (values: Record<string, unknown>) => void;
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
        if (table === subdomains && options?.subdomainInsertError) {
          throw options.subdomainInsertError;
        }
      }),
    })),
    update: vi.fn((_table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          if (_table === subdomains) {
            options?.onSubdomainUpdate?.(values);
          }
          if (_table === subdomains && options?.subdomainUpdateError) {
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

  it("treats a mailbox that is still destroying as a conflict", () => {
    const result = classifyMailboxAddressState(
      [
        {
          ...baseMailbox,
          status: "destroying",
          routingRuleId: null,
        },
      ],
      memberUser,
    );

    expect(result.kind).toBe("conflict");
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

  it("creates unlimited mailboxes with a null expiresAt", async () => {
    const db = createMailboxDb({
      domainRows: [
        {
          id: "dom_primary",
          status: "active",
          zoneId: "zone_primary",
          deletedAt: null,
        },
      ],
      mailboxRows: [],
      subdomainRows: [],
    });
    getDb.mockReturnValue(db);
    pickRandomActiveDomain.mockResolvedValue({
      id: "dom_primary",
      rootDomain: "707979.xyz",
      zoneId: "zone_primary",
    });
    ensureSubdomainEnabled.mockResolvedValue(undefined);
    createRoutingRule.mockResolvedValue("rule_created");

    const created = await createMailboxForUser(
      {
        DB: {
          prepare: vi.fn(() => ({
            bind: vi.fn(() => ({
              run: vi.fn(async () => ({ meta: { changes: 1 } })),
            })),
          })),
        },
      } as never,
      runtimeConfig,
      memberUser,
      {
        localPart: "build",
        subdomain: "alpha",
        expiresInMinutes: null,
      },
    );

    expect(created.expiresAt).toBeNull();
  });

  it("retries generated mailbox candidates when the first readable address is already taken", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;

    const domain = {
      id: "dom_primary",
      rootDomain: "707979.xyz",
      zoneId: "zone_primary",
      bindingSource: "catalog",
      status: "active",
      catchAllEnabled: false,
      lastProvisionError: null,
      createdAt: "2026-04-03T12:00:00.000Z",
      updatedAt: "2026-04-03T12:00:00.000Z",
      lastProvisionedAt: "2026-04-03T12:00:00.000Z",
      disabledAt: null,
      deletedAt: null,
    } as const;
    const baseDb = createMailboxDb({
      domainRows: [
        {
          id: domain.id,
          status: "active",
          zoneId: domain.zoneId,
          deletedAt: null,
        },
      ],
      subdomainRows: [],
    });

    const mailboxLookupRows = [
      [
        {
          ...baseMailbox,
          localPart: "ava-lin",
          subdomain: "mail",
          address: "ava-lin@mail.707979.xyz",
        },
      ],
      [],
    ];

    const db = {
      ...baseDb,
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table === mailboxes) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => []),
                orderBy: vi.fn(async () => mailboxLookupRows.shift() ?? []),
              })),
              orderBy: vi.fn(async () => mailboxLookupRows.shift() ?? []),
            };
          }

          if (table === domains) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => [
                  {
                    id: domain.id,
                    status: "active",
                    zoneId: domain.zoneId,
                    deletedAt: null,
                  },
                ]),
                orderBy: vi.fn(async () => []),
              })),
              orderBy: vi.fn(async () => []),
            };
          }

          if (table === subdomains) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => []),
                orderBy: vi.fn(async () => []),
              })),
              orderBy: vi.fn(async () => []),
            };
          }

          return {
            where: vi.fn(() => ({
              limit: vi.fn(async () => []),
              orderBy: vi.fn(async () => []),
            })),
            orderBy: vi.fn(async () => []),
          };
        }),
      })),
    };

    getDb.mockReturnValue(db);
    requireActiveDomainByRootDomain.mockResolvedValue(domain);
    ensureSubdomainEnabled.mockResolvedValue(undefined);
    createRoutingRule.mockResolvedValue("rule_retry");

    const bind = vi.fn(() => ({
      run: vi.fn(async () => ({
        meta: {
          changes: 1,
        },
      })),
    }));
    const prepare = vi.fn(() => ({ bind }));

    try {
      const created = await createMailboxForUser(
        {
          DB: {
            prepare,
          },
        } as never,
        runtimeConfig,
        memberUser,
        {
          rootDomain: domain.rootDomain,
        },
      );

      expect(created.address).toBe("ava-lin00@mail00.707979.xyz");
      expect(createRoutingRule).toHaveBeenCalledWith(
        expect.any(Object),
        runtimeConfig,
        expect.objectContaining({
          rootDomain: domain.rootDomain,
          zoneId: domain.zoneId,
        }),
        "ava-lin00@mail00.707979.xyz",
        {
          projectOperation: "mailboxes.create",
          projectRoute: "POST /api/mailboxes",
        },
      );
      expect(ensureSubdomainEnabled).toHaveBeenCalledWith(
        expect.any(Object),
        runtimeConfig,
        expect.objectContaining({
          rootDomain: domain.rootDomain,
          zoneId: domain.zoneId,
        }),
        "mail00",
        {
          projectOperation: "mailboxes.create",
          projectRoute: "POST /api/mailboxes",
        },
      );
    } finally {
      Math.random = originalRandom;
    }
  });

  it("retries generated mailbox candidates when the insert loses the uniqueness race", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;

    const domain = {
      id: "dom_primary",
      rootDomain: "707979.xyz",
      zoneId: "zone_primary",
      bindingSource: "catalog",
      status: "active",
      catchAllEnabled: false,
      lastProvisionError: null,
      createdAt: "2026-04-03T12:00:00.000Z",
      updatedAt: "2026-04-03T12:00:00.000Z",
      lastProvisionedAt: "2026-04-03T12:00:00.000Z",
      disabledAt: null,
      deletedAt: null,
    } as const;
    const baseDb = createMailboxDb({
      domainRows: [
        {
          id: domain.id,
          status: "active",
          zoneId: domain.zoneId,
          deletedAt: null,
        },
      ],
      subdomainRows: [],
    });

    const mailboxLookupRows = [[], []];

    const db = {
      ...baseDb,
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table === mailboxes) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => []),
                orderBy: vi.fn(async () => mailboxLookupRows.shift() ?? []),
              })),
              orderBy: vi.fn(async () => mailboxLookupRows.shift() ?? []),
            };
          }

          if (table === domains) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => [
                  {
                    id: domain.id,
                    status: "active",
                    zoneId: domain.zoneId,
                    deletedAt: null,
                  },
                ]),
                orderBy: vi.fn(async () => []),
              })),
              orderBy: vi.fn(async () => []),
            };
          }

          if (table === subdomains) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => []),
                orderBy: vi.fn(async () => []),
              })),
              orderBy: vi.fn(async () => []),
            };
          }

          return {
            where: vi.fn(() => ({
              limit: vi.fn(async () => []),
              orderBy: vi.fn(async () => []),
            })),
            orderBy: vi.fn(async () => []),
          };
        }),
      })),
    };

    getDb.mockReturnValue(db);
    requireActiveDomainByRootDomain.mockResolvedValue(domain);
    ensureSubdomainEnabled.mockResolvedValue(undefined);
    createRoutingRule.mockResolvedValueOnce("rule_race_2");

    const run = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("UNIQUE constraint failed: mailboxes.address"),
      )
      .mockResolvedValueOnce({
        meta: {
          changes: 1,
        },
      });
    const bind = vi.fn(() => ({ run }));
    const prepare = vi.fn(() => ({ bind }));

    try {
      const created = await createMailboxForUser(
        {
          DB: {
            prepare,
          },
        } as never,
        runtimeConfig,
        memberUser,
        {
          rootDomain: domain.rootDomain,
        },
      );

      expect(created.address).toBe("ava-lin00@mail00.707979.xyz");
      expect(ensureSubdomainEnabled).toHaveBeenCalledTimes(1);
      expect(ensureSubdomainEnabled).toHaveBeenCalledWith(
        expect.any(Object),
        runtimeConfig,
        expect.objectContaining({
          rootDomain: domain.rootDomain,
          zoneId: domain.zoneId,
        }),
        "mail00",
        {
          projectOperation: "mailboxes.create",
          projectRoute: "POST /api/mailboxes",
        },
      );
      expect(db.update).toHaveBeenCalledWith(mailboxes);
      expect(createRoutingRule).toHaveBeenCalledTimes(1);
      expect(createRoutingRule).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        runtimeConfig,
        expect.objectContaining({
          rootDomain: domain.rootDomain,
          zoneId: domain.zoneId,
        }),
        "ava-lin00@mail00.707979.xyz",
        {
          projectOperation: "mailboxes.create",
          projectRoute: "POST /api/mailboxes",
        },
      );
      expect(deleteRoutingRule).not.toHaveBeenCalled();
    } finally {
      Math.random = originalRandom;
    }
  });

  it("only enables the committed retry subdomain when a generated local-part collision retries", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;

    const domain = {
      id: "dom_primary",
      rootDomain: "707979.xyz",
      zoneId: "zone_primary",
      bindingSource: "catalog",
      status: "active",
      catchAllEnabled: false,
      lastProvisionError: null,
      createdAt: "2026-04-03T12:00:00.000Z",
      updatedAt: "2026-04-03T12:00:00.000Z",
      lastProvisionedAt: "2026-04-03T12:00:00.000Z",
      disabledAt: null,
      deletedAt: null,
    } as const;
    const baseDb = createMailboxDb({
      domainRows: [
        {
          id: domain.id,
          status: "active",
          zoneId: domain.zoneId,
          deletedAt: null,
        },
      ],
      subdomainRows: [],
    });

    const mailboxLookupRows = [[], []];

    const db = {
      ...baseDb,
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table === mailboxes) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => []),
                orderBy: vi.fn(async () => mailboxLookupRows.shift() ?? []),
              })),
              orderBy: vi.fn(async () => mailboxLookupRows.shift() ?? []),
            };
          }

          if (table === domains) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => [
                  {
                    id: domain.id,
                    status: "active",
                    zoneId: domain.zoneId,
                    deletedAt: null,
                  },
                ]),
                orderBy: vi.fn(async () => []),
              })),
              orderBy: vi.fn(async () => []),
            };
          }

          if (table === subdomains) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => []),
                orderBy: vi.fn(async () => []),
              })),
              orderBy: vi.fn(async () => []),
            };
          }

          return {
            where: vi.fn(() => ({
              limit: vi.fn(async () => []),
              orderBy: vi.fn(async () => []),
            })),
            orderBy: vi.fn(async () => []),
          };
        }),
      })),
    };

    getDb.mockReturnValue(db);
    requireActiveDomainByRootDomain.mockResolvedValue(domain);
    ensureSubdomainEnabled.mockResolvedValue(undefined);
    createRoutingRule.mockResolvedValueOnce("rule_retry_2");

    const run = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("UNIQUE constraint failed: mailboxes.address"),
      )
      .mockResolvedValueOnce({
        meta: {
          changes: 1,
        },
      });
    const bind = vi.fn(() => ({ run }));
    const prepare = vi.fn(() => ({ bind }));

    try {
      const created = await createMailboxForUser(
        {
          DB: {
            prepare,
          },
        } as never,
        runtimeConfig,
        memberUser,
        {
          subdomain: "ops.alpha",
          rootDomain: domain.rootDomain,
        },
      );

      expect(created.address).toBe("ava-lin00@ops.alpha.707979.xyz");
      expect(ensureSubdomainEnabled).toHaveBeenCalledTimes(1);
      expect(ensureSubdomainEnabled).toHaveBeenCalledWith(
        expect.any(Object),
        runtimeConfig,
        expect.objectContaining({
          rootDomain: domain.rootDomain,
          zoneId: domain.zoneId,
        }),
        "ops.alpha",
        {
          projectOperation: "mailboxes.create",
          projectRoute: "POST /api/mailboxes",
        },
      );
      expect(db.update).toHaveBeenCalledWith(mailboxes);
      expect(createRoutingRule).toHaveBeenCalledTimes(1);
      expect(createRoutingRule).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        runtimeConfig,
        expect.objectContaining({
          rootDomain: domain.rootDomain,
          zoneId: domain.zoneId,
        }),
        "ava-lin00@ops.alpha.707979.xyz",
        {
          projectOperation: "mailboxes.create",
          projectRoute: "POST /api/mailboxes",
        },
      );
      expect(deleteRoutingRule).not.toHaveBeenCalled();
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
      catchAllEnabled: false,
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

    expect(createRoutingRule).not.toHaveBeenCalled();
    expect(deleteRoutingRule).not.toHaveBeenCalled();
    expect(db.delete).toHaveBeenCalledWith(mailboxes);
  });

  it("aborts mailbox creation when the domain row has been rebound to another zone", async () => {
    const domain = {
      id: "dom_primary",
      rootDomain: "707979.xyz",
      zoneId: "zone_primary",
      bindingSource: "catalog",
      status: "active",
      catchAllEnabled: false,
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

  it("rolls back routing creation when the insert loses the zone binding race", async () => {
    const domain = {
      id: "dom_primary",
      rootDomain: "707979.xyz",
      zoneId: "zone_primary",
      bindingSource: "catalog",
      status: "active",
      catchAllEnabled: false,
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
    });
    getDb.mockReturnValue(db);
    requireActiveDomainByRootDomain.mockResolvedValue(domain);
    ensureSubdomainEnabled.mockResolvedValue(undefined);
    createRoutingRule.mockResolvedValue("rule_new");

    const run = vi.fn(async () => ({
      meta: {
        changes: 0,
      },
    }));
    const bind = vi.fn(() => ({ run }));
    const prepare = vi.fn(() => ({ bind }));

    await expect(
      createMailboxForUser(
        {
          DB: {
            prepare,
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

    expect(bind).toHaveBeenCalledWith(
      expect.any(String),
      memberUser.id,
      domain.id,
      "build",
      "ops",
      "build@ops.707979.xyz",
      "registered",
      null,
      "destroying",
      expect.any(String),
      expect.any(String),
      null,
      domain.id,
      domain.zoneId,
    );
    expect(ensureSubdomainEnabled).not.toHaveBeenCalled();
    expect(createRoutingRule).not.toHaveBeenCalled();
    expect(deleteRoutingRule).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalledWith(mailboxes);
  });

  it("returns a structured conflict when explicit create hits a visible catch-all mailbox", async () => {
    const domain = {
      id: "dom_primary",
      rootDomain: "707979.xyz",
      zoneId: "zone_primary",
      bindingSource: "catalog",
      status: "active",
      catchAllEnabled: true,
      catchAllOwnerUserId: "usr_1",
      catchAllRestoreStateJson:
        '{"enabled":false,"name":"Catch all","matchers":[{"type":"all"}],"actions":[]}',
      catchAllUpdatedAt: "2026-04-03T12:00:00.000Z",
      lastProvisionError: null,
      createdAt: "2026-04-03T12:00:00.000Z",
      updatedAt: "2026-04-03T12:00:00.000Z",
      lastProvisionedAt: "2026-04-03T12:00:00.000Z",
      disabledAt: null,
      deletedAt: null,
    } as const;
    const catchAllMailbox = {
      ...baseMailbox,
      localPart: "build",
      subdomain: "ops",
      address: "build@ops.707979.xyz",
      source: "catch_all",
      routingRuleId: null,
      expiresAt: null,
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
      mailboxRows: [catchAllMailbox],
      subdomainRows: [],
    });
    getDb.mockReturnValue(db);
    requireActiveDomainByRootDomain.mockResolvedValue(domain);
    resolveMailboxDomain.mockResolvedValue(domain);
    ensureSubdomainEnabled.mockResolvedValue(undefined);
    createRoutingRule.mockResolvedValue("rule_promoted");

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
    ).rejects.toMatchObject({
      status: 409,
      details: expect.objectContaining({
        code: "mailbox_exists",
        mailbox: expect.objectContaining({
          id: catchAllMailbox.id,
          address: catchAllMailbox.address,
          source: "catch_all",
        }),
      }),
    });

    expect(ensureSubdomainEnabled).not.toHaveBeenCalled();
    expect(createRoutingRule).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("promotes an active catch-all mailbox during ensure without creating a second row", async () => {
    const domain = {
      id: "dom_primary",
      rootDomain: "707979.xyz",
      zoneId: "zone_primary",
      bindingSource: "catalog",
      status: "active",
      catchAllEnabled: true,
      catchAllOwnerUserId: "usr_1",
      catchAllRestoreStateJson:
        '{"enabled":false,"name":"Catch all","matchers":[{"type":"all"}],"actions":[]}',
      catchAllUpdatedAt: "2026-04-03T12:00:00.000Z",
      lastProvisionError: null,
      createdAt: "2026-04-03T12:00:00.000Z",
      updatedAt: "2026-04-03T12:00:00.000Z",
      lastProvisionedAt: "2026-04-03T12:00:00.000Z",
      disabledAt: null,
      deletedAt: null,
    } as const;
    const catchAllMailbox = {
      ...baseMailbox,
      localPart: "build",
      subdomain: "ops",
      address: "build@ops.707979.xyz",
      source: "catch_all",
      routingRuleId: null,
      expiresAt: null,
    } as const;
    const db = createMailboxDb({
      mailboxRows: [catchAllMailbox],
      domainRows: [
        {
          id: domain.id,
          rootDomain: domain.rootDomain,
        },
      ],
      subdomainRows: [],
    });
    getDb.mockReturnValue(db);
    listActiveRootDomains.mockResolvedValue([domain.rootDomain]);
    resolveMailboxDomain.mockResolvedValue(domain);
    ensureSubdomainEnabled.mockResolvedValue(undefined);
    createRoutingRule.mockResolvedValue("rule_promoted");

    const ensured = await ensureMailboxForUser(
      {
        DB: {
          prepare: vi.fn(),
        },
      } as never,
      runtimeConfig,
      memberUser,
      {
        address: "build@ops.707979.xyz",
      },
    );

    expect(ensureSubdomainEnabled).toHaveBeenCalledTimes(1);
    expect(ensureSubdomainEnabled).toHaveBeenCalledWith(
      expect.any(Object),
      runtimeConfig,
      expect.objectContaining({
        rootDomain: domain.rootDomain,
        zoneId: domain.zoneId,
      }),
      "ops",
      {
        projectOperation: "mailboxes.ensure",
        projectRoute: "POST /api/mailboxes/ensure",
      },
    );
    expect(createRoutingRule).not.toHaveBeenCalled();
    expect(ensured).toMatchObject({
      created: false,
      mailbox: expect.objectContaining({
        id: catchAllMailbox.id,
        source: "registered",
        routingRuleId: null,
      }),
    });
    expect(ensured.mailbox.expiresAt).toBeNull();
  });

  it("still enables email-routing DNS for a new subdomain on catch-all domains without creating a per-address rule", async () => {
    const domain = {
      id: "dom_primary",
      rootDomain: "707979.xyz",
      zoneId: "zone_primary",
      bindingSource: "catalog",
      status: "active",
      catchAllEnabled: true,
      catchAllOwnerUserId: "usr_1",
      catchAllRestoreStateJson:
        '{"enabled":false,"name":"Catch all","matchers":[{"type":"all"}],"actions":[]}',
      catchAllUpdatedAt: "2026-04-03T12:00:00.000Z",
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
          catchAllEnabled: true,
          catchAllOwnerUserId: "usr_1",
        },
      ],
      mailboxRows: [],
      subdomainRows: [],
    });
    getDb.mockReturnValue(db);
    requireActiveDomainByRootDomain.mockResolvedValue(domain);
    ensureSubdomainEnabled.mockResolvedValue(undefined);

    const created = await createMailboxForUser(
      {
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
      } as never,
      runtimeConfig,
      memberUser,
      {
        localPart: "build",
        subdomain: "ops",
        rootDomain: domain.rootDomain,
      },
    );

    expect(ensureSubdomainEnabled).toHaveBeenCalledTimes(1);
    expect(ensureSubdomainEnabled).toHaveBeenCalledWith(
      expect.any(Object),
      runtimeConfig,
      expect.objectContaining({
        rootDomain: domain.rootDomain,
        zoneId: domain.zoneId,
      }),
      "ops",
      {
        projectOperation: "mailboxes.create",
        projectRoute: "POST /api/mailboxes",
      },
    );
    expect(createRoutingRule).not.toHaveBeenCalled();
    expect(created).toMatchObject({
      address: "build@ops.707979.xyz",
      routingRuleId: null,
      source: "registered",
    });
  });

  it("skips per-subdomain DNS enablement for wildcard catch-all domains and records wildcard metadata locally", async () => {
    const subdomainInsertValues: unknown[] = [];
    const domain = {
      id: "dom_primary",
      rootDomain: "707979.xyz",
      zoneId: "zone_primary",
      bindingSource: "catalog",
      status: "active",
      catchAllEnabled: true,
      catchAllOwnerUserId: "usr_1",
      catchAllRestoreStateJson:
        '{"enabled":false,"name":"Catch all","matchers":[{"type":"all"}],"actions":[]}',
      catchAllUpdatedAt: "2026-04-03T12:00:00.000Z",
      subdomainDnsMode: "wildcard",
      wildcardDnsVerifiedAt: "2026-04-03T12:05:00.000Z",
      wildcardDnsLastError: null,
      lastProvisionError: null,
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
      {
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
      } as never,
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
    );

    expect(ensureSubdomainEnabled).not.toHaveBeenCalled();
    expect(createRoutingRule).not.toHaveBeenCalled();
    expect(subdomainInsertValues).toEqual([
      expect.objectContaining({
        domainId: domain.id,
        name: "ops",
        metadata: JSON.stringify({ mode: "wildcard" }),
      }),
    ]);
    expect(created).toMatchObject({
      address: "build@ops.707979.xyz",
      routingRuleId: null,
      source: "registered",
    });
  });

  it("repairs and clears subdomain cleanup backoff when a mailbox reuses that host", async () => {
    const domain = {
      id: "dom_primary",
      rootDomain: "707979.xyz",
      zoneId: "zone_primary",
      bindingSource: "catalog",
      status: "active",
      catchAllEnabled: false,
      catchAllOwnerUserId: null,
      lastProvisionError: null,
      createdAt: "2026-04-03T12:00:00.000Z",
      updatedAt: "2026-04-03T12:00:00.000Z",
      lastProvisionedAt: "2026-04-03T12:00:00.000Z",
      disabledAt: null,
      deletedAt: null,
    } as const;
    const subdomainUpdateValues: Array<Record<string, unknown>> = [];
    const db = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          if (table === domains) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => [
                  {
                    id: domain.id,
                    status: "active",
                    zoneId: domain.zoneId,
                    deletedAt: null,
                    catchAllEnabled: false,
                    catchAllOwnerUserId: null,
                  },
                ]),
              })),
            };
          }

          if (table === mailboxes) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => []),
                orderBy: vi.fn(async () => []),
              })),
              orderBy: vi.fn(async () => []),
            };
          }

          if (table === subdomains) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(async () => [
                  {
                    id: "sub_ops",
                    domainId: domain.id,
                    name: "ops",
                    enabledAt: "2026-04-03T12:00:00.000Z",
                    lastUsedAt: "2026-04-03T12:00:00.000Z",
                    cleanupNextAttemptAt: "2026-04-03T13:00:00.000Z",
                    cleanupLastError: "partial Cloudflare DNS delete",
                    metadata: '{"mode":"live"}',
                  },
                ]),
              })),
            };
          }

          throw new Error("Unexpected table");
        }),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async () => undefined),
      })),
      update: vi.fn((table: unknown) => ({
        set: vi.fn((values: Record<string, unknown>) => ({
          where: vi.fn(async () => {
            if (table === subdomains) {
              subdomainUpdateValues.push(values);
            }
          }),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    };
    getDb.mockReturnValue(db);
    requireActiveDomainByRootDomain.mockResolvedValue(domain);
    ensureSubdomainEnabled.mockResolvedValue(undefined);
    createRoutingRule.mockResolvedValue("rule_repaired");

    await expect(
      createMailboxForUser(
        {
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
        } as never,
        runtimeConfig,
        memberUser,
        {
          localPart: "build",
          subdomain: "ops",
          rootDomain: domain.rootDomain,
        },
      ),
    ).resolves.toMatchObject({
      address: "build@ops.707979.xyz",
      routingRuleId: "rule_repaired",
    });

    expect(ensureSubdomainEnabled).toHaveBeenCalledWith(
      expect.any(Object),
      runtimeConfig,
      expect.objectContaining({
        rootDomain: domain.rootDomain,
        zoneId: domain.zoneId,
      }),
      "ops",
      {
        projectOperation: "mailboxes.create",
        projectRoute: "POST /api/mailboxes",
      },
    );
    expect(subdomainUpdateValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cleanupNextAttemptAt: null,
          cleanupLastError: null,
        }),
      ]),
    );
  });

  it("returns structured mailbox details when create hits a visible mailbox conflict", async () => {
    const conflictMailbox = {
      ...baseMailbox,
      id: "mbx_conflict",
      domainId: "dom_mail",
      localPart: "spec",
      subdomain: "ops.beta",
      address: "spec@ops.beta.mail.example.net",
      expiresAt: "2026-04-18T13:15:00.000Z",
    };
    const db = createMailboxDb({
      domainRows: [
        {
          id: "dom_mail",
          rootDomain: "mail.example.net",
          status: "active",
          zoneId: "zone_mail",
          deletedAt: null,
          catchAllEnabled: false,
          catchAllOwnerUserId: null,
        },
      ],
      mailboxRows: [conflictMailbox],
      subdomainRows: [],
    });
    getDb.mockReturnValue(db);
    requireActiveDomainByRootDomain.mockResolvedValue({
      id: "dom_mail",
      rootDomain: "mail.example.net",
      zoneId: "zone_mail",
    });

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
          localPart: "spec",
          subdomain: "ops.beta",
          rootDomain: "mail.example.net",
          expiresInMinutes: 60,
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Mailbox already exists",
      details: expect.objectContaining({
        code: "mailbox_exists",
        mailbox: expect.objectContaining({
          id: conflictMailbox.id,
          address: conflictMailbox.address,
        }),
      }),
    });
  });

  it("extends an existing registered mailbox without creating or deleting routing rules", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T12:00:00.000Z"));

    const updateWhere = vi.fn(async () => undefined);
    const updateSet = vi.fn(() => ({
      where: updateWhere,
    }));
    const db = {
      ...createMailboxDb({
        domainRows: [
          {
            id: baseMailbox.domainId,
            rootDomain: "707979.xyz",
          },
        ],
        mailboxRows: [baseMailbox],
        subdomainRows: [],
      }),
      update: vi.fn((_table: unknown) => ({
        set: updateSet,
      })),
    };
    getDb.mockReturnValue(db);
    listActiveRootDomains.mockResolvedValue(["707979.xyz"]);

    try {
      const ensured = await ensureMailboxForUser(
        {} as never,
        runtimeConfig,
        memberUser,
        {
          address: baseMailbox.address,
          expiresInMinutes: 180,
        },
      );

      expect(ensured.created).toBe(false);
      expect(ensured.mailbox.expiresAt).toBe("2026-04-18T15:00:00.000Z");
      expect(db.update).toHaveBeenCalledWith(mailboxes);
      expect(updateSet).toHaveBeenCalledWith({
        expiresAt: "2026-04-18T15:00:00.000Z",
      });
      expect(createRoutingRule).not.toHaveBeenCalled();
      expect(deleteRoutingRule).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not shorten an existing registered mailbox when ensure requests a shorter TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T12:00:00.000Z"));

    const updateSet = vi.fn(() => ({
      where: vi.fn(async () => undefined),
    }));
    const db = {
      ...createMailboxDb({
        domainRows: [
          {
            id: baseMailbox.domainId,
            rootDomain: "707979.xyz",
          },
        ],
        mailboxRows: [
          {
            ...baseMailbox,
            expiresAt: "2026-04-18T18:00:00.000Z",
          },
        ],
        subdomainRows: [],
      }),
      update: vi.fn(() => ({
        set: updateSet,
      })),
    };
    getDb.mockReturnValue(db);
    listActiveRootDomains.mockResolvedValue(["707979.xyz"]);

    try {
      const ensured = await ensureMailboxForUser(
        {} as never,
        runtimeConfig,
        memberUser,
        {
          address: baseMailbox.address,
          expiresInMinutes: 60,
        },
      );

      expect(ensured.created).toBe(false);
      expect(ensured.mailbox.expiresAt).toBe("2026-04-18T18:00:00.000Z");
      expect(db.update).not.toHaveBeenCalled();
      expect(createRoutingRule).not.toHaveBeenCalled();
      expect(deleteRoutingRule).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps long-term mailboxes long-term when ensure requests a finite TTL", async () => {
    const longTermMailbox = {
      ...baseMailbox,
      expiresAt: "9999-12-31T23:59:59.999Z",
    };
    const updateSet = vi.fn(() => ({
      where: vi.fn(async () => undefined),
    }));
    const db = {
      ...createMailboxDb({
        domainRows: [
          {
            id: baseMailbox.domainId,
            rootDomain: "707979.xyz",
          },
        ],
        mailboxRows: [longTermMailbox],
        subdomainRows: [],
      }),
      update: vi.fn(() => ({
        set: updateSet,
      })),
    };
    getDb.mockReturnValue(db);
    listActiveRootDomains.mockResolvedValue(["707979.xyz"]);

    const ensured = await ensureMailboxForUser(
      {} as never,
      runtimeConfig,
      memberUser,
      {
        address: baseMailbox.address,
        expiresInMinutes: 60,
      },
    );

    expect(ensured.created).toBe(false);
    expect(ensured.mailbox.expiresAt).toBeNull();
    expect(db.update).not.toHaveBeenCalled();
    expect(createRoutingRule).not.toHaveBeenCalled();
    expect(deleteRoutingRule).not.toHaveBeenCalled();
  });
});
