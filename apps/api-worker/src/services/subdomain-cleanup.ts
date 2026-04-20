import { and, eq, ne } from "drizzle-orm";

import { getDb } from "../db/client";
import { mailboxes, subdomains } from "../db/schema";
import {
  defaultSubdomainCleanupDispatchBatchSize,
  type RuntimeConfig,
  type WorkerEnv,
} from "../env";
import { nowIso, randomId } from "../lib/crypto";
import { ApiError } from "../lib/errors";
import { logOperationalEvent } from "../lib/observability";
import {
  deleteSubdomainEmailRoutingDnsRecords,
  ensureSubdomainEnabled,
  getCloudflareAuthBlockState,
  getCloudflareRateLimitState,
} from "./emailRouting";
import { releaseRuntimeLease, tryAcquireRuntimeLease } from "./runtime-state";

type SubdomainRow = typeof subdomains.$inferSelect;

export type PendingSubdomainCleanupRow = SubdomainRow & {
  rootDomain: string;
  zoneId: string | null;
};

export interface SubdomainCleanupQueueMessage {
  subdomainId: string;
  leaseOwner: string;
  dispatchedAt: string;
}

export const SUBDOMAIN_CLEANUP_DISPATCH_CRON = "* * * * *";

const subdomainCleanupRequestSource = {
  projectOperation: "subdomains.cleanup",
  projectRoute: "subdomain cleanup queue",
} as const;

const subdomainCleanupRetryDelayMs = 60 * 60 * 1000;
const subdomainCleanupDispatcherLeaseKey = "subdomain_cleanup_dispatcher_lease";
const subdomainCleanupDispatcherLeaseTtlMs = 55 * 1000;
const subdomainCleanupQueueLeaseTtlMs = 5 * 60 * 1000;
const subdomainCleanupQueueRetryDelaySeconds = 60;
const subdomainCleanupAuthRetryDelaySeconds = 300;

const formatCleanupError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const resolveNextCleanupAttemptAt = (now: string) =>
  new Date(Date.parse(now) + subdomainCleanupRetryDelayMs).toISOString();

const resolveDispatcherLeaseUntil = (now: string) =>
  new Date(
    Date.parse(now) + subdomainCleanupDispatcherLeaseTtlMs,
  ).toISOString();

const resolveQueueLeaseUntil = (delaySeconds: number) =>
  new Date(
    Date.now() + Math.max(delaySeconds * 1000, subdomainCleanupQueueLeaseTtlMs),
  ).toISOString();

const resolveDispatchBatchSize = (config: RuntimeConfig) =>
  config.SUBDOMAIN_CLEANUP_DISPATCH_BATCH_SIZE ??
  defaultSubdomainCleanupDispatchBatchSize;

const resolveSubdomainLifecycleMode = (row: Pick<SubdomainRow, "metadata">) => {
  if (!row.metadata) {
    return "explicit" as const;
  }

  try {
    const parsed = JSON.parse(row.metadata) as { mode?: unknown };
    return parsed.mode === "wildcard"
      ? ("wildcard" as const)
      : ("explicit" as const);
  } catch {
    return "explicit" as const;
  }
};

const clearSubdomainCleanupState = async (
  db: ReturnType<typeof getDb>,
  subdomainId: string,
  lastUsedAt?: string,
) => {
  await db
    .update(subdomains)
    .set({
      lastUsedAt: lastUsedAt ?? undefined,
      cleanupNextAttemptAt: null,
      cleanupLastError: null,
      cleanupLeaseOwner: null,
      cleanupLeaseUntil: null,
    })
    .where(eq(subdomains.id, subdomainId));
};

const markSubdomainCleanupPending = async (
  db: ReturnType<typeof getDb>,
  row: Pick<PendingSubdomainCleanupRow, "id">,
  now: string,
) => {
  await db
    .update(subdomains)
    .set({
      cleanupNextAttemptAt: now,
      cleanupLastError: null,
    })
    .where(eq(subdomains.id, row.id));
};

const markSubdomainCleanupBackoff = async (
  db: ReturnType<typeof getDb>,
  row: Pick<PendingSubdomainCleanupRow, "id">,
  now: string,
  error: unknown,
) => {
  await db
    .update(subdomains)
    .set({
      cleanupNextAttemptAt: resolveNextCleanupAttemptAt(now),
      cleanupLastError: formatCleanupError(error),
      cleanupLeaseOwner: null,
      cleanupLeaseUntil: null,
    })
    .where(eq(subdomains.id, row.id));
};

const extendSubdomainCleanupLease = async (
  env: WorkerEnv,
  row: Pick<PendingSubdomainCleanupRow, "id">,
  leaseOwner: string,
  leaseUntil: string,
) => {
  await env.DB.prepare(
    `UPDATE subdomains
    SET cleanup_lease_until = ?
    WHERE id = ?
      AND cleanup_lease_owner = ?`,
  )
    .bind(leaseUntil, row.id, leaseOwner)
    .run();
};

const releaseSubdomainCleanupLease = async (
  env: WorkerEnv,
  row: Pick<PendingSubdomainCleanupRow, "id">,
  leaseOwner: string,
) => {
  await env.DB.prepare(
    `UPDATE subdomains
    SET cleanup_lease_owner = NULL,
        cleanup_lease_until = NULL
    WHERE id = ?
      AND cleanup_lease_owner = ?`,
  )
    .bind(row.id, leaseOwner)
    .run();
};

const hasLiveMailboxReference = async (
  env: WorkerEnv,
  row: Pick<PendingSubdomainCleanupRow, "domainId" | "name">,
) => {
  if (!row.domainId) {
    return false;
  }

  const db = getDb(env);
  const liveRows = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(
      and(
        eq(mailboxes.domainId, row.domainId),
        eq(mailboxes.subdomain, row.name),
        ne(mailboxes.status, "destroyed"),
      ),
    )
    .limit(1);

  return Boolean(liveRows[0]);
};

export const listSubdomainsPendingCleanup = async (
  env: WorkerEnv,
  config: RuntimeConfig,
): Promise<PendingSubdomainCleanupRow[]> => {
  if (
    config.SUBDOMAIN_CLEANUP_BATCH_SIZE === 0 ||
    !config.EMAIL_ROUTING_MANAGEMENT_ENABLED
  ) {
    return [];
  }

  const now = nowIso();
  const result = await env.DB.prepare(
    `SELECT
      s.id,
      s.domain_id AS domainId,
      s.name,
      s.enabled_at AS enabledAt,
      s.last_used_at AS lastUsedAt,
      s.cleanup_next_attempt_at AS cleanupNextAttemptAt,
      s.cleanup_last_error AS cleanupLastError,
      s.cleanup_lease_owner AS cleanupLeaseOwner,
      s.cleanup_lease_until AS cleanupLeaseUntil,
      s.metadata,
      d.root_domain AS rootDomain,
      d.zone_id AS zoneId
    FROM subdomains s
    INNER JOIN domains d ON d.id = s.domain_id
    WHERE d.deleted_at IS NULL
      AND d.zone_id IS NOT NULL
      AND (s.cleanup_next_attempt_at IS NULL OR s.cleanup_next_attempt_at <= ?)
      AND (s.cleanup_lease_until IS NULL OR s.cleanup_lease_until <= ?)
      AND (
        s.cleanup_next_attempt_at IS NOT NULL
        OR s.cleanup_last_error IS NOT NULL
        OR NOT EXISTS (
          SELECT 1
          FROM mailboxes m
          WHERE m.domain_id = s.domain_id
            AND m.subdomain = s.name
            AND m.status != 'destroyed'
        )
      )
    ORDER BY s.last_used_at ASC, s.id ASC
    LIMIT ?`,
  )
    .bind(now, now, config.SUBDOMAIN_CLEANUP_BATCH_SIZE)
    .all<PendingSubdomainCleanupRow>();

  return result.results ?? [];
};

const loadSubdomainCleanupRow = async (
  env: WorkerEnv,
  subdomainId: string,
): Promise<PendingSubdomainCleanupRow | null> => {
  const row = await env.DB.prepare(
    `SELECT
      s.id,
      s.domain_id AS domainId,
      s.name,
      s.enabled_at AS enabledAt,
      s.last_used_at AS lastUsedAt,
      s.cleanup_next_attempt_at AS cleanupNextAttemptAt,
      s.cleanup_last_error AS cleanupLastError,
      s.cleanup_lease_owner AS cleanupLeaseOwner,
      s.cleanup_lease_until AS cleanupLeaseUntil,
      s.metadata,
      d.root_domain AS rootDomain,
      d.zone_id AS zoneId
    FROM subdomains s
    INNER JOIN domains d ON d.id = s.domain_id
    WHERE s.id = ?
      AND d.deleted_at IS NULL
    LIMIT 1`,
  )
    .bind(subdomainId)
    .first<PendingSubdomainCleanupRow>();

  return row ?? null;
};

const claimSubdomainCleanupLease = async (
  env: WorkerEnv,
  row: Pick<PendingSubdomainCleanupRow, "id">,
  leaseOwner: string,
  leaseUntil: string,
) => {
  const result = await env.DB.prepare(
    `UPDATE subdomains
    SET cleanup_lease_owner = ?,
        cleanup_lease_until = ?
    WHERE id = ?
      AND (cleanup_lease_until IS NULL OR cleanup_lease_until <= ?)`,
  )
    .bind(leaseOwner, leaseUntil, row.id, nowIso())
    .run();

  return (result.meta?.changes ?? 0) > 0;
};

const ensureQueueBinding = (env: WorkerEnv) => {
  if (env.SUBDOMAIN_CLEANUP_QUEUE) {
    return env.SUBDOMAIN_CLEANUP_QUEUE;
  }

  throw new ApiError(500, "SUBDOMAIN_CLEANUP_QUEUE binding is not configured");
};

export const runSubdomainCleanupDispatcher = async (
  env: WorkerEnv,
  config: RuntimeConfig,
) => {
  if (
    config.SUBDOMAIN_CLEANUP_BATCH_SIZE === 0 ||
    !config.EMAIL_ROUTING_MANAGEMENT_ENABLED
  ) {
    return 0;
  }

  const authBlock = await getCloudflareAuthBlockState(env);
  if (authBlock) {
    logOperationalEvent("warn", "subdomains.cleanup.dispatch.skipped.auth", {
      retryAfter: authBlock.retryAfter,
      retryAfterSeconds: authBlock.retryAfterSeconds,
      authBlockContext: authBlock.authBlockContext,
    });
    return 0;
  }

  const existingCooldown = await getCloudflareRateLimitState(env);
  if (existingCooldown) {
    logOperationalEvent(
      "warn",
      "subdomains.cleanup.dispatch.skipped.rate_limited",
      {
        retryAfter: existingCooldown.retryAfter,
        retryAfterSeconds: existingCooldown.retryAfterSeconds,
        rateLimitContext: existingCooldown.rateLimitContext,
      },
    );
    return 0;
  }

  const leaseOwner = randomId("lease");
  const lease = await tryAcquireRuntimeLease(
    env,
    subdomainCleanupDispatcherLeaseKey,
    leaseOwner,
    resolveDispatcherLeaseUntil(nowIso()),
  );

  if (!lease) {
    logOperationalEvent(
      "info",
      "subdomains.cleanup.dispatch.skipped.lease_contended",
      {
        leaseKey: subdomainCleanupDispatcherLeaseKey,
      },
    );
    return 0;
  }

  const queue = ensureQueueBinding(env);
  const dispatchBatchSize = resolveDispatchBatchSize(config);

  try {
    const pending = await listSubdomainsPendingCleanup(env, config);
    const messages: Array<{ body: SubdomainCleanupQueueMessage }> = [];
    const claimedRows: Array<{ id: string; leaseOwner: string }> = [];

    for (const row of pending) {
      if (messages.length >= dispatchBatchSize) {
        break;
      }

      const rowLeaseOwner = randomId("subclean");
      const claimed = await claimSubdomainCleanupLease(
        env,
        row,
        rowLeaseOwner,
        resolveQueueLeaseUntil(subdomainCleanupQueueRetryDelaySeconds),
      );

      if (!claimed) {
        continue;
      }

      claimedRows.push({ id: row.id, leaseOwner: rowLeaseOwner });
      messages.push({
        body: {
          subdomainId: row.id,
          leaseOwner: rowLeaseOwner,
          dispatchedAt: nowIso(),
        },
      });
    }

    if (messages.length > 0) {
      try {
        await queue.sendBatch(messages);
      } catch (error) {
        await Promise.all(
          claimedRows.map((row) =>
            releaseSubdomainCleanupLease(env, row, row.leaseOwner),
          ),
        );
        throw error;
      }
    }

    logOperationalEvent("info", "subdomains.cleanup.dispatch.completed", {
      candidateCount: pending.length,
      dispatchedCount: messages.length,
      hostWindowLimit: config.SUBDOMAIN_CLEANUP_BATCH_SIZE,
      dispatchBatchSize,
    });

    return messages.length;
  } finally {
    await releaseRuntimeLease(
      env,
      subdomainCleanupDispatcherLeaseKey,
      leaseOwner,
    );
  }
};

const retrySubdomainCleanupMessage = async (
  env: WorkerEnv,
  row: PendingSubdomainCleanupRow,
  leaseOwner: string,
  message: Message<SubdomainCleanupQueueMessage>,
  delaySeconds: number,
  reason: "rate_limited" | "auth_blocked",
) => {
  await extendSubdomainCleanupLease(
    env,
    row,
    leaseOwner,
    resolveQueueLeaseUntil(delaySeconds),
  );
  message.retry({ delaySeconds });
  logOperationalEvent("warn", "subdomains.cleanup.queue.retried", {
    subdomainId: row.id,
    domainId: row.domainId,
    rootDomain: row.rootDomain,
    subdomain: row.name,
    reason,
    delaySeconds,
  });
};

const handleSubdomainCleanupFailure = async (
  env: WorkerEnv,
  db: ReturnType<typeof getDb>,
  row: PendingSubdomainCleanupRow,
  leaseOwner: string,
  message: Message<SubdomainCleanupQueueMessage>,
  cleanupStartedAt: string,
  error: unknown,
) => {
  if (error instanceof ApiError && error.status === 429) {
    await retrySubdomainCleanupMessage(
      env,
      row,
      leaseOwner,
      message,
      subdomainCleanupQueueRetryDelaySeconds,
      "rate_limited",
    );
    return;
  }

  if (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403)
  ) {
    const authBlock = await getCloudflareAuthBlockState(env);
    await retrySubdomainCleanupMessage(
      env,
      row,
      leaseOwner,
      message,
      Math.max(
        subdomainCleanupQueueRetryDelaySeconds,
        Math.min(
          authBlock?.retryAfterSeconds ?? subdomainCleanupAuthRetryDelaySeconds,
          subdomainCleanupAuthRetryDelaySeconds,
        ),
      ),
      "auth_blocked",
    );
    return;
  }

  await markSubdomainCleanupBackoff(db, row, cleanupStartedAt, error);
  message.ack();
  logOperationalEvent("warn", "subdomains.cleanup.retry_scheduled", {
    subdomainId: row.id,
    domainId: row.domainId,
    rootDomain: row.rootDomain,
    subdomain: row.name,
    error: formatCleanupError(error),
  });
};

const processSubdomainCleanupMessage = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  message: Message<SubdomainCleanupQueueMessage>,
) => {
  const row = await loadSubdomainCleanupRow(env, message.body.subdomainId);
  if (!row) {
    message.ack();
    return;
  }

  if (
    row.cleanupLeaseOwner !== message.body.leaseOwner ||
    !row.cleanupLeaseUntil ||
    Date.parse(row.cleanupLeaseUntil) <= Date.now()
  ) {
    message.ack();
    return;
  }

  const authBlock = await getCloudflareAuthBlockState(env);
  if (authBlock) {
    await retrySubdomainCleanupMessage(
      env,
      row,
      message.body.leaseOwner,
      message,
      Math.max(
        subdomainCleanupQueueRetryDelaySeconds,
        Math.min(
          authBlock.retryAfterSeconds,
          subdomainCleanupAuthRetryDelaySeconds,
        ),
      ),
      "auth_blocked",
    );
    return;
  }

  const existingCooldown = await getCloudflareRateLimitState(env);
  if (existingCooldown) {
    await retrySubdomainCleanupMessage(
      env,
      row,
      message.body.leaseOwner,
      message,
      Math.max(
        subdomainCleanupQueueRetryDelaySeconds,
        existingCooldown.retryAfterSeconds,
      ),
      "rate_limited",
    );
    return;
  }

  const db = getDb(env);
  const lifecycleMode = resolveSubdomainLifecycleMode(row);

  if (await hasLiveMailboxReference(env, row)) {
    if (!row.cleanupNextAttemptAt && !row.cleanupLastError) {
      await clearSubdomainCleanupState(db, row.id);
      message.ack();
      return;
    }

    try {
      if (lifecycleMode === "explicit") {
        await ensureSubdomainEnabled(
          env,
          config,
          {
            rootDomain: row.rootDomain,
            zoneId: row.zoneId,
          },
          row.name,
          subdomainCleanupRequestSource,
        );
      }
      await clearSubdomainCleanupState(db, row.id);
      message.ack();
      return;
    } catch (error) {
      await handleSubdomainCleanupFailure(
        env,
        db,
        row,
        message.body.leaseOwner,
        message,
        nowIso(),
        error,
      );
      return;
    }
  }

  if (lifecycleMode === "wildcard") {
    await db.delete(subdomains).where(eq(subdomains.id, row.id));
    message.ack();
    return;
  }

  const cleanupStartedAt = nowIso();
  await markSubdomainCleanupPending(db, row, cleanupStartedAt);

  try {
    await deleteSubdomainEmailRoutingDnsRecords(
      env,
      config,
      {
        rootDomain: row.rootDomain,
        zoneId: row.zoneId,
      },
      row.name,
      subdomainCleanupRequestSource,
    );

    if (await hasLiveMailboxReference(env, row)) {
      await ensureSubdomainEnabled(
        env,
        config,
        {
          rootDomain: row.rootDomain,
          zoneId: row.zoneId,
        },
        row.name,
        subdomainCleanupRequestSource,
      );
      await clearSubdomainCleanupState(db, row.id, cleanupStartedAt);
      message.ack();
      return;
    }

    await db.delete(subdomains).where(eq(subdomains.id, row.id));
    message.ack();
  } catch (error) {
    await handleSubdomainCleanupFailure(
      env,
      db,
      row,
      message.body.leaseOwner,
      message,
      cleanupStartedAt,
      error,
    );
  }
};

export const consumeSubdomainCleanupQueue = async (
  batch: MessageBatch<SubdomainCleanupQueueMessage>,
  env: WorkerEnv,
  config: RuntimeConfig,
) => {
  for (const message of batch.messages) {
    await processSubdomainCleanupMessage(env, config, message);
  }
};
