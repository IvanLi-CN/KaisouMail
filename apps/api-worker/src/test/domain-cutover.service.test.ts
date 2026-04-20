import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));
const { nowIso, randomId } = vi.hoisted(() => ({
  nowIso: vi.fn(() => "2026-04-21T10:00:00.000Z"),
  randomId: vi.fn(() => "sub_generated"),
}));
const {
  createRoutingRule,
  deleteRoutingRule,
  ensureSubdomainEnabled,
  ensureWildcardEmailRoutingDnsRecords,
  getCatchAllRule,
  updateCatchAllRule,
} = vi.hoisted(() => ({
  createRoutingRule: vi.fn(),
  deleteRoutingRule: vi.fn(),
  ensureSubdomainEnabled: vi.fn(),
  ensureWildcardEmailRoutingDnsRecords: vi.fn(),
  getCatchAllRule: vi.fn(),
  updateCatchAllRule: vi.fn(),
}));
const {
  deleteWildcardEmailRoutingDnsRecords,
  listProjectMailboxExactDnsHosts,
  purgeProjectMailboxExactDnsHosts,
} = vi.hoisted(() => ({
  deleteWildcardEmailRoutingDnsRecords: vi.fn(),
  listProjectMailboxExactDnsHosts: vi.fn(),
  purgeProjectMailboxExactDnsHosts: vi.fn(),
}));

vi.mock("../db/client", () => ({
  getDb,
}));

vi.mock("../lib/crypto", async () => {
  const actual =
    await vi.importActual<typeof import("../lib/crypto")>("../lib/crypto");
  return {
    ...actual,
    nowIso,
    randomId,
  };
});

vi.mock("../services/emailRouting", async () => {
  const actual = await vi.importActual<
    typeof import("../services/emailRouting")
  >("../services/emailRouting");
  return {
    ...actual,
    createRoutingRule,
    deleteRoutingRule,
    ensureSubdomainEnabled,
    ensureWildcardEmailRoutingDnsRecords,
    getCatchAllRule,
    updateCatchAllRule,
  };
});

vi.mock("../services/cloudflare-mailbox-dns", async () => {
  const actual = await vi.importActual<
    typeof import("../services/cloudflare-mailbox-dns")
  >("../services/cloudflare-mailbox-dns");
  return {
    ...actual,
    deleteWildcardEmailRoutingDnsRecords,
    listProjectMailboxExactDnsHosts,
    purgeProjectMailboxExactDnsHosts,
  };
});

import {
  domainCutoverTasks,
  domains,
  mailboxes,
  subdomains,
} from "../db/schema";
import { runDomainCutoverTaskById } from "../services/domain-cutover";

const env = {} as never;
const runtimeConfig = {
  APP_ENV: "development",
  DEFAULT_MAILBOX_TTL_MINUTES: 60,
  CLEANUP_BATCH_SIZE: 3,
  SUBDOMAIN_CLEANUP_BATCH_SIZE: 50,
  EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
  CLOUDFLARE_API_TOKEN: "cf-token",
  EMAIL_WORKER_NAME: "mail-worker",
  SESSION_SECRET: "super-secret-session-key",
  BOOTSTRAP_ADMIN_NAME: "Ivan",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
} as const;

const baseDomain = {
  id: "dom_primary",
  rootDomain: "ivanli.asia",
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
  createdAt: "2026-04-21T09:50:00.000Z",
  updatedAt: "2026-04-21T09:50:00.000Z",
  lastProvisionedAt: "2026-04-21T09:50:00.000Z",
  disabledAt: null,
  deletedAt: null,
} as const;

const baseTask = {
  id: "dct_123",
  domainId: baseDomain.id,
  rootDomain: baseDomain.rootDomain,
  requestedByUserId: "usr_admin",
  action: "enable",
  targetMode: "wildcard",
  status: "pending",
  phase: "queued",
  currentHost: null,
  deletedCount: 0,
  rebuiltCount: 0,
  totalCount: 0,
  rollbackPhase: null,
  error: null,
  createdAt: "2026-04-21T10:00:00.000Z",
  startedAt: null,
  updatedAt: "2026-04-21T10:00:00.000Z",
  completedAt: null,
  failedAt: null,
} as const;

const catchAllRule = {
  enabled: false,
  name: "Catch all",
  matchers: [{ type: "all" }],
  actions: [{ type: "forward", value: ["owner@example.com"] }],
};

const createDb = (options: {
  taskRows: unknown[][];
  domainRows: unknown[][];
  mailboxRows: unknown[][];
}) => {
  const taskRows = [...options.taskRows];
  const domainRows = [...options.domainRows];
  const mailboxRows = [...options.mailboxRows];
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> =
    [];
  const insertedSubdomains: unknown[] = [];
  const deletedTables: unknown[] = [];

  const nextRows = (table: unknown) => {
    if (table === domainCutoverTasks) return taskRows.shift() ?? [];
    if (table === domains) return domainRows.shift() ?? [];
    if (table === mailboxes) return mailboxRows.shift() ?? [];
    return [];
  };

  return {
    updates,
    insertedSubdomains,
    deletedTables,
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => nextRows(table)),
          orderBy: vi.fn(async () => nextRows(table)),
        })),
        orderBy: vi.fn(async () => nextRows(table)),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (values: unknown) => {
        if (table === subdomains) {
          insertedSubdomains.push(
            ...(Array.isArray(values) ? values : [values]),
          );
        }
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          updates.push({ table, values });
        }),
      })),
    })),
    delete: vi.fn((table: unknown) => ({
      where: vi.fn(async () => {
        deletedTables.push(table);
      }),
    })),
  };
};

describe("domain cutover service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nowIso.mockReturnValue("2026-04-21T10:00:00.000Z");
    randomId.mockReturnValue("sub_generated");
    purgeProjectMailboxExactDnsHosts.mockResolvedValue({
      hosts: ["ops", "deep.ops"],
      processedHosts: ["ops", "deep.ops"],
      deletedHostCount: 2,
      completed: true,
    });
    listProjectMailboxExactDnsHosts.mockResolvedValue([]);
    deleteWildcardEmailRoutingDnsRecords.mockResolvedValue({
      matchedRecordCount: 1,
    });
    ensureSubdomainEnabled.mockResolvedValue(undefined);
    ensureWildcardEmailRoutingDnsRecords.mockResolvedValue(undefined);
    getCatchAllRule.mockResolvedValue(catchAllRule);
    updateCatchAllRule.mockResolvedValue(undefined);
    createRoutingRule.mockResolvedValue("rule_restored");
    deleteRoutingRule.mockResolvedValue(undefined);
  });

  it("cuts domains over to wildcard by purging exact DNS before enabling catch-all", async () => {
    const db = createDb({
      taskRows: [[baseTask]],
      domainRows: [[baseDomain]],
      mailboxRows: [
        [
          {
            id: "mbx_registered",
            address: "build@ops.ivanli.asia",
            subdomain: "ops",
            source: "registered",
            routingRuleId: "rule_existing",
            status: "active",
            domainId: baseDomain.id,
            createdAt: "2026-04-21T09:55:00.000Z",
          },
        ],
      ],
    });
    getDb.mockReturnValue(db);

    const result = await runDomainCutoverTaskById(
      env,
      {
        ...runtimeConfig,
        WILDCARD_SUBDOMAIN_DNS_ENABLED: true,
        WILDCARD_SUBDOMAIN_DNS_ALLOWLIST: [baseDomain.rootDomain],
      },
      baseTask.id,
    );

    expect(purgeProjectMailboxExactDnsHosts).toHaveBeenCalledTimes(1);
    expect(ensureWildcardEmailRoutingDnsRecords).toHaveBeenCalledTimes(1);
    expect(
      purgeProjectMailboxExactDnsHosts.mock.invocationCallOrder[0],
    ).toBeLessThan(
      ensureWildcardEmailRoutingDnsRecords.mock.invocationCallOrder[0],
    );
    expect(ensureSubdomainEnabled).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "completed",
      targetMode: "wildcard",
    });
    expect(db.insertedSubdomains).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "ops",
          metadata: JSON.stringify({ mode: "wildcard" }),
        }),
      ]),
    );
    expect(db.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: domains,
          values: expect.objectContaining({
            catchAllEnabled: true,
            subdomainDnsMode: "wildcard",
            wildcardDnsLastError: null,
          }),
        }),
      ]),
    );
  });

  it("rolls failed wildcard cutovers back to explicit DNS derived from live mailboxes", async () => {
    const db = createDb({
      taskRows: [
        [baseTask],
        [
          {
            ...baseTask,
            status: "running",
            phase: "ensuring_wildcard_dns",
            currentHost: "*.ivanli.asia",
            deletedCount: 1,
            totalCount: 1,
            startedAt: "2026-04-21T10:00:00.000Z",
          },
        ],
      ],
      domainRows: [[baseDomain]],
      mailboxRows: [
        [
          {
            id: "mbx_registered",
            address: "build@ops.ivanli.asia",
            subdomain: "ops",
            source: "registered",
            routingRuleId: "rule_existing",
            status: "active",
            domainId: baseDomain.id,
            createdAt: "2026-04-21T09:55:00.000Z",
          },
        ],
      ],
    });
    getDb.mockReturnValue(db);
    purgeProjectMailboxExactDnsHosts
      .mockResolvedValueOnce({
        hosts: ["ops"],
        processedHosts: ["ops"],
        deletedHostCount: 1,
        completed: true,
      })
      .mockResolvedValueOnce({
        hosts: [],
        processedHosts: [],
        deletedHostCount: 0,
        completed: true,
      });
    ensureWildcardEmailRoutingDnsRecords.mockRejectedValue(
      new Error("Record quota exceeded."),
    );

    const result = await runDomainCutoverTaskById(
      env,
      {
        ...runtimeConfig,
        WILDCARD_SUBDOMAIN_DNS_ENABLED: true,
        WILDCARD_SUBDOMAIN_DNS_ALLOWLIST: [baseDomain.rootDomain],
      },
      baseTask.id,
    );

    expect(result).toMatchObject({
      status: "failed",
      rollbackPhase: "rollback_completed",
      error: "Record quota exceeded.",
    });
    expect(deleteWildcardEmailRoutingDnsRecords).toHaveBeenCalledTimes(1);
    expect(ensureSubdomainEnabled).toHaveBeenCalledWith(
      env,
      expect.any(Object),
      baseDomain,
      "ops",
      {
        projectOperation: "domains.catch_all.enable",
        projectRoute: "POST /api/domains/:id/catch-all/enable",
      },
    );
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

  it("disables catch-all by retiring catch_all mailboxes and rebuilding exact DNS from surviving registered mailboxes", async () => {
    const disableTask = {
      ...baseTask,
      id: "dct_disable",
      action: "disable",
      targetMode: "explicit",
    } as const;
    const catchAllDomain = {
      ...baseDomain,
      catchAllEnabled: true,
      catchAllOwnerUserId: "usr_admin",
      catchAllRestoreStateJson: JSON.stringify(catchAllRule),
      subdomainDnsMode: "wildcard",
      wildcardDnsVerifiedAt: "2026-04-21T09:58:00.000Z",
    } as const;
    const db = createDb({
      taskRows: [[disableTask]],
      domainRows: [[catchAllDomain]],
      mailboxRows: [
        [
          {
            id: "mbx_catch_all",
            address: "probe@shadow.ivanli.asia",
            subdomain: "shadow",
            source: "catch_all",
            routingRuleId: null,
            status: "active",
            domainId: baseDomain.id,
            createdAt: "2026-04-21T09:54:00.000Z",
          },
        ],
        [
          {
            id: "mbx_registered",
            address: "build@ops.ivanli.asia",
            subdomain: "ops",
            source: "registered",
            routingRuleId: null,
            status: "active",
            domainId: baseDomain.id,
            createdAt: "2026-04-21T09:55:00.000Z",
          },
        ],
        [
          {
            id: "mbx_registered",
            address: "build@ops.ivanli.asia",
            subdomain: "ops",
            source: "registered",
            routingRuleId: null,
            status: "active",
            domainId: baseDomain.id,
            createdAt: "2026-04-21T09:55:00.000Z",
          },
        ],
      ],
    });
    getDb.mockReturnValue(db);

    const result = await runDomainCutoverTaskById(
      env,
      runtimeConfig,
      disableTask.id,
    );

    expect(result).toMatchObject({
      status: "completed",
      action: "disable",
      targetMode: "explicit",
    });
    expect(ensureSubdomainEnabled).toHaveBeenCalledTimes(1);
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
      "build@ops.ivanli.asia",
      {
        projectOperation: "domains.catch_all.disable",
        projectRoute: "POST /api/domains/:id/catch-all/disable",
      },
    );
    expect(db.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: mailboxes,
          values: expect.objectContaining({
            status: "destroyed",
          }),
        }),
        expect.objectContaining({
          table: domains,
          values: expect.objectContaining({
            catchAllEnabled: false,
            subdomainDnsMode: "explicit",
            wildcardDnsVerifiedAt: null,
          }),
        }),
      ]),
    );
  });

  it("accepts legacy catch-all restore states that omit action values", async () => {
    const legacyDomain = {
      ...baseDomain,
      catchAllEnabled: true,
      catchAllOwnerUserId: "usr_admin",
      catchAllRestoreStateJson: JSON.stringify({
        enabled: false,
        name: "Catch all",
        matchers: [{ type: "all" }],
        actions: [{ type: "drop" }],
      }),
    } as const;
    const db = createDb({
      taskRows: [[baseTask]],
      domainRows: [[legacyDomain]],
      mailboxRows: [[]],
    });
    getDb.mockReturnValue(db);
    purgeProjectMailboxExactDnsHosts.mockResolvedValueOnce({
      hosts: [],
      processedHosts: [],
      deletedHostCount: 0,
      completed: true,
    });

    const result = await runDomainCutoverTaskById(
      env,
      {
        ...runtimeConfig,
        WILDCARD_SUBDOMAIN_DNS_ENABLED: true,
        WILDCARD_SUBDOMAIN_DNS_ALLOWLIST: [baseDomain.rootDomain],
      },
      baseTask.id,
    );

    expect(result).toMatchObject({
      status: "completed",
      targetMode: "wildcard",
    });
  });

  it("yields pending wildcard purge batches and resumes without resetting phase", async () => {
    const liveMailbox = {
      id: "mbx_registered",
      address: "build@ops.ivanli.asia",
      subdomain: "ops",
      source: "registered",
      routingRuleId: "rule_existing",
      status: "active",
      domainId: baseDomain.id,
      createdAt: "2026-04-21T09:55:00.000Z",
    } as const;

    const firstDb = createDb({
      taskRows: [[baseTask]],
      domainRows: [[baseDomain]],
      mailboxRows: [[liveMailbox]],
    });
    getDb.mockReturnValueOnce(firstDb);
    purgeProjectMailboxExactDnsHosts.mockResolvedValueOnce({
      hosts: [
        "ops",
        "deep.ops",
        "relay1",
        "relay2",
        "relay3",
        "relay4",
        "relay5",
        "relay6",
      ],
      processedHosts: [
        "ops",
        "deep.ops",
        "relay1",
        "relay2",
        "relay3",
        "relay4",
      ],
      deletedHostCount: 6,
      completed: false,
    });

    const firstResult = await runDomainCutoverTaskById(
      env,
      {
        ...runtimeConfig,
        WILDCARD_SUBDOMAIN_DNS_ENABLED: true,
        WILDCARD_SUBDOMAIN_DNS_ALLOWLIST: [baseDomain.rootDomain],
      },
      baseTask.id,
    );

    expect(firstResult).toMatchObject({
      status: "pending",
      phase: "purging_exact_dns",
      deletedCount: 6,
      totalCount: 8,
    });
    expect(ensureWildcardEmailRoutingDnsRecords).not.toHaveBeenCalled();

    const resumedTask = {
      ...baseTask,
      status: "pending",
      phase: "purging_exact_dns",
      deletedCount: 6,
      totalCount: 8,
      startedAt: "2026-04-21T10:00:00.000Z",
    } as const;
    const secondDb = createDb({
      taskRows: [[resumedTask]],
      domainRows: [[baseDomain]],
      mailboxRows: [[liveMailbox]],
    });
    getDb.mockReturnValueOnce(secondDb);
    purgeProjectMailboxExactDnsHosts.mockResolvedValueOnce({
      hosts: ["relay5", "relay6"],
      processedHosts: ["relay5", "relay6"],
      deletedHostCount: 2,
      completed: true,
    });

    const secondResult = await runDomainCutoverTaskById(
      env,
      {
        ...runtimeConfig,
        WILDCARD_SUBDOMAIN_DNS_ENABLED: true,
        WILDCARD_SUBDOMAIN_DNS_ALLOWLIST: [baseDomain.rootDomain],
      },
      resumedTask.id,
    );

    expect(secondResult).toMatchObject({
      status: "completed",
      phase: "completed",
      targetMode: "wildcard",
    });
    expect(ensureWildcardEmailRoutingDnsRecords).toHaveBeenCalledTimes(1);
  });

  it("fails preflight restore-state validation instead of leaving tasks stuck in loading_state", async () => {
    const invalidDomain = {
      ...baseDomain,
      catchAllEnabled: true,
      catchAllOwnerUserId: "usr_admin",
      catchAllRestoreStateJson: "{invalid",
    } as const;
    const db = createDb({
      taskRows: [[baseTask]],
      domainRows: [[invalidDomain]],
      mailboxRows: [[]],
    });
    getDb.mockReturnValue(db);

    const result = await runDomainCutoverTaskById(
      env,
      {
        ...runtimeConfig,
        WILDCARD_SUBDOMAIN_DNS_ENABLED: true,
        WILDCARD_SUBDOMAIN_DNS_ALLOWLIST: [baseDomain.rootDomain],
      },
      baseTask.id,
    );

    expect(result).toMatchObject({
      status: "failed",
      phase: "failed",
      error: "Domain catch-all restore state is invalid",
    });
  });
});
