import { and, eq, ne } from "drizzle-orm";

import { getDb } from "../db/client";
import { mailboxes, subdomains } from "../db/schema";
import type { RuntimeConfig, WorkerEnv } from "../env";
import { nowIso } from "../lib/crypto";
import { ApiError } from "../lib/errors";
import { logOperationalEvent } from "../lib/observability";
import {
  deleteSubdomainEmailRoutingDnsRecords,
  ensureSubdomainEnabled,
  getCloudflareRequestCountFromError,
} from "./emailRouting";

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
const minimumCloudflareRequestsPerSubdomainAttempt = 2;

const formatCleanupError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const resolveNextCleanupAttemptAt = (now: string) =>
  new Date(Date.parse(now) + subdomainCleanupRetryDelayMs).toISOString();

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
  const db = getDb(env);
  const pending = await listSubdomainsPendingCleanup(env, config);
  let cleanedCount = 0;
  let requestBudgetUsed = 0;
  let retryScheduledCount = 0;
  let liveReferenceSkipCount = 0;
  let requestBudgetExhausted = false;

  for (const row of pending) {
    if (await hasLiveMailboxReference(env, row)) {
      if (row.cleanupNextAttemptAt || row.cleanupLastError) {
        if (requestBudgetUsed + 1 > config.SUBDOMAIN_CLEANUP_REQUEST_BUDGET) {
          requestBudgetExhausted = true;
          break;
        }

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
              onRequestAttempted: () => {
                requestBudgetUsed += 1;
              },
            },
          );
          await clearSubdomainCleanupState(db, row.id);
        } catch (error) {
          if (error instanceof ApiError && error.status === 429) {
            throw error;
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

    if (
      requestBudgetUsed + minimumCloudflareRequestsPerSubdomainAttempt >
      config.SUBDOMAIN_CLEANUP_REQUEST_BUDGET
    ) {
      requestBudgetExhausted = true;
      break;
    }

    const cleanupStartedAt = nowIso();

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
          requestBudget:
            config.SUBDOMAIN_CLEANUP_REQUEST_BUDGET - requestBudgetUsed - 1,
        },
      );
      requestBudgetUsed += cleanupResult.requestCount;

      if (!cleanupResult.completed) {
        await markSubdomainCleanupPending(db, row, cleanupStartedAt);
        requestBudgetExhausted = true;
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
            onRequestAttempted: () => {
              requestBudgetUsed += 1;
            },
          },
        );
        await clearSubdomainCleanupState(db, row.id, cleanupStartedAt);
        continue;
      }

      await db.delete(subdomains).where(eq(subdomains.id, row.id));
      cleanedCount += 1;
    } catch (error) {
      requestBudgetUsed += getCloudflareRequestCountFromError(error);

      if (error instanceof ApiError && error.status === 429) {
        throw error;
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
    requestBudgetUsed,
    requestBudgetLimit: config.SUBDOMAIN_CLEANUP_REQUEST_BUDGET,
    requestBudgetExhausted,
    hostBudgetLimit: config.SUBDOMAIN_CLEANUP_BATCH_SIZE,
  });

  return cleanedCount;
};
