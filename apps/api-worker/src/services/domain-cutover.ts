import { domainCutoverTaskSchema } from "@kaisoumail/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../db/client";
import {
  domainCutoverTasks,
  domains,
  mailboxes,
  subdomains,
} from "../db/schema";
import type { RuntimeConfig, WorkerEnv } from "../env";
import { nowIso, randomId } from "../lib/crypto";
import { chunkD1InsertValues, chunkD1InValues } from "../lib/d1-batches";
import { normalizeRootDomain } from "../lib/email";
import { ApiError } from "../lib/errors";
import { logOperationalEvent } from "../lib/observability";
import {
  deleteWildcardEmailRoutingDnsRecords,
  listProjectMailboxExactDnsHosts,
  purgeProjectMailboxExactDnsHosts,
} from "./cloudflare-mailbox-dns";
import {
  type CloudflareCatchAllRule,
  type CloudflareRequestSource,
  createRoutingRule,
  deleteRoutingRule,
  ensureSubdomainEnabled,
  ensureWildcardEmailRoutingDnsRecords,
  getCatchAllRule,
  updateCatchAllRule,
} from "./emailRouting";

type DomainRow = typeof domains.$inferSelect;
type DomainCutoverTaskRow = typeof domainCutoverTasks.$inferSelect;
type MailboxRow = typeof mailboxes.$inferSelect;
type LiveMailboxRow = Pick<
  MailboxRow,
  | "id"
  | "address"
  | "subdomain"
  | "source"
  | "routingRuleId"
  | "status"
  | "domainId"
  | "createdAt"
>;

type DomainCutoverTaskDto = z.infer<typeof domainCutoverTaskSchema>;

type DomainCutoverAction = DomainCutoverTaskRow["action"];
type ReconcileStepResult = {
  task: DomainCutoverTaskRow;
  completed: boolean;
};

const catchAllRestoreStateSchema = z.object({
  enabled: z.boolean(),
  name: z.string(),
  matchers: z.array(
    z.object({
      field: z.string().optional(),
      type: z.string(),
      value: z.string().optional(),
    }),
  ),
  actions: z.array(
    z.object({
      type: z.string(),
      value: z.array(z.string()).optional().default([]),
    }),
  ),
});

type CatchAllRestoreState = z.infer<typeof catchAllRestoreStateSchema>;

const managedCatchAllNamePrefix = "KaisouMail Catch All";
const activeTaskStatuses = ["pending", "running"] as const;
const exactDnsPurgeBatchSize = 6;
const exactDnsRebuildBatchSize = 24;
const routeRestoreBatchSize = 24;

const domainCutoverRequestSources = {
  enable: {
    projectOperation: "domains.catch_all.enable",
    projectRoute: "POST /api/domains/:id/catch-all/enable",
  },
  disable: {
    projectOperation: "domains.catch_all.disable",
    projectRoute: "POST /api/domains/:id/catch-all/disable",
  },
} satisfies Record<DomainCutoverAction, CloudflareRequestSource>;

const requireCatchAllManagementEnabled = (
  config: RuntimeConfig,
  operation: DomainCutoverAction,
) => {
  if (config.EMAIL_ROUTING_MANAGEMENT_ENABLED) return;
  throw new ApiError(
    409,
    `Catch-all ${operation} requires EMAIL_ROUTING_MANAGEMENT_ENABLED=true`,
  );
};

const requireCatchAllWorkerName = (config: RuntimeConfig) => {
  if (config.EMAIL_WORKER_NAME) return config.EMAIL_WORKER_NAME;
  throw new ApiError(
    500,
    "Catch-all management requires EMAIL_WORKER_NAME to be configured",
  );
};

const shouldAllowWildcardSubdomainDnsCutover = (
  config: Pick<
    RuntimeConfig,
    "WILDCARD_SUBDOMAIN_DNS_ENABLED" | "WILDCARD_SUBDOMAIN_DNS_ALLOWLIST"
  >,
  rootDomain: string,
) =>
  config.WILDCARD_SUBDOMAIN_DNS_ENABLED === true &&
  (config.WILDCARD_SUBDOMAIN_DNS_ALLOWLIST ?? []).includes(
    normalizeRootDomain(rootDomain),
  );

const parseCatchAllRestoreState = (value: string | null) => {
  if (!value) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ApiError(500, "Domain catch-all restore state is invalid");
  }

  const result = catchAllRestoreStateSchema.safeParse(parsed);
  if (!result.success) {
    throw new ApiError(500, "Domain catch-all restore state is invalid");
  }

  return result.data;
};

const serializeCatchAllRestoreState = (value: CatchAllRestoreState) =>
  JSON.stringify(value);

const toCatchAllRestoreState = (
  rule: CloudflareCatchAllRule,
): CatchAllRestoreState => ({
  enabled: rule.enabled,
  name: rule.name,
  matchers: rule.matchers,
  actions: rule.actions,
});

const buildManagedCatchAllRule = (
  domain: Pick<DomainRow, "rootDomain">,
  currentRule: CloudflareCatchAllRule,
  workerName: string,
): CloudflareCatchAllRule => ({
  enabled: true,
  name: `${managedCatchAllNamePrefix} (${domain.rootDomain})`,
  matchers:
    currentRule.matchers.length > 0 ? currentRule.matchers : [{ type: "all" }],
  actions: [{ type: "worker", value: [workerName] }],
});

const toTaskDto = (row: DomainCutoverTaskRow): DomainCutoverTaskDto =>
  domainCutoverTaskSchema.parse({
    id: row.id,
    domainId: row.domainId,
    rootDomain: row.rootDomain,
    requestedByUserId: row.requestedByUserId,
    action: row.action,
    targetMode: row.targetMode,
    status: row.status,
    phase: row.phase,
    currentHost: row.currentHost,
    deletedCount: row.deletedCount,
    rebuiltCount: row.rebuiltCount,
    totalCount: row.totalCount,
    rollbackPhase: row.rollbackPhase,
    error: row.error,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    failedAt: row.failedAt,
  });

const getDomainRowById = async (
  db: ReturnType<typeof getDb>,
  domainId: string,
) => {
  const rows = await db
    .select()
    .from(domains)
    .where(eq(domains.id, domainId))
    .limit(1);
  return rows[0] ?? null;
};

const getTaskRowById = async (db: ReturnType<typeof getDb>, taskId: string) => {
  const rows = await db
    .select()
    .from(domainCutoverTasks)
    .where(eq(domainCutoverTasks.id, taskId))
    .limit(1);
  return rows[0] ?? null;
};

const findOpenTaskForDomain = async (
  db: ReturnType<typeof getDb>,
  domainId: string,
) => {
  const rows = await db
    .select()
    .from(domainCutoverTasks)
    .where(
      and(
        eq(domainCutoverTasks.domainId, domainId),
        inArray(domainCutoverTasks.status, [...activeTaskStatuses]),
      ),
    )
    .orderBy(asc(domainCutoverTasks.createdAt))
    .limit(1);
  return rows[0] ?? null;
};

const listActiveMailboxesForDomain = async (
  db: ReturnType<typeof getDb>,
  domainId: string,
  options?: { includeCatchAll?: boolean },
) => {
  const includeCatchAll = options?.includeCatchAll ?? false;
  const rows = await db
    .select({
      id: mailboxes.id,
      address: mailboxes.address,
      subdomain: mailboxes.subdomain,
      source: mailboxes.source,
      routingRuleId: mailboxes.routingRuleId,
      status: mailboxes.status,
      domainId: mailboxes.domainId,
      createdAt: mailboxes.createdAt,
    })
    .from(mailboxes)
    .where(
      includeCatchAll
        ? and(eq(mailboxes.domainId, domainId), eq(mailboxes.status, "active"))
        : and(
            eq(mailboxes.domainId, domainId),
            eq(mailboxes.status, "active"),
            eq(mailboxes.source, "registered"),
          ),
    )
    .orderBy(asc(mailboxes.createdAt));

  return rows as LiveMailboxRow[];
};

const buildDesiredExactHosts = (rows: LiveMailboxRow[]) => {
  const hosts: string[] = [];
  const seenHosts = new Set<string>();

  for (const row of rows) {
    if (!row.subdomain || seenHosts.has(row.subdomain)) {
      continue;
    }
    seenHosts.add(row.subdomain);
    hosts.push(row.subdomain);
  }

  return hosts;
};

const replaceSubdomainCacheForDomain = async (
  db: ReturnType<typeof getDb>,
  domain: Pick<DomainRow, "id">,
  hosts: string[],
  mode: "explicit" | "wildcard",
  timestamp: string,
) => {
  await db.delete(subdomains).where(eq(subdomains.domainId, domain.id));

  if (hosts.length === 0) {
    return;
  }

  const values = hosts.map((host) => ({
    id: randomId("sub"),
    domainId: domain.id,
    name: host,
    enabledAt: timestamp,
    lastUsedAt: timestamp,
    cleanupNextAttemptAt: null,
    cleanupLastError: null,
    cleanupLeaseOwner: null,
    cleanupLeaseUntil: null,
    metadata: JSON.stringify({ mode }),
  }));

  for (const chunk of chunkD1InsertValues(values)) {
    await db.insert(subdomains).values(chunk);
  }
};

const patchTask = async (
  db: ReturnType<typeof getDb>,
  task: DomainCutoverTaskRow,
  patch: Partial<DomainCutoverTaskRow>,
) => {
  const next: DomainCutoverTaskRow = {
    ...task,
    ...patch,
    updatedAt: nowIso(),
  };

  await db
    .update(domainCutoverTasks)
    .set({
      status: next.status,
      phase: next.phase,
      currentHost: next.currentHost,
      deletedCount: next.deletedCount,
      rebuiltCount: next.rebuiltCount,
      totalCount: next.totalCount,
      rollbackPhase: next.rollbackPhase,
      error: next.error,
      startedAt: next.startedAt,
      updatedAt: next.updatedAt,
      completedAt: next.completedAt,
      failedAt: next.failedAt,
    })
    .where(eq(domainCutoverTasks.id, next.id));

  return next;
};

const markTaskCompleted = async (
  db: ReturnType<typeof getDb>,
  task: DomainCutoverTaskRow,
) =>
  patchTask(db, task, {
    status: "completed",
    phase: "completed",
    currentHost: null,
    rollbackPhase: null,
    error: null,
    completedAt: nowIso(),
    failedAt: null,
  });

const markTaskPending = async (
  db: ReturnType<typeof getDb>,
  task: DomainCutoverTaskRow,
  patch?: Partial<DomainCutoverTaskRow>,
) =>
  patchTask(db, task, {
    status: "pending",
    completedAt: null,
    failedAt: null,
    ...patch,
  });

const markTaskFailed = async (
  db: ReturnType<typeof getDb>,
  task: DomainCutoverTaskRow,
  error: string,
  rollbackPhase: string | null,
) =>
  patchTask(db, task, {
    status: "failed",
    phase: "failed",
    currentHost: null,
    rollbackPhase,
    error,
    completedAt: null,
    failedAt: nowIso(),
  });

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const persistWildcardFailure = async (
  db: ReturnType<typeof getDb>,
  domainId: string,
  message: string,
) => {
  await db
    .update(domains)
    .set({
      wildcardDnsLastError: message,
      updatedAt: nowIso(),
    })
    .where(eq(domains.id, domainId));
};

const reconcileToWildcard = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  db: ReturnType<typeof getDb>,
  task: DomainCutoverTaskRow,
  domain: DomainRow,
  liveMailboxes: LiveMailboxRow[],
  requestSource: CloudflareRequestSource,
): Promise<ReconcileStepResult> => {
  const desiredHosts = buildDesiredExactHosts(liveMailboxes);
  const wildcardHost = `*.${domain.rootDomain}`;
  let nextTask = task;

  if (
    task.phase === "queued" ||
    task.phase === "loading_state" ||
    task.phase === "purging_exact_dns"
  ) {
    const deletedCountOffset =
      task.phase === "purging_exact_dns" ? task.deletedCount : 0;
    if (task.phase !== "purging_exact_dns") {
      nextTask = await patchTask(db, task, {
        phase: "purging_exact_dns",
        currentHost: null,
        deletedCount: deletedCountOffset,
        rebuiltCount: 0,
        totalCount: 0,
      });
    }

    const purgeResult = await purgeProjectMailboxExactDnsHosts(
      env,
      config,
      domain,
      requestSource,
      {
        maxHostCount: exactDnsPurgeBatchSize,
        onHostDeleted: async ({ host, deletedCount, totalCount }) => {
          nextTask = await patchTask(db, nextTask, {
            phase: "purging_exact_dns",
            currentHost: host,
            deletedCount: deletedCountOffset + deletedCount,
            totalCount: Math.max(
              nextTask.totalCount,
              deletedCountOffset + totalCount,
            ),
          });
        },
      },
    );

    nextTask = await patchTask(db, nextTask, {
      phase: "purging_exact_dns",
      currentHost:
        purgeResult.processedHosts.at(-1) === undefined
          ? null
          : `${purgeResult.processedHosts.at(-1)}.${domain.rootDomain}`,
      deletedCount: deletedCountOffset + purgeResult.deletedHostCount,
      totalCount: Math.max(
        nextTask.totalCount,
        deletedCountOffset + purgeResult.hosts.length,
      ),
    });

    if (!purgeResult.completed) {
      return {
        completed: false,
        task: await markTaskPending(db, nextTask, {
          phase: "purging_exact_dns",
        }),
      };
    }

    nextTask = await patchTask(db, nextTask, {
      phase: "ensuring_wildcard_dns",
      currentHost: wildcardHost,
    });
  }

  await ensureWildcardEmailRoutingDnsRecords(
    env,
    config,
    domain,
    requestSource,
  );
  await replaceSubdomainCacheForDomain(
    db,
    domain,
    desiredHosts,
    "wildcard",
    nowIso(),
  );

  return {
    completed: true,
    task: nextTask,
  };
};

const reconcileToExplicit = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  db: ReturnType<typeof getDb>,
  task: DomainCutoverTaskRow,
  domain: DomainRow,
  liveMailboxes: LiveMailboxRow[],
  requestSource: CloudflareRequestSource,
): Promise<ReconcileStepResult> => {
  const desiredHosts = buildDesiredExactHosts(liveMailboxes);
  const wildcardHost = `*.${domain.rootDomain}`;
  let nextTask = task;

  if (
    task.phase !== "purging_exact_dns" &&
    task.phase !== "rebuilding_exact_dns" &&
    task.phase !== "restoring_registered_routes"
  ) {
    if (task.phase !== "deleting_wildcard_dns") {
      nextTask = await patchTask(db, task, {
        phase: "deleting_wildcard_dns",
        currentHost: wildcardHost,
        deletedCount: 0,
        rebuiltCount: 0,
        totalCount: 0,
      });
    }

    await deleteWildcardEmailRoutingDnsRecords(
      env,
      config,
      domain,
      requestSource,
    );
    nextTask = await patchTask(db, nextTask, {
      phase: "purging_exact_dns",
      currentHost: null,
    });
  }

  if (nextTask.phase === "purging_exact_dns") {
    const deletedCountOffset = nextTask.deletedCount;
    const purgeResult = await purgeProjectMailboxExactDnsHosts(
      env,
      config,
      domain,
      requestSource,
      {
        maxHostCount: exactDnsPurgeBatchSize,
        onHostDeleted: async ({ host, deletedCount, totalCount }) => {
          nextTask = await patchTask(db, nextTask, {
            phase: "purging_exact_dns",
            currentHost: host,
            deletedCount: deletedCountOffset + deletedCount,
            totalCount: Math.max(
              nextTask.totalCount,
              deletedCountOffset + totalCount,
            ),
          });
        },
      },
    );

    nextTask = await patchTask(db, nextTask, {
      phase: "purging_exact_dns",
      currentHost:
        purgeResult.processedHosts.at(-1) === undefined
          ? null
          : `${purgeResult.processedHosts.at(-1)}.${domain.rootDomain}`,
      deletedCount: deletedCountOffset + purgeResult.deletedHostCount,
      totalCount: Math.max(
        nextTask.totalCount,
        deletedCountOffset + purgeResult.hosts.length,
      ),
    });

    if (!purgeResult.completed) {
      return {
        completed: false,
        task: await markTaskPending(db, nextTask, {
          phase: "purging_exact_dns",
        }),
      };
    }

    nextTask = await patchTask(db, nextTask, {
      phase: "rebuilding_exact_dns",
      currentHost: null,
      rebuiltCount: 0,
      totalCount: desiredHosts.length,
    });
  }

  const existingHosts = new Set(
    await listProjectMailboxExactDnsHosts(env, config, domain, requestSource),
  );
  const missingHosts = desiredHosts.filter((host) => !existingHosts.has(host));
  const rebuiltCountBase = desiredHosts.length - missingHosts.length;
  const hostsToCreate = missingHosts.slice(0, exactDnsRebuildBatchSize);

  for (const [index, host] of hostsToCreate.entries()) {
    await ensureSubdomainEnabled(env, config, domain, host, requestSource);
    nextTask = await patchTask(db, nextTask, {
      phase: "rebuilding_exact_dns",
      currentHost: `${host}.${domain.rootDomain}`,
      rebuiltCount: rebuiltCountBase + index + 1,
      totalCount: desiredHosts.length,
    });
  }

  if (hostsToCreate.length < missingHosts.length) {
    return {
      completed: false,
      task: await markTaskPending(db, nextTask, {
        phase: "rebuilding_exact_dns",
        rebuiltCount: rebuiltCountBase + hostsToCreate.length,
        totalCount: desiredHosts.length,
      }),
    };
  }

  nextTask = await patchTask(db, nextTask, {
    phase: "rebuilding_exact_dns",
    currentHost: hostsToCreate.at(-1)
      ? `${hostsToCreate.at(-1)}.${domain.rootDomain}`
      : null,
    rebuiltCount: desiredHosts.length,
    totalCount: desiredHosts.length,
  });

  await replaceSubdomainCacheForDomain(
    db,
    domain,
    desiredHosts,
    "explicit",
    nowIso(),
  );

  return {
    completed: true,
    task: nextTask,
  };
};

const retireCatchAllMailboxes = async (
  db: ReturnType<typeof getDb>,
  domainId: string,
) => {
  const rows = await db
    .select({
      id: mailboxes.id,
      status: mailboxes.status,
      destroyedAt: mailboxes.destroyedAt,
    })
    .from(mailboxes)
    .where(
      and(
        eq(mailboxes.domainId, domainId),
        eq(mailboxes.source, "catch_all"),
        eq(mailboxes.status, "active"),
      ),
    )
    .orderBy(asc(mailboxes.createdAt));

  if (rows.length === 0) {
    return rows;
  }

  await db
    .update(mailboxes)
    .set({
      status: "destroyed",
      destroyedAt: nowIso(),
      routingRuleId: null,
    })
    .where(
      and(
        eq(mailboxes.domainId, domainId),
        eq(mailboxes.source, "catch_all"),
        eq(mailboxes.status, "active"),
      ),
    );

  return rows;
};

const restoreRetiredCatchAllMailboxes = async (
  db: ReturnType<typeof getDb>,
  rows: Array<Pick<MailboxRow, "id">>,
) => {
  const mailboxIds = rows.map((row) => row.id);
  if (mailboxIds.length === 0) {
    return;
  }

  for (const mailboxIdChunk of chunkD1InValues(mailboxIds)) {
    await db
      .update(mailboxes)
      .set({
        status: "active",
        destroyedAt: null,
      })
      .where(inArray(mailboxes.id, mailboxIdChunk));
  }
};

const backfillRegisteredMailboxRoutes = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  db: ReturnType<typeof getDb>,
  task: DomainCutoverTaskRow,
  domain: DomainRow,
  requestSource: CloudflareRequestSource,
): Promise<ReconcileStepResult> => {
  const registeredMailboxes = await listActiveMailboxesForDomain(
    db,
    domain.id,
    {
      includeCatchAll: false,
    },
  );
  const missingRoutes = registeredMailboxes.filter((row) => !row.routingRuleId);
  const restoredCountBase = registeredMailboxes.length - missingRoutes.length;
  const routesToCreate = missingRoutes.slice(0, routeRestoreBatchSize);
  let nextTask =
    task.phase === "restoring_registered_routes"
      ? await patchTask(db, task, {
          rebuiltCount: restoredCountBase,
          totalCount: registeredMailboxes.length,
        })
      : await patchTask(db, task, {
          phase: "restoring_registered_routes",
          currentHost: null,
          rebuiltCount: restoredCountBase,
          totalCount: registeredMailboxes.length,
        });

  const createdRoutes: Array<{ mailboxId: string; ruleId: string }> = [];

  try {
    for (const [index, mailbox] of routesToCreate.entries()) {
      const routingRuleId = await createRoutingRule(
        env,
        config,
        domain,
        mailbox.address,
        requestSource,
      );
      if (!routingRuleId) {
        throw new ApiError(
          409,
          "Catch-all cannot be disabled without Email Routing management",
        );
      }

      createdRoutes.push({ mailboxId: mailbox.id, ruleId: routingRuleId });
      await db
        .update(mailboxes)
        .set({ routingRuleId })
        .where(eq(mailboxes.id, mailbox.id));
      nextTask = await patchTask(db, nextTask, {
        phase: "restoring_registered_routes",
        currentHost: mailbox.address,
        rebuiltCount: restoredCountBase + index + 1,
        totalCount: registeredMailboxes.length,
      });
    }
  } catch (error) {
    for (const createdRoute of [...createdRoutes].reverse()) {
      try {
        await deleteRoutingRule(
          env,
          config,
          domain,
          createdRoute.ruleId,
          requestSource,
        );
      } catch {
        // Ignore rollback noise; the task error already captures the primary cause.
      }
      await db
        .update(mailboxes)
        .set({ routingRuleId: null })
        .where(eq(mailboxes.id, createdRoute.mailboxId));
    }
    throw error;
  }

  if (routesToCreate.length < missingRoutes.length) {
    return {
      completed: false,
      task: await markTaskPending(db, nextTask, {
        phase: "restoring_registered_routes",
        rebuiltCount: restoredCountBase + routesToCreate.length,
        totalCount: registeredMailboxes.length,
      }),
    };
  }

  return {
    completed: true,
    task: nextTask,
  };
};

const runEnableCutover = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  db: ReturnType<typeof getDb>,
  task: DomainCutoverTaskRow,
  domain: DomainRow,
) => {
  const requestSource = domainCutoverRequestSources.enable;
  const ownerUserId = task.requestedByUserId ?? domain.catchAllOwnerUserId;
  if (!ownerUserId) {
    return markTaskFailed(
      db,
      task,
      "Catch-all enable requires an owner user",
      null,
    );
  }

  const liveMailboxes = await listActiveMailboxesForDomain(db, domain.id, {
    includeCatchAll: domain.catchAllEnabled,
  });

  if (task.rollbackPhase === "rolling_back_dns") {
    try {
      const rollbackResult = await reconcileToExplicit(
        env,
        config,
        db,
        task,
        domain,
        liveMailboxes,
        requestSource,
      );
      if (!rollbackResult.completed) {
        return rollbackResult.task;
      }

      const failedTask = await markTaskFailed(
        db,
        rollbackResult.task,
        task.error ?? "Wildcard cutover failed",
        "rollback_completed",
      );
      logOperationalEvent("warn", "domains.cutover.failed", {
        taskId: failedTask.id,
        domainId: domain.id,
        rootDomain: domain.rootDomain,
        action: task.action,
        targetMode: task.targetMode,
        rollbackPhase: "rollback_completed",
        error: failedTask.error,
      });
      return failedTask;
    } catch (rollbackError) {
      const errorMessage = `${task.error ?? "Wildcard cutover failed"} (dns rollback failed: ${toErrorMessage(
        rollbackError,
      )})`;
      await persistWildcardFailure(db, domain.id, errorMessage);
      const failedTask = await markTaskFailed(
        db,
        task,
        errorMessage,
        "rollback_failed",
      );
      logOperationalEvent("warn", "domains.cutover.failed", {
        taskId: failedTask.id,
        domainId: domain.id,
        rootDomain: domain.rootDomain,
        action: task.action,
        targetMode: task.targetMode,
        rollbackPhase: "rollback_failed",
        error: errorMessage,
      });
      return failedTask;
    }
  }

  let nextTask = task;
  let catchAllRuleChanged = false;
  let rollbackFailed = false;
  let rollbackPhase: string | null = null;
  let currentRule: CloudflareCatchAllRule | null = null;

  try {
    currentRule = await getCatchAllRule(env, config, domain, requestSource);
    if (!currentRule) {
      return markTaskFailed(db, task, "Catch-all rule is not available", null);
    }

    const restoreStateJson = serializeCatchAllRestoreState(
      parseCatchAllRestoreState(domain.catchAllRestoreStateJson) ??
        toCatchAllRestoreState(currentRule),
    );

    const reconcileResult =
      task.targetMode === "wildcard"
        ? await reconcileToWildcard(
            env,
            config,
            db,
            nextTask,
            domain,
            liveMailboxes,
            requestSource,
          )
        : await reconcileToExplicit(
            env,
            config,
            db,
            nextTask,
            domain,
            liveMailboxes,
            requestSource,
          );
    nextTask = reconcileResult.task;
    if (!reconcileResult.completed) {
      return nextTask;
    }

    nextTask = await patchTask(db, nextTask, {
      phase: "updating_catch_all_rule",
      currentHost: null,
    });
    await updateCatchAllRule(
      env,
      config,
      domain,
      buildManagedCatchAllRule(
        domain,
        currentRule,
        requireCatchAllWorkerName(config),
      ),
      requestSource,
    );
    catchAllRuleChanged = true;

    const updatedAt = nowIso();
    await db
      .update(domains)
      .set({
        catchAllEnabled: true,
        catchAllOwnerUserId: ownerUserId,
        catchAllRestoreStateJson: restoreStateJson,
        catchAllUpdatedAt: updatedAt,
        subdomainDnsMode: task.targetMode,
        wildcardDnsVerifiedAt:
          task.targetMode === "wildcard" ? updatedAt : null,
        wildcardDnsLastError: null,
        updatedAt,
      })
      .where(eq(domains.id, domain.id));

    nextTask = await markTaskCompleted(db, nextTask);
    logOperationalEvent("info", "domains.cutover.completed", {
      taskId: nextTask.id,
      domainId: domain.id,
      rootDomain: domain.rootDomain,
      action: task.action,
      targetMode: task.targetMode,
    });
    return nextTask;
  } catch (error) {
    nextTask = (await getTaskRowById(db, nextTask.id)) ?? nextTask;
    let errorMessage = toErrorMessage(error);
    const shouldRollbackDns =
      task.targetMode === "wildcard" &&
      (nextTask.phase === "purging_exact_dns" ||
        nextTask.phase === "ensuring_wildcard_dns" ||
        nextTask.phase === "updating_catch_all_rule");

    if (catchAllRuleChanged) {
      rollbackPhase = "restoring_catch_all_rule";
      nextTask = await patchTask(db, nextTask, { rollbackPhase });
      try {
        if (currentRule) {
          await updateCatchAllRule(
            env,
            config,
            domain,
            currentRule,
            requestSource,
          );
        }
      } catch (restoreError) {
        rollbackFailed = true;
        errorMessage = `${errorMessage} (rule rollback failed: ${toErrorMessage(
          restoreError,
        )})`;
      }
    }

    if (shouldRollbackDns) {
      rollbackPhase = "rolling_back_dns";
      nextTask = await patchTask(db, nextTask, {
        rollbackPhase,
        error: errorMessage,
      });

      try {
        const rollbackResult = await reconcileToExplicit(
          env,
          config,
          db,
          nextTask,
          domain,
          liveMailboxes,
          requestSource,
        );
        nextTask = rollbackResult.task;
        await persistWildcardFailure(db, domain.id, errorMessage);

        if (!rollbackResult.completed) {
          return await markTaskPending(db, nextTask, {
            rollbackPhase,
            error: errorMessage,
          });
        }
      } catch (rollbackError) {
        rollbackFailed = true;
        errorMessage = `${errorMessage} (dns rollback failed: ${toErrorMessage(
          rollbackError,
        )})`;
      }
    }

    if (task.targetMode === "wildcard") {
      await persistWildcardFailure(db, domain.id, errorMessage);
    }

    rollbackPhase = rollbackFailed
      ? "rollback_failed"
      : rollbackPhase
        ? "rollback_completed"
        : null;
    nextTask = await markTaskFailed(db, nextTask, errorMessage, rollbackPhase);
    logOperationalEvent("warn", "domains.cutover.failed", {
      taskId: nextTask.id,
      domainId: domain.id,
      rootDomain: domain.rootDomain,
      action: task.action,
      targetMode: task.targetMode,
      rollbackPhase,
      error: errorMessage,
    });
    return nextTask;
  }
};

const runDisableCutover = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  db: ReturnType<typeof getDb>,
  task: DomainCutoverTaskRow,
  domain: DomainRow,
) => {
  const requestSource = domainCutoverRequestSources.disable;
  let nextTask = task;
  let retiredCatchAll = [] as Array<Pick<MailboxRow, "id">>;
  let catchAllRuleRestored = false;
  let rollbackFailed = false;
  let rollbackPhase: string | null = null;
  let currentRule: CloudflareCatchAllRule | null = null;
  let restoreState: CatchAllRestoreState | null = null;

  try {
    currentRule = domain.catchAllEnabled
      ? await getCatchAllRule(env, config, domain, requestSource)
      : null;
    restoreState = domain.catchAllEnabled
      ? parseCatchAllRestoreState(domain.catchAllRestoreStateJson)
      : null;
    if (domain.catchAllEnabled && !currentRule) {
      return markTaskFailed(db, task, "Catch-all rule is not available", null);
    }
    if (domain.catchAllEnabled && !restoreState) {
      return markTaskFailed(
        db,
        task,
        "Domain catch-all restore state is missing",
        null,
      );
    }

    if (
      task.phase === "queued" ||
      task.phase === "loading_state" ||
      task.phase === "retiring_catch_all_mailboxes"
    ) {
      nextTask = await patchTask(db, nextTask, {
        phase: "retiring_catch_all_mailboxes",
        currentHost: null,
        deletedCount:
          task.phase === "retiring_catch_all_mailboxes" ? task.deletedCount : 0,
        rebuiltCount:
          task.phase === "retiring_catch_all_mailboxes" ? task.rebuiltCount : 0,
        totalCount:
          task.phase === "retiring_catch_all_mailboxes" ? task.totalCount : 0,
        rollbackPhase: null,
        error: null,
      });
      retiredCatchAll = await retireCatchAllMailboxes(db, domain.id);
    }

    const registeredMailboxes = await listActiveMailboxesForDomain(
      db,
      domain.id,
      {
        includeCatchAll: false,
      },
    );
    if (nextTask.phase !== "restoring_registered_routes") {
      const reconcileResult = await reconcileToExplicit(
        env,
        config,
        db,
        nextTask,
        domain,
        registeredMailboxes,
        requestSource,
      );
      nextTask = reconcileResult.task;
      if (!reconcileResult.completed) {
        return nextTask;
      }
    }

    const backfillResult = await backfillRegisteredMailboxRoutes(
      env,
      config,
      db,
      nextTask,
      domain,
      requestSource,
    );
    nextTask = backfillResult.task;
    if (!backfillResult.completed) {
      return nextTask;
    }

    if (restoreState) {
      nextTask = await patchTask(db, nextTask, {
        phase: "restoring_catch_all_rule",
        currentHost: null,
      });
      await updateCatchAllRule(
        env,
        config,
        domain,
        restoreState,
        requestSource,
      );
      catchAllRuleRestored = true;
    }

    const updatedAt = nowIso();
    await db
      .update(domains)
      .set({
        catchAllEnabled: false,
        catchAllOwnerUserId: null,
        catchAllRestoreStateJson: null,
        catchAllUpdatedAt: updatedAt,
        subdomainDnsMode: "explicit",
        wildcardDnsVerifiedAt: null,
        wildcardDnsLastError: null,
        updatedAt,
      })
      .where(eq(domains.id, domain.id));

    nextTask = await markTaskCompleted(db, nextTask);
    logOperationalEvent("info", "domains.cutover.completed", {
      taskId: nextTask.id,
      domainId: domain.id,
      rootDomain: domain.rootDomain,
      action: task.action,
      targetMode: task.targetMode,
    });
    return nextTask;
  } catch (error) {
    let errorMessage = toErrorMessage(error);

    if (catchAllRuleRestored && currentRule) {
      rollbackPhase = "restoring_managed_catch_all_rule";
      nextTask = await patchTask(db, nextTask, { rollbackPhase });
      try {
        await updateCatchAllRule(
          env,
          config,
          domain,
          currentRule,
          requestSource,
        );
      } catch (restoreError) {
        rollbackFailed = true;
        errorMessage = `${errorMessage} (rule rollback failed: ${toErrorMessage(
          restoreError,
        )})`;
      }
    }

    if (retiredCatchAll.length > 0) {
      rollbackPhase = "restoring_catch_all_mailboxes";
      nextTask = await patchTask(db, nextTask, { rollbackPhase });
      try {
        await restoreRetiredCatchAllMailboxes(db, retiredCatchAll);
      } catch (rollbackError) {
        rollbackFailed = true;
        errorMessage = `${errorMessage} (mailbox rollback failed: ${toErrorMessage(
          rollbackError,
        )})`;
      }
    }

    rollbackPhase = rollbackFailed
      ? "rollback_failed"
      : rollbackPhase
        ? "rollback_completed"
        : null;
    nextTask = await markTaskFailed(db, nextTask, errorMessage, rollbackPhase);
    logOperationalEvent("warn", "domains.cutover.failed", {
      taskId: nextTask.id,
      domainId: domain.id,
      rootDomain: domain.rootDomain,
      action: task.action,
      targetMode: task.targetMode,
      rollbackPhase,
      error: errorMessage,
    });
    return nextTask;
  }
};

export const createDomainCutoverTask = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  input: {
    domainId: string;
    action: DomainCutoverAction;
    requestedByUserId: string | null;
  },
) => {
  requireCatchAllManagementEnabled(config, input.action);
  const db = getDb(env);
  const domain = await getDomainRowById(db, input.domainId);
  if (!domain || domain.deletedAt) {
    throw new ApiError(404, "Mailbox domain not found");
  }
  if (domain.status !== "active") {
    throw new ApiError(
      409,
      `Only active mailbox domains can ${input.action} catch-all`,
    );
  }
  if (
    input.action === "enable" &&
    !domain.catchAllEnabled &&
    !input.requestedByUserId
  ) {
    throw new ApiError(500, "Catch-all enable requires an owner user");
  }

  const existingTask = await findOpenTaskForDomain(db, domain.id);
  if (existingTask) {
    return toTaskDto(existingTask);
  }

  const timestamp = nowIso();
  const row: DomainCutoverTaskRow = {
    id: randomId("dct"),
    domainId: domain.id,
    rootDomain: domain.rootDomain,
    requestedByUserId: input.requestedByUserId,
    action: input.action,
    targetMode:
      input.action === "disable"
        ? "explicit"
        : shouldAllowWildcardSubdomainDnsCutover(config, domain.rootDomain)
          ? "wildcard"
          : "explicit",
    status: "pending",
    phase: "queued",
    currentHost: null,
    deletedCount: 0,
    rebuiltCount: 0,
    totalCount: 0,
    rollbackPhase: null,
    error: null,
    createdAt: timestamp,
    startedAt: null,
    updatedAt: timestamp,
    completedAt: null,
    failedAt: null,
  };

  await db.insert(domainCutoverTasks).values(row);
  logOperationalEvent("info", "domains.cutover.created", {
    taskId: row.id,
    domainId: row.domainId,
    rootDomain: row.rootDomain,
    action: row.action,
    targetMode: row.targetMode,
  });
  return toTaskDto(row);
};

export const getDomainCutoverTaskById = async (
  env: WorkerEnv,
  taskId: string,
) => {
  const db = getDb(env);
  const row = await getTaskRowById(db, taskId);
  if (!row) {
    throw new ApiError(404, "Domain cutover task not found");
  }
  return toTaskDto(row);
};

export const runDomainCutoverTaskById = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  taskId: string,
) => {
  const db = getDb(env);
  const currentTask = await getTaskRowById(db, taskId);
  if (!currentTask) {
    throw new ApiError(404, "Domain cutover task not found");
  }
  if (currentTask.status === "completed" || currentTask.status === "failed") {
    return toTaskDto(currentTask);
  }

  const domain = await getDomainRowById(db, currentTask.domainId);
  if (!domain || domain.deletedAt) {
    const failedTask = await markTaskFailed(
      db,
      currentTask,
      "Mailbox domain not found",
      null,
    );
    return toTaskDto(failedTask);
  }

  const task = await patchTask(db, currentTask, {
    status: "running",
    phase: currentTask.phase === "queued" ? "loading_state" : currentTask.phase,
    startedAt: currentTask.startedAt ?? nowIso(),
    completedAt: null,
    failedAt: null,
  });

  try {
    const finalTask =
      task.action === "enable"
        ? await runEnableCutover(env, config, db, task, domain)
        : await runDisableCutover(env, config, db, task, domain);

    return toTaskDto(finalTask);
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    if (task.action === "enable" && task.targetMode === "wildcard") {
      await persistWildcardFailure(db, task.domainId, errorMessage);
    }
    const failedTask = await markTaskFailed(db, task, errorMessage, null);
    logOperationalEvent("warn", "domains.cutover.failed", {
      taskId: failedTask.id,
      domainId: domain.id,
      rootDomain: domain.rootDomain,
      action: task.action,
      targetMode: task.targetMode,
      rollbackPhase: null,
      error: errorMessage,
    });
    return toTaskDto(failedTask);
  }
};
