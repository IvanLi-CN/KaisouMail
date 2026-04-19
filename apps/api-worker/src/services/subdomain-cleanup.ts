import { and, eq, ne } from "drizzle-orm";

import { getDb } from "../db/client";
import { mailboxes, subdomains } from "../db/schema";
import type { RuntimeConfig, WorkerEnv } from "../env";
import { nowIso, randomId } from "../lib/crypto";
import { ApiError } from "../lib/errors";
import { logOperationalEvent } from "../lib/observability";
import {
  CloudflareRequestExecutionAbortedError,
  deleteSubdomainEmailRoutingDnsRecords,
  ensureSubdomainEnabled,
  getCloudflareRateLimitState,
} from "./emailRouting";
import { releaseRuntimeLease, tryAcquireRuntimeLease } from "./runtime-state";

type SubdomainRow = typeof subdomains.$inferSelect;

export type PendingSubdomainCleanupRow = SubdomainRow & {
  rootDomain: string;
  zoneId: string | null;
};

const subdomainCleanupRequestSource = {
  projectOperation: "subdomains.cleanup",
  projectRoute: "scheduled mailbox cleanup",
} as const;

const subdomainCleanupRetryDelayMs = 60 * 60 * 1000;
const subdomainCleanupLeaseKey = "subdomain_cleanup_lease";
const subdomainCleanupRequestIntervalMs = 1000;
const subdomainCleanupRunDeadlineMs = 12 * 60 * 1000;
const subdomainCleanupLeaseTtlMs = 13 * 60 * 1000;

const formatCleanupError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const resolveNextCleanupAttemptAt = (now: string) =>
  new Date(Date.parse(now) + subdomainCleanupRetryDelayMs).toISOString();

const resolveCleanupLeaseUntil = (now: string) =>
  new Date(Date.parse(now) + subdomainCleanupLeaseTtlMs).toISOString();

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const createCloudflareRequestPacer = (deadlineAt: number) => {
  let lastRequestStartedAt = 0;

  return {
    hasTimeRemaining: () => Date.now() < deadlineAt,
    async beforeRequest() {
      if (Date.now() >= deadlineAt) {
        throw new CloudflareRequestExecutionAbortedError(
          "deadline_reached",
          "Subdomain cleanup request deadline reached",
        );
      }

      if (lastRequestStartedAt > 0) {
        const waitMs =
          subdomainCleanupRequestIntervalMs -
          (Date.now() - lastRequestStartedAt);
        if (waitMs > 0) {
          await sleep(waitMs);
        }
      }

      if (Date.now() >= deadlineAt) {
        throw new CloudflareRequestExecutionAbortedError(
          "deadline_reached",
          "Subdomain cleanup request deadline reached",
        );
      }

      lastRequestStartedAt = Date.now();
    },
  };
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
    })
    .where(eq(subdomains.id, row.id));
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

  const result = await env.DB.prepare(
    `SELECT
      s.id,
      s.domain_id AS domainId,
      s.name,
      s.enabled_at AS enabledAt,
      s.last_used_at AS lastUsedAt,
      s.cleanup_next_attempt_at AS cleanupNextAttemptAt,
      s.cleanup_last_error AS cleanupLastError,
      s.metadata,
      d.root_domain AS rootDomain,
      d.zone_id AS zoneId
    FROM subdomains s
    INNER JOIN domains d ON d.id = s.domain_id
    WHERE d.deleted_at IS NULL
      AND d.zone_id IS NOT NULL
      AND (s.cleanup_next_attempt_at IS NULL OR s.cleanup_next_attempt_at <= ?)
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
    .bind(nowIso(), config.SUBDOMAIN_CLEANUP_BATCH_SIZE)
    .all<PendingSubdomainCleanupRow>();

  return result.results ?? [];
};

export const runSubdomainCleanup = async (
  env: WorkerEnv,
  config: RuntimeConfig,
) => {
  const existingCooldown = await getCloudflareRateLimitState(env);
  if (existingCooldown) {
    logOperationalEvent("warn", "subdomains.cleanup.skipped.rate_limited", {
      retryAfter: existingCooldown.retryAfter,
      retryAfterSeconds: existingCooldown.retryAfterSeconds,
      rateLimitContext: existingCooldown.rateLimitContext,
    });
    return 0;
  }

  const leaseOwner = randomId("lease");
  const leaseAcquiredAt = nowIso();
  const lease = await tryAcquireRuntimeLease(
    env,
    subdomainCleanupLeaseKey,
    leaseOwner,
    resolveCleanupLeaseUntil(leaseAcquiredAt),
  );

  if (!lease) {
    logOperationalEvent("info", "subdomains.cleanup.skipped.lease_contended", {
      leaseKey: subdomainCleanupLeaseKey,
    });
    return 0;
  }

  const db = getDb(env);
  const pending = await listSubdomainsPendingCleanup(env, config);
  let cleanedCount = 0;
  let retryScheduledCount = 0;
  let liveReferenceSkipCount = 0;
  let rateLimitAbortCount = 0;
  let deadlineReached = false;
  const deadlineAt = Date.now() + subdomainCleanupRunDeadlineMs;
  const pacer = createCloudflareRequestPacer(deadlineAt);

  try {
    for (const row of pending) {
      if (!pacer.hasTimeRemaining()) {
        deadlineReached = true;
        break;
      }

      if (await hasLiveMailboxReference(env, row)) {
        if (row.cleanupNextAttemptAt || row.cleanupLastError) {
          const cleanupStartedAt = nowIso();

          try {
            await ensureSubdomainEnabled(
              env,
              config,
              {
                rootDomain: row.rootDomain,
                zoneId: row.zoneId,
              },
              row.name,
              subdomainCleanupRequestSource,
              {
                beforeRequest: () => pacer.beforeRequest(),
              },
            );
            await clearSubdomainCleanupState(db, row.id);
          } catch (error) {
            if (error instanceof CloudflareRequestExecutionAbortedError) {
              deadlineReached = true;
              break;
            }

            if (error instanceof ApiError && error.status === 429) {
              rateLimitAbortCount += 1;
              break;
            }

            await markSubdomainCleanupBackoff(db, row, cleanupStartedAt, error);
            retryScheduledCount += 1;
            logOperationalEvent("warn", "subdomains.cleanup.retry_scheduled", {
              subdomainId: row.id,
              domainId: row.domainId,
              rootDomain: row.rootDomain,
              subdomain: row.name,
              error: formatCleanupError(error),
            });
          }
        } else {
          await clearSubdomainCleanupState(db, row.id);
        }

        liveReferenceSkipCount += 1;
        continue;
      }

      const cleanupStartedAt = nowIso();
      await markSubdomainCleanupPending(db, row, cleanupStartedAt);

      try {
        const cleanupResult = await deleteSubdomainEmailRoutingDnsRecords(
          env,
          config,
          {
            rootDomain: row.rootDomain,
            zoneId: row.zoneId,
          },
          row.name,
          subdomainCleanupRequestSource,
          {
            beforeRequest: () => pacer.beforeRequest(),
            shouldContinue: () => pacer.hasTimeRemaining(),
          },
        );

        if (!cleanupResult.completed) {
          deadlineReached = true;
          break;
        }

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
            {
              beforeRequest: () => pacer.beforeRequest(),
            },
          );
          await clearSubdomainCleanupState(db, row.id, cleanupStartedAt);
          continue;
        }

        await db.delete(subdomains).where(eq(subdomains.id, row.id));
        cleanedCount += 1;
      } catch (error) {
        if (error instanceof CloudflareRequestExecutionAbortedError) {
          deadlineReached = true;
          break;
        }

        if (error instanceof ApiError && error.status === 429) {
          rateLimitAbortCount += 1;
          break;
        }

        await markSubdomainCleanupBackoff(db, row, cleanupStartedAt, error);
        retryScheduledCount += 1;
        logOperationalEvent("warn", "subdomains.cleanup.retry_scheduled", {
          subdomainId: row.id,
          domainId: row.domainId,
          rootDomain: row.rootDomain,
          subdomain: row.name,
          error: formatCleanupError(error),
        });
      }
    }

    logOperationalEvent("info", "subdomains.cleanup.completed", {
      candidateCount: pending.length,
      cleanedCount,
      retryScheduledCount,
      liveReferenceSkipCount,
      rateLimitAbortCount,
      deadlineReached,
      hostWindowLimit: config.SUBDOMAIN_CLEANUP_BATCH_SIZE,
      requestIntervalMs: subdomainCleanupRequestIntervalMs,
      runDeadlineMs: subdomainCleanupRunDeadlineMs,
    });

    return cleanedCount;
  } finally {
    await releaseRuntimeLease(env, subdomainCleanupLeaseKey, leaseOwner);
  }
};
