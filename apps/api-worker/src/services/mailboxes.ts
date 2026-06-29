import {
  expiredMailboxRetentionHours,
  filterMailboxesForWorkspaceScope,
  generatedMailboxMaxAttempts,
  generateRealisticMailboxLocalPart,
  generateRealisticMailboxSubdomain,
  type mailboxCreatedVia,
  type mailboxListScopes,
  mailboxSchema,
  type mailboxStatuses,
  mailboxTagsSchema,
  mergeMailboxExpiryByExtension,
  resolveMailboxExpiresAtFromMinutes,
} from "@kaisoumail/shared";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
} from "drizzle-orm";

import { getDb } from "../db/client";
import {
  apiKeys,
  domains,
  mailboxes,
  messageAttachments,
  messageRecipients,
  messages,
  subdomains,
} from "../db/schema";
import type { RuntimeConfig, WorkerEnv } from "../env";
import {
  defaultMailboxCleanupAutorepairMinAgeMinutes,
  defaultMailboxCleanupRepairBatchSize,
} from "../env";
import { nowIso, randomId } from "../lib/crypto";
import { chunkD1InValues } from "../lib/d1-batches";
import {
  buildMailboxAddress,
  extractRootDomainFromAddress,
  normalizeLabel,
  normalizeMailboxAddress,
  normalizeRootDomain,
  parseMailboxAddressAgainstDomains,
} from "../lib/email";
import { ApiError } from "../lib/errors";
import { logOperationalEvent } from "../lib/observability";
import type { AuthContext, AuthUser } from "../types";
import { ensureMailboxSubdomainOnboardedForWildcardDns } from "./cloudflare-mailbox-dns";
import {
  type DomainRow,
  listActiveRootDomains,
  pickRandomActiveDomain,
  requireActiveDomainByRootDomain,
  resolveMailboxDomain,
  shouldRequireWildcardSubdomainDnsMigration,
  shouldUseWildcardSubdomainDnsForDomain,
} from "./domains";
import {
  type CloudflareRequestSource,
  createRoutingRule,
  deleteRoutingRule,
  ensureSubdomainEnabled,
} from "./emailRouting";

type MailboxRow = typeof mailboxes.$inferSelect;
type MailboxLookupRow = MailboxRow;
type MailboxCreatedVia = (typeof mailboxCreatedVia)[number];
type MailboxCreatedByApiKey = {
  id: string;
  name: string;
  prefix: string;
} | null;
type MailboxRowWithRootDomain = MailboxRow & {
  rootDomain: string;
  createdByApiKey: MailboxCreatedByApiKey;
};
type MailboxTagsByMailboxId = Map<string, string[]>;
type MailboxListScope = (typeof mailboxListScopes)[number];
type MailboxStatus = (typeof mailboxStatuses)[number];
type SubdomainProvisionMetadata = {
  mode: "explicit" | "wildcard";
  deliveryProvisioned: boolean;
};

const longTermMailboxExpirySentinel = "9999-12-31T23:59:59.999Z";
const expiredMailboxRetentionMs = expiredMailboxRetentionHours * 60 * 60 * 1000;
const mailboxCleanupRetryDelayMs = 60 * 60 * 1000;

const resolveExpiredMailboxCleanupCutoff = (now: string) =>
  new Date(new Date(now).getTime() - expiredMailboxRetentionMs).toISOString();

const resolveMailboxCleanupRetryAt = (now: string) =>
  new Date(Date.parse(now) + mailboxCleanupRetryDelayMs).toISOString();

const formatMailboxCleanupError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1000);

const resolveMailboxAutorepairCutoff = (
  config: Pick<RuntimeConfig, "MAILBOX_CLEANUP_AUTOREPAIR_MIN_AGE_MINUTES">,
  now: string,
) => {
  const minAgeMinutes =
    config.MAILBOX_CLEANUP_AUTOREPAIR_MIN_AGE_MINUTES ??
    defaultMailboxCleanupAutorepairMinAgeMinutes;
  return new Date(Date.parse(now) - minAgeMinutes * 60 * 1000).toISOString();
};

const isMailboxExpiredAt = (expiresAt: string | null, now: string) =>
  Boolean(
    expiresAt &&
      expiresAt !== longTermMailboxExpirySentinel &&
      expiresAt.localeCompare(now) <= 0,
  );

export const expireDueMailboxes = async (env: WorkerEnv, now = nowIso()) => {
  const db = getDb(env);
  await db
    .update(mailboxes)
    .set({ status: "expired" })
    .where(
      and(
        eq(mailboxes.status, "active"),
        isNotNull(mailboxes.expiresAt),
        lte(mailboxes.expiresAt, now),
      ),
    );
};

const mailboxRouteContexts = {
  create: {
    projectOperation: "mailboxes.create",
    projectRoute: "POST /api/mailboxes",
  },
  ensure: {
    projectOperation: "mailboxes.ensure",
    projectRoute: "POST /api/mailboxes/ensure",
  },
  destroy: {
    projectOperation: "mailboxes.destroy",
    projectRoute: "DELETE /api/mailboxes/:id",
  },
} satisfies Record<string, CloudflareRequestSource>;

const shouldUseCatchAllDelivery = (
  domain: Pick<DomainRow, "catchAllEnabled" | "catchAllOwnerUserId">,
) => Boolean(domain.catchAllEnabled && domain.catchAllOwnerUserId);

const parseSubdomainProvisionMetadata = (
  value: string | null,
): SubdomainProvisionMetadata => {
  if (!value) {
    return {
      mode: "explicit",
      deliveryProvisioned: false,
    };
  }

  try {
    const parsed = JSON.parse(value) as {
      mode?: unknown;
      deliveryProvisioned?: unknown;
    };
    const mode = parsed.mode === "wildcard" ? "wildcard" : "explicit";
    return {
      mode,
      deliveryProvisioned:
        parsed.deliveryProvisioned === true ||
        (mode === "explicit" && parsed.deliveryProvisioned !== false),
    };
  } catch {
    return {
      mode: "explicit",
      deliveryProvisioned: false,
    };
  }
};

const buildSubdomainProvisionMetadata = (
  mode: "explicit" | "wildcard",
  options?: { deliveryProvisioned?: boolean },
) =>
  JSON.stringify({
    mode,
    deliveryProvisioned: options?.deliveryProvisioned ?? true,
  });

const buildWildcardMigrationRequiredError = (
  domain: Pick<
    DomainRow,
    | "id"
    | "rootDomain"
    | "subdomainDnsMode"
    | "wildcardDnsVerifiedAt"
    | "wildcardDnsLastError"
  >,
) =>
  new ApiError(
    409,
    "Catch-all domain must finish wildcard DNS migration before mailbox writes can continue",
    {
      domainId: domain.id,
      rootDomain: domain.rootDomain,
      subdomainDnsMode: domain.subdomainDnsMode,
      wildcardDnsVerifiedAt: domain.wildcardDnsVerifiedAt,
      wildcardDnsLastError: domain.wildcardDnsLastError,
    },
  );

const toMailboxApiExpiresAt = (expiresAt: string | null) =>
  expiresAt === longTermMailboxExpirySentinel ? null : expiresAt;

const toMailboxStorageExpiresAt = (expiresAt: string | null | undefined) => {
  if (expiresAt === undefined) return undefined;
  return expiresAt === null ? longTermMailboxExpirySentinel : expiresAt;
};

const parseMailboxTags = (tagsJson: string | null | undefined) => {
  if (!tagsJson) return [];
  try {
    return mailboxTagsSchema.parse(JSON.parse(tagsJson));
  } catch {
    return [];
  }
};

const serializeMailboxTags = (tags: string[] | undefined) =>
  JSON.stringify(mailboxTagsSchema.parse(tags ?? []));

const normalizeMailboxTags = (tags: string[] | undefined) =>
  mailboxTagsSchema.parse(tags ?? []);

const canUseRawD1 = (
  env: WorkerEnv,
): env is WorkerEnv & {
  DB: {
    prepare: (query: string) => {
      bind: (...values: unknown[]) => {
        run?: () => Promise<unknown>;
        all?: <T = unknown>() => Promise<{ results?: T[] }>;
      };
    };
  };
} =>
  Boolean(
    (env as { DB?: { prepare?: unknown } }).DB &&
      typeof (env as { DB?: { prepare?: unknown } }).DB?.prepare === "function",
  );

const syncMailboxTagTables = async (
  env: WorkerEnv,
  input: {
    mailboxId: string;
    userId: string;
    tags: string[];
    now?: string;
  },
) => {
  if (!canUseRawD1(env)) return;

  const timestamp = input.now ?? nowIso();
  const deleteStatement = env.DB.prepare(
    "DELETE FROM mailbox_tags WHERE mailbox_id = ?",
  ).bind(input.mailboxId);
  if (typeof deleteStatement.run !== "function") return;

  await deleteStatement.run();

  for (const tag of input.tags) {
    const tagId = randomId("tag");
    const upsertTagStatement = env.DB.prepare(
      `INSERT INTO tags (id, user_id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, name) DO UPDATE SET updated_at = excluded.updated_at`,
    ).bind(tagId, input.userId, tag, timestamp, timestamp);
    if (typeof upsertTagStatement.run !== "function") return;
    await upsertTagStatement.run();

    const linkStatement = env.DB.prepare(
      `INSERT OR IGNORE INTO mailbox_tags (mailbox_id, tag_id, created_at)
       SELECT ?, id, ?
       FROM tags
       WHERE user_id = ? AND name = ?`,
    ).bind(input.mailboxId, timestamp, input.userId, tag);
    if (typeof linkStatement.run !== "function") return;
    await linkStatement.run();
  }
};

const loadMailboxTagsFromTables = async (
  env: WorkerEnv,
  mailboxIds: string[],
): Promise<MailboxTagsByMailboxId | null> => {
  if (!canUseRawD1(env) || mailboxIds.length === 0) return null;

  const tagsByMailboxId: MailboxTagsByMailboxId = new Map(
    mailboxIds.map((mailboxId) => [mailboxId, []]),
  );

  try {
    for (const mailboxIdChunk of chunkD1InValues(mailboxIds)) {
      const placeholders = mailboxIdChunk.map(() => "?").join(",");
      const statement = env.DB.prepare(
        `SELECT mailbox_tags.mailbox_id AS mailboxId, tags.name AS tag
         FROM mailbox_tags
         INNER JOIN tags ON tags.id = mailbox_tags.tag_id
         WHERE mailbox_tags.mailbox_id IN (${placeholders})
         ORDER BY mailbox_tags.created_at ASC, tags.name ASC`,
      ).bind(...mailboxIdChunk);
      if (typeof statement.all !== "function") return null;
      const result = await statement.all<{ mailboxId: string; tag: string }>();

      for (const row of result.results ?? []) {
        const mailboxTags = tagsByMailboxId.get(row.mailboxId);
        if (!mailboxTags) continue;
        mailboxTags.push(row.tag);
      }
    }
  } catch {
    return null;
  }

  return tagsByMailboxId;
};

const listMailboxIdsMatchingTags = async (
  env: WorkerEnv,
  mailboxIds: string[],
  tags: string[],
) => {
  if (!canUseRawD1(env) || mailboxIds.length === 0 || tags.length === 0) {
    return null;
  }

  const matchingMailboxIds = new Set<string>();

  try {
    for (const mailboxIdChunk of chunkD1InValues(mailboxIds)) {
      const mailboxPlaceholders = mailboxIdChunk.map(() => "?").join(",");
      const tagPlaceholders = tags.map(() => "?").join(",");
      const statement = env.DB.prepare(
        `SELECT mailbox_tags.mailbox_id AS mailboxId
         FROM mailbox_tags
         INNER JOIN tags ON tags.id = mailbox_tags.tag_id
         WHERE mailbox_tags.mailbox_id IN (${mailboxPlaceholders})
           AND tags.name IN (${tagPlaceholders})
         GROUP BY mailbox_tags.mailbox_id
         HAVING COUNT(DISTINCT tags.name) = ?`,
      ).bind(...mailboxIdChunk, ...tags, tags.length);
      if (typeof statement.all !== "function") return null;
      const result = await statement.all<{ mailboxId: string }>();

      for (const row of result.results ?? []) {
        matchingMailboxIds.add(row.mailboxId);
      }
    }
  } catch {
    return null;
  }

  return matchingMailboxIds;
};

const resolveCreationAttribution = (authContext?: AuthContext) => {
  if (authContext?.method === "api_key") {
    return {
      createdVia: "api_key" satisfies MailboxCreatedVia,
      createdByApiKeyId: authContext.apiKey.id,
    };
  }

  if (authContext?.method === "web") {
    return {
      createdVia: "web" satisfies MailboxCreatedVia,
      createdByApiKeyId: null,
    };
  }

  return {
    createdVia: "unknown" satisfies MailboxCreatedVia,
    createdByApiKeyId: null,
  };
};

const getFallbackRootDomain = (row: MailboxRow) => {
  const extracted = extractRootDomainFromAddress(row.address, row.subdomain);
  if (extracted) return extracted;
  throw new ApiError(500, "Mailbox root domain could not be resolved", {
    mailboxId: row.id,
    address: row.address,
  });
};

const toMailboxDto = (
  row: MailboxRowWithRootDomain,
  lastReceivedAt: string | null = null,
  tagsByMailboxId?: MailboxTagsByMailboxId | null,
) =>
  mailboxSchema.parse({
    id: row.id,
    userId: row.userId,
    localPart: row.localPart,
    subdomain: row.subdomain,
    mailDomain: row.rootDomain,
    rootDomain: row.rootDomain,
    address: row.address,
    source: row.source,
    createdVia: row.createdVia ?? "unknown",
    createdByApiKey: row.createdByApiKey,
    tags:
      tagsByMailboxId?.get(row.id) ?? parseMailboxTags(row.tagsJson ?? "[]"),
    status: row.status,
    createdAt: row.createdAt,
    lastReceivedAt,
    expiresAt: toMailboxApiExpiresAt(row.expiresAt),
    destroyedAt: row.destroyedAt,
    routingRuleId: row.routingRuleId,
  });

const isVisibleMailbox = (row: MailboxLookupRow, user: AuthUser) =>
  user.role === "admin" || row.userId === user.id;

const listMailboxRowsForUser = async (env: WorkerEnv, user: AuthUser) => {
  const db = getDb(env);
  return user.role === "admin"
    ? db.select().from(mailboxes).orderBy(desc(mailboxes.createdAt))
    : db
        .select()
        .from(mailboxes)
        .where(eq(mailboxes.userId, user.id))
        .orderBy(desc(mailboxes.createdAt));
};

export const listScopedMailboxRowsForUser = async (
  env: WorkerEnv,
  user: AuthUser,
  scope: MailboxListScope = "default",
  statuses?: MailboxStatus[],
  tags?: string[],
) => {
  await expireDueMailboxes(env);
  const rows = await listMailboxRowsForUser(env, user);
  const scopedRows =
    scope === "workspace"
      ? filterMailboxesForWorkspaceScope(rows, nowIso())
      : rows;
  const normalizedTags = normalizeMailboxTags(tags);
  const tagSet = new Set(normalizedTags);
  const tagFilteredRows =
    tagSet.size === 0
      ? scopedRows
      : await (async () => {
          const matchingMailboxIds = await listMailboxIdsMatchingTags(
            env,
            scopedRows.map((row) => row.id),
            normalizedTags,
          );
          if (matchingMailboxIds) {
            return scopedRows.filter((row) => matchingMailboxIds.has(row.id));
          }

          return scopedRows.filter((row) => {
            const mailboxTags = new Set(parseMailboxTags(row.tagsJson ?? "[]"));
            return [...tagSet].every((tag) => mailboxTags.has(tag));
          });
        })();

  if (!statuses || statuses.length === 0) return tagFilteredRows;

  const statusSet = new Set(statuses);
  return tagFilteredRows.filter((row) =>
    statusSet.has(row.status as MailboxStatus),
  );
};

export const classifyMailboxAddressState = (
  rows: MailboxLookupRow[],
  user: AuthUser,
) => {
  const reusable = rows.find(
    (row) =>
      (row.status === "active" || row.status === "expired") &&
      isVisibleMailbox(row, user),
  );
  if (reusable) {
    return {
      kind: "reuse" as const,
      row: reusable,
    };
  }

  const blocking = rows.find((row) => row.status !== "destroyed");
  if (blocking) {
    return {
      kind: "conflict" as const,
      row: blocking,
    };
  }

  return {
    kind: "create" as const,
  };
};

const listMailboxesByAddress = async (env: WorkerEnv, address: string) => {
  const db = getDb(env);
  return db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.address, normalizeMailboxAddress(address)))
    .orderBy(desc(mailboxes.createdAt));
};

const getActiveMailboxByAddress = async (
  db: ReturnType<typeof getDb>,
  address: string,
) => {
  const rows = await db
    .select()
    .from(mailboxes)
    .where(
      and(
        eq(mailboxes.address, normalizeMailboxAddress(address)),
        eq(mailboxes.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
};

const ensureAddressAvailable = async (env: WorkerEnv, address: string) => {
  const rows = await listMailboxesByAddress(env, address);
  if (rows.some((row) => row.status !== "destroyed")) {
    throw new ApiError(409, "Mailbox already exists");
  }
};

const buildVisibleMailboxExistsError = async (
  env: WorkerEnv,
  row: MailboxRow,
) => {
  const [mailbox] = await attachLastReceivedAt(env, [row]);
  return new ApiError(409, "Mailbox already exists", {
    code: "mailbox_exists",
    mailbox,
  });
};

const buildMailboxExistsErrorForAddress = async (
  env: WorkerEnv,
  user: AuthUser,
  address: string,
) => {
  const classification = classifyMailboxAddressState(
    await listMailboxesByAddress(env, address),
    user,
  );

  if (classification.kind === "reuse") {
    return buildVisibleMailboxExistsError(env, classification.row);
  }

  return new ApiError(409, "Mailbox already exists");
};

const domainNoLongerAvailableError = (domainId: string, rootDomain: string) =>
  new ApiError(409, "Mailbox domain is no longer available", {
    domainId,
    rootDomain,
  });

const isMailboxAddressConflictError = (error: unknown) => {
  if (
    error instanceof ApiError &&
    error.status === 409 &&
    error.message === "Mailbox already exists"
  ) {
    return true;
  }

  if (!(error instanceof Error)) return false;

  return (
    error.message.includes("UNIQUE constraint failed: mailboxes.address") ||
    error.message.includes("mailboxes_address_unique")
  );
};

const resolveCreateMailboxAddress = async ({
  env,
  localPart,
  subdomain,
  rootDomain,
  attempt = 0,
}: {
  env: WorkerEnv;
  localPart?: string;
  subdomain?: string;
  rootDomain: string;
  attempt?: number;
}) => {
  const normalizedLocalPart = localPart ? normalizeLabel(localPart) : undefined;
  const normalizedSubdomain = subdomain ? normalizeLabel(subdomain) : undefined;
  const nextLocalPart =
    normalizedLocalPart ??
    generateRealisticMailboxLocalPart({
      attempt,
    });
  const nextSubdomain =
    normalizedSubdomain ??
    generateRealisticMailboxSubdomain({
      attempt,
    });
  const mailboxAddress = buildMailboxAddress(
    nextLocalPart,
    nextSubdomain,
    rootDomain,
  );

  await ensureAddressAvailable(env, mailboxAddress.address);
  return mailboxAddress;
};

const insertMailboxIfDomainStillActive = async (
  env: WorkerEnv,
  created: {
    id: string;
    userId: string;
    domainId: string;
    localPart: string;
    subdomain: string;
    address: string;
    source: string;
    createdVia: string;
    createdByApiKeyId: string | null;
    tagsJson: string;
    routingRuleId: string | null;
    status: string;
    createdAt: string;
    expiresAt: string | null;
    destroyedAt: string | null;
  },
  expectedZoneId: string | null,
  rootDomain: string,
) => {
  const result = await env.DB.prepare(
    `INSERT INTO mailboxes (
      id, user_id, domain_id, local_part, subdomain, address,
      source, created_via, created_by_api_key_id, tags_json,
      routing_rule_id, status, created_at, expires_at, destroyed_at
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1
      FROM domains
      WHERE id = ?
        AND status = 'active'
        AND deleted_at IS NULL
        AND zone_id IS ?
    )`,
  )
    .bind(
      created.id,
      created.userId,
      created.domainId,
      created.localPart,
      created.subdomain,
      created.address,
      created.source,
      created.createdVia,
      created.createdByApiKeyId,
      created.tagsJson,
      created.routingRuleId,
      created.status,
      created.createdAt,
      created.expiresAt,
      created.destroyedAt,
      created.domainId,
      expectedZoneId,
    )
    .run();

  if ((result.meta?.changes ?? 0) !== 1) {
    throw domainNoLongerAvailableError(created.domainId, rootDomain);
  }
};

const rollbackMailboxInsert = async (
  db: ReturnType<typeof getDb>,
  mailboxId: string,
) => {
  await db.delete(mailboxes).where(eq(mailboxes.id, mailboxId));
};

const updateMailboxRoutingRule = async (
  db: ReturnType<typeof getDb>,
  mailboxId: string,
  routingRuleId: string | null,
) => {
  await db
    .update(mailboxes)
    .set({ routingRuleId })
    .where(eq(mailboxes.id, mailboxId));
};

const updateMailboxRegistration = async (
  db: ReturnType<typeof getDb>,
  mailboxId: string,
  values: {
    source: string;
    routingRuleId: string | null;
    expiresAt: string | null;
  },
) => {
  await db
    .update(mailboxes)
    .set({
      source: values.source,
      routingRuleId: values.routingRuleId,
      expiresAt: values.expiresAt,
      status: "active",
      destroyedAt: null,
      cleanupNextAttemptAt: null,
      cleanupLastError: null,
    })
    .where(eq(mailboxes.id, mailboxId));
};

const updateMailboxExpiry = async (
  db: ReturnType<typeof getDb>,
  mailboxId: string,
  expiresAt: string,
  status?: MailboxStatus,
) => {
  await db
    .update(mailboxes)
    .set(status ? { expiresAt, status } : { expiresAt })
    .where(eq(mailboxes.id, mailboxId));
};

const activateMailbox = async (
  db: ReturnType<typeof getDb>,
  mailboxId: string,
) => {
  await db
    .update(mailboxes)
    .set({
      status: "active",
      cleanupNextAttemptAt: null,
      cleanupLastError: null,
    })
    .where(eq(mailboxes.id, mailboxId));
};

const markMailboxCleanupBackoff = async (
  db: ReturnType<typeof getDb>,
  mailboxId: string,
  now: string,
  error: unknown,
) => {
  const nextAttemptAt = resolveMailboxCleanupRetryAt(now);
  const cleanupLastError = formatMailboxCleanupError(error);
  await db
    .update(mailboxes)
    .set({
      cleanupNextAttemptAt: nextAttemptAt,
      cleanupLastError,
    })
    .where(eq(mailboxes.id, mailboxId));

  logOperationalEvent("warn", "mailboxes.cleanup.retry_scheduled", {
    mailboxId,
    nextAttemptAt,
    error: cleanupLastError,
  });
};

export const resolveRequestedMailboxAddress = (
  input:
    | { address: string; expiresInMinutes?: number | null; tags?: string[] }
    | {
        localPart: string;
        subdomain: string;
        rootDomain?: string;
        expiresInMinutes?: number | null;
      },
  activeRootDomains: string[],
) => {
  if ("address" in input) {
    const parsed = parseMailboxAddressAgainstDomains(
      input.address,
      activeRootDomains,
    );
    if (!parsed) {
      throw new ApiError(400, "Invalid mailbox address", {
        address: input.address,
        activeRootDomains,
      });
    }
    return parsed;
  }

  const rootDomain = input.rootDomain
    ? normalizeRootDomain(input.rootDomain)
    : activeRootDomains[Math.floor(Math.random() * activeRootDomains.length)];
  if (!rootDomain) {
    throw new ApiError(400, "No mailbox domains are enabled");
  }

  return buildMailboxAddress(
    normalizeLabel(input.localPart),
    normalizeLabel(input.subdomain),
    rootDomain,
  );
};

const resolveMailboxExpiresAt = (
  expiresInMinutes: number | null | undefined,
  fallbackExpiresAt: string | null,
) => {
  const resolved = mergeMailboxExpiryByExtension({
    currentExpiresAt: toMailboxApiExpiresAt(fallbackExpiresAt),
    requestedExpiresInMinutes: expiresInMinutes,
  });
  return toMailboxStorageExpiresAt(resolved.expiresAt) ?? fallbackExpiresAt;
};

const upsertSubdomainUsage = async (
  env: WorkerEnv,
  db: ReturnType<typeof getDb>,
  config: RuntimeConfig,
  domain: DomainRow,
  subdomain: string,
  now: string,
  requestSource: CloudflareRequestSource,
) => {
  const useWildcardSubdomainDns =
    shouldUseWildcardSubdomainDnsForDomain(domain);

  if (
    !useWildcardSubdomainDns &&
    shouldRequireWildcardSubdomainDnsMigration(config, domain)
  ) {
    throw buildWildcardMigrationRequiredError(domain);
  }

  const knownSubdomain = await db
    .select()
    .from(subdomains)
    .where(
      and(eq(subdomains.domainId, domain.id), eq(subdomains.name, subdomain)),
    )
    .limit(1);

  const existingSubdomain = knownSubdomain[0];
  const shouldRepairKnownSubdomain = Boolean(
    existingSubdomain?.cleanupNextAttemptAt ||
      existingSubdomain?.cleanupLastError,
  );
  const existingSubdomainMetadata = parseSubdomainProvisionMetadata(
    existingSubdomain?.metadata ?? null,
  );

  if (useWildcardSubdomainDns) {
    if (
      !existingSubdomain ||
      shouldRepairKnownSubdomain ||
      !existingSubdomainMetadata.deliveryProvisioned
    ) {
      await ensureMailboxSubdomainOnboardedForWildcardDns(
        env,
        config,
        domain,
        subdomain,
        requestSource,
      );
    }
  } else if (!existingSubdomain || shouldRepairKnownSubdomain) {
    await ensureSubdomainEnabled(env, config, domain, subdomain, requestSource);
  }

  if (existingSubdomain) {
    await db
      .update(subdomains)
      .set({
        lastUsedAt: now,
        cleanupNextAttemptAt: null,
        cleanupLastError: null,
        metadata: buildSubdomainProvisionMetadata(
          useWildcardSubdomainDns ? "wildcard" : "explicit",
        ),
      })
      .where(eq(subdomains.id, existingSubdomain.id));
  } else {
    await db.insert(subdomains).values({
      id: randomId("sub"),
      domainId: domain.id,
      name: subdomain,
      enabledAt: now,
      lastUsedAt: now,
      cleanupNextAttemptAt: null,
      cleanupLastError: null,
      metadata: buildSubdomainProvisionMetadata(
        useWildcardSubdomainDns ? "wildcard" : "explicit",
      ),
    });
  }
};

const ensureMailboxRoutingRule = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domain: DomainRow,
  mailbox: Pick<MailboxRow, "address">,
  requestSource: CloudflareRequestSource,
) => createRoutingRule(env, config, domain, mailbox.address, requestSource);

const promoteCatchAllMailbox = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  mailbox: MailboxRow,
  expiresInMinutes: number | null | undefined,
  requestSource: CloudflareRequestSource,
) => {
  const db = getDb(env);
  const domain = await resolveMailboxDomain(env, config, mailbox);
  if (domain?.status !== "active" || domain.deletedAt) {
    throw domainNoLongerAvailableError(
      mailbox.domainId ?? "legacy-domain",
      getFallbackRootDomain(mailbox),
    );
  }

  const now = nowIso();
  const expiresAt = resolveMailboxExpiresAt(
    expiresInMinutes,
    mailbox.expiresAt,
  );

  await upsertSubdomainUsage(
    env,
    db,
    config,
    domain,
    mailbox.subdomain,
    now,
    requestSource,
  );

  let routingRuleId: string | null = null;
  if (!shouldUseCatchAllDelivery(domain)) {
    routingRuleId = await ensureMailboxRoutingRule(
      env,
      config,
      domain,
      mailbox,
      requestSource,
    );
    if (!routingRuleId) {
      throw new ApiError(
        409,
        "Catch-all mailbox cannot be promoted without Email Routing management",
      );
    }
  }

  await updateMailboxRegistration(db, mailbox.id, {
    source: "registered",
    routingRuleId,
    expiresAt,
  });

  const [promoted] = await attachLastReceivedAt(env, [
    {
      ...mailbox,
      source: "registered",
      routingRuleId,
      expiresAt,
      status: "active",
      destroyedAt: null,
    },
  ]);

  return promoted;
};

const extendExistingMailboxExpiry = async (
  env: WorkerEnv,
  mailbox: MailboxRow,
  expiresInMinutes: number | null | undefined,
) => {
  const db = getDb(env);
  const resolved = mergeMailboxExpiryByExtension({
    currentExpiresAt: toMailboxApiExpiresAt(mailbox.expiresAt),
    requestedExpiresInMinutes: expiresInMinutes,
  });

  if (!resolved.changed) {
    const [currentMailbox] = await attachLastReceivedAt(env, [mailbox]);
    return currentMailbox;
  }

  const nextExpiresAt = toMailboxStorageExpiresAt(resolved.expiresAt);
  if (!nextExpiresAt) {
    const [currentMailbox] = await attachLastReceivedAt(env, [mailbox]);
    return currentMailbox;
  }

  const nextStatus: MailboxStatus = isMailboxExpiredAt(nextExpiresAt, nowIso())
    ? "expired"
    : "active";
  await updateMailboxExpiry(db, mailbox.id, nextExpiresAt, nextStatus);
  const [updatedMailbox] = await attachLastReceivedAt(env, [
    {
      ...mailbox,
      expiresAt: nextExpiresAt,
      status: nextStatus,
    },
  ]);
  return updatedMailbox;
};

const attachRootDomains = async (
  env: WorkerEnv,
  rows: MailboxRow[],
): Promise<MailboxRowWithRootDomain[]> => {
  if (rows.length === 0) return [];

  const db = getDb(env);
  const domainIds = [
    ...new Set(
      rows
        .map((row) => row.domainId)
        .filter((domainId): domainId is string => Boolean(domainId)),
    ),
  ];
  const domainMap = new Map<string, string>();
  const apiKeyIds = [
    ...new Set(
      rows
        .map((row) => row.createdByApiKeyId)
        .filter((keyId): keyId is string => Boolean(keyId)),
    ),
  ];
  const apiKeyMap = new Map<string, NonNullable<MailboxCreatedByApiKey>>();

  if (domainIds.length > 0) {
    for (const domainIdChunk of chunkD1InValues(domainIds)) {
      const domainRows = await db
        .select({
          id: domains.id,
          rootDomain: domains.rootDomain,
        })
        .from(domains)
        .where(inArray(domains.id, domainIdChunk));

      for (const domainRow of domainRows) {
        domainMap.set(domainRow.id, domainRow.rootDomain);
      }
    }
  }

  if (apiKeyIds.length > 0) {
    for (const apiKeyIdChunk of chunkD1InValues(apiKeyIds)) {
      const keyRows = await db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          prefix: apiKeys.prefix,
        })
        .from(apiKeys)
        .where(inArray(apiKeys.id, apiKeyIdChunk));

      for (const keyRow of keyRows) {
        apiKeyMap.set(keyRow.id, keyRow);
      }
    }
  }

  return rows.map((row) => ({
    ...row,
    rootDomain:
      (row.domainId ? domainMap.get(row.domainId) : null) ??
      getFallbackRootDomain(row),
    createdByApiKey: row.createdByApiKeyId
      ? (apiKeyMap.get(row.createdByApiKeyId) ?? null)
      : null,
  }));
};

const attachLastReceivedAt = async (env: WorkerEnv, rows: MailboxRow[]) => {
  if (rows.length === 0) return [];

  const db = getDb(env);
  const hydratedRows = await attachRootDomains(env, rows);
  const tagsByMailboxId = await loadMailboxTagsFromTables(
    env,
    hydratedRows.map((row) => row.id),
  );
  const recentMap = new Map<string, string | null>(
    hydratedRows.map((row) => [row.id, null]),
  );
  const mailboxIds = hydratedRows
    .filter((row) => row.status !== "destroying")
    .map((row) => row.id);

  for (const mailboxIdChunk of chunkD1InValues(mailboxIds)) {
    const recentRows = await db
      .select({
        mailboxId: messages.mailboxId,
        receivedAt: messages.receivedAt,
      })
      .from(messages)
      .where(inArray(messages.mailboxId, mailboxIdChunk))
      .orderBy(desc(messages.receivedAt));

    for (const recentRow of recentRows) {
      if (!recentMap.has(recentRow.mailboxId)) continue;
      if (!recentMap.get(recentRow.mailboxId)) {
        recentMap.set(recentRow.mailboxId, recentRow.receivedAt);
      }
    }
  }

  return hydratedRows.map((row) =>
    toMailboxDto(row, recentMap.get(row.id) ?? null, tagsByMailboxId),
  );
};

export const listMailboxesForUser = async (
  env: WorkerEnv,
  user: AuthUser,
  scope: MailboxListScope = "default",
  statuses?: MailboxStatus[],
  tags?: string[],
) => {
  const rows = await listScopedMailboxRowsForUser(
    env,
    user,
    scope,
    statuses,
    tags,
  );
  return attachLastReceivedAt(env, rows);
};

export const getMailboxForUser = async (
  env: WorkerEnv,
  user: AuthUser,
  mailboxId: string,
) => {
  await expireDueMailboxes(env);
  const db = getDb(env);
  const rows = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.id, mailboxId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ApiError(404, "Mailbox not found");
  if (row.userId !== user.id && user.role !== "admin") {
    throw new ApiError(403, "Forbidden");
  }

  const [hydrated] = await attachRootDomains(env, [row]);
  const tagsByMailboxId = await loadMailboxTagsFromTables(env, [row.id]);
  const recentRows =
    row.status === "destroying"
      ? []
      : await db
          .select({ receivedAt: messages.receivedAt })
          .from(messages)
          .where(eq(messages.mailboxId, row.id))
          .orderBy(desc(messages.receivedAt))
          .limit(1);

  return toMailboxDto(
    hydrated,
    recentRows[0]?.receivedAt ?? null,
    tagsByMailboxId,
  );
};

export const createMailboxForUser = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  user: AuthUser,
  input: {
    localPart?: string;
    subdomain?: string;
    rootDomain?: string;
    expiresInMinutes?: number | null;
    tags?: string[];
  },
  authContext?: AuthContext,
) => {
  const db = getDb(env);
  const domain = input.rootDomain
    ? await requireActiveDomainByRootDomain(env, input.rootDomain)
    : await pickRandomActiveDomain(env);
  const expiresInMinutes =
    input.expiresInMinutes === undefined
      ? config.DEFAULT_MAILBOX_TTL_MINUTES
      : input.expiresInMinutes;
  const canRetryGeneratedAddress = !input.localPart || !input.subdomain;

  const currentDomainRows = await db
    .select({
      id: domains.id,
      rootDomain: domains.rootDomain,
      status: domains.status,
      zoneId: domains.zoneId,
      deletedAt: domains.deletedAt,
      catchAllEnabled: domains.catchAllEnabled,
      catchAllOwnerUserId: domains.catchAllOwnerUserId,
      subdomainDnsMode: domains.subdomainDnsMode,
      wildcardDnsVerifiedAt: domains.wildcardDnsVerifiedAt,
      wildcardDnsLastError: domains.wildcardDnsLastError,
    })
    .from(domains)
    .where(eq(domains.id, domain.id))
    .limit(1);
  const currentDomain = currentDomainRows[0];
  if (
    currentDomain?.status !== "active" ||
    currentDomain.deletedAt ||
    currentDomain.zoneId !== domain.zoneId
  ) {
    throw domainNoLongerAvailableError(domain.id, domain.rootDomain);
  }

  const deliveryDomain = {
    ...domain,
    catchAllEnabled: currentDomain.catchAllEnabled,
    catchAllOwnerUserId: currentDomain.catchAllOwnerUserId,
    subdomainDnsMode: currentDomain.subdomainDnsMode,
    wildcardDnsVerifiedAt: currentDomain.wildcardDnsVerifiedAt,
    wildcardDnsLastError: currentDomain.wildcardDnsLastError,
  } satisfies DomainRow;

  if (input.localPart && input.subdomain) {
    const explicitAddress = buildMailboxAddress(
      normalizeLabel(input.localPart),
      normalizeLabel(input.subdomain),
      domain.rootDomain,
    );
    const classification = classifyMailboxAddressState(
      await listMailboxesByAddress(env, explicitAddress.address),
      user,
    );

    if (classification.kind === "reuse") {
      throw await buildVisibleMailboxExistsError(env, classification.row);
    }

    if (classification.kind === "conflict") {
      throw new ApiError(409, "Mailbox already exists");
    }
  }

  for (let attempt = 0; attempt < generatedMailboxMaxAttempts; attempt += 1) {
    let mailboxAddress: Awaited<ReturnType<typeof resolveCreateMailboxAddress>>;
    try {
      mailboxAddress = await resolveCreateMailboxAddress({
        env,
        localPart: input.localPart,
        subdomain: input.subdomain,
        rootDomain: domain.rootDomain,
        attempt,
      });
    } catch (error) {
      if (isMailboxAddressConflictError(error)) {
        if (
          canRetryGeneratedAddress &&
          attempt < generatedMailboxMaxAttempts - 1
        ) {
          continue;
        }

        if (input.localPart && input.subdomain) {
          throw await buildMailboxExistsErrorForAddress(
            env,
            user,
            buildMailboxAddress(
              normalizeLabel(input.localPart),
              normalizeLabel(input.subdomain),
              domain.rootDomain,
            ).address,
          );
        }

        throw new ApiError(409, "Mailbox already exists");
      }

      throw error;
    }

    const classification = classifyMailboxAddressState(
      await listMailboxesByAddress(env, mailboxAddress.address),
      user,
    );
    if (classification.kind === "reuse") {
      throw await buildVisibleMailboxExistsError(env, classification.row);
    }
    if (classification.kind === "conflict") {
      throw new ApiError(409, "Mailbox already exists");
    }

    const { localPart, subdomain } = mailboxAddress;

    const now = nowIso();
    const expiresAt =
      expiresInMinutes === null
        ? longTermMailboxExpirySentinel
        : new Date(Date.now() + expiresInMinutes * 60_000).toISOString();
    const attribution = resolveCreationAttribution(authContext);
    const normalizedTags = normalizeMailboxTags(input.tags);

    const created = {
      id: randomId("mbx"),
      userId: user.id,
      domainId: domain.id,
      localPart,
      subdomain,
      address: mailboxAddress.address,
      source: "registered",
      createdVia: attribution.createdVia,
      createdByApiKeyId: attribution.createdByApiKeyId,
      tagsJson: serializeMailboxTags(normalizedTags),
      routingRuleId: null,
      status: "destroying",
      createdAt: now,
      expiresAt,
      destroyedAt: null,
      cleanupNextAttemptAt: null,
      cleanupLastError: null,
    } as const;

    let mailboxInserted = false;
    let routingRuleId: string | null = null;
    try {
      await insertMailboxIfDomainStillActive(
        env,
        created,
        domain.zoneId,
        domain.rootDomain,
      );
      mailboxInserted = true;
      await syncMailboxTagTables(env, {
        mailboxId: created.id,
        userId: created.userId,
        tags: normalizedTags,
        now,
      });

      await upsertSubdomainUsage(
        env,
        db,
        config,
        deliveryDomain,
        subdomain,
        now,
        mailboxRouteContexts.create,
      );

      if (!shouldUseCatchAllDelivery(deliveryDomain)) {
        routingRuleId = await ensureMailboxRoutingRule(
          env,
          config,
          deliveryDomain,
          { subdomain, address: mailboxAddress.address } as Pick<
            MailboxRow,
            "subdomain" | "address"
          >,
          mailboxRouteContexts.create,
        );
      }

      if (routingRuleId) {
        await updateMailboxRoutingRule(db, created.id, routingRuleId);
      }

      await activateMailbox(db, created.id);

      return toMailboxDto(
        {
          ...created,
          status: "active",
          routingRuleId,
          rootDomain: domain.rootDomain,
          createdByApiKey:
            authContext?.method === "api_key" ? authContext.apiKey : null,
        },
        null,
      );
    } catch (error) {
      let rollbackError: unknown = null;
      if (mailboxInserted) {
        try {
          await rollbackMailboxInsert(db, created.id);
        } catch (cleanupError) {
          rollbackError = cleanupError;
        }
      }

      if (routingRuleId) {
        try {
          await deleteRoutingRule(
            env,
            config,
            deliveryDomain,
            routingRuleId,
            mailboxRouteContexts.create,
          );
        } catch {
          // Ignore cleanup failures here; the primary error is the mailbox
          // creation race or write failure that caused the insert to abort.
        }
      }

      if (rollbackError) {
        throw new ApiError(
          502,
          "Failed to roll back mailbox after subdomain persistence failure",
          {
            mailboxId: created.id,
            address: created.address,
            cause: error instanceof Error ? error.message : String(error),
            rollbackError:
              rollbackError instanceof Error
                ? rollbackError.message
                : String(rollbackError),
          },
        );
      }

      if (isMailboxAddressConflictError(error)) {
        if (
          canRetryGeneratedAddress &&
          attempt < generatedMailboxMaxAttempts - 1
        ) {
          continue;
        }

        throw await buildMailboxExistsErrorForAddress(
          env,
          user,
          created.address,
        );
      }

      throw error;
    }
  }

  throw new ApiError(409, "Mailbox already exists");
};

export const ensureMailboxForUser = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  user: AuthUser,
  input:
    | { address: string; expiresInMinutes?: number | null }
    | {
        localPart: string;
        subdomain: string;
        rootDomain?: string;
        expiresInMinutes?: number | null;
        tags?: string[];
      },
  authContext?: AuthContext,
) => {
  await expireDueMailboxes(env);
  const activeRootDomains = await listActiveRootDomains(env);
  const expiresInMinutes =
    input.expiresInMinutes === undefined
      ? config.DEFAULT_MAILBOX_TTL_MINUTES
      : input.expiresInMinutes;
  const mailboxAddress =
    "address" in input
      ? resolveRequestedMailboxAddress(input, activeRootDomains)
      : resolveRequestedMailboxAddress(input, activeRootDomains);

  const classification = classifyMailboxAddressState(
    await listMailboxesByAddress(env, mailboxAddress.address),
    user,
  );

  if (classification.kind === "reuse") {
    if (classification.row.source === "catch_all") {
      return {
        mailbox: await promoteCatchAllMailbox(
          env,
          config,
          classification.row,
          expiresInMinutes,
          mailboxRouteContexts.ensure,
        ),
        created: false,
      };
    }
    return {
      mailbox: await extendExistingMailboxExpiry(
        env,
        classification.row,
        expiresInMinutes,
      ),
      created: false,
    };
  }

  if (classification.kind === "conflict") {
    throw new ApiError(409, "Mailbox already exists");
  }

  const mailbox = await createMailboxForUser(
    env,
    config,
    user,
    {
      localPart: mailboxAddress.localPart,
      subdomain: mailboxAddress.subdomain,
      rootDomain: mailboxAddress.rootDomain,
      expiresInMinutes,
      ...("tags" in input ? { tags: input.tags } : {}),
    },
    authContext,
  );

  return {
    mailbox,
    created: true,
  };
};

export const resolveMailboxForUser = async (
  env: WorkerEnv,
  user: AuthUser,
  address: string,
) => {
  await expireDueMailboxes(env);
  const classification = classifyMailboxAddressState(
    await listMailboxesByAddress(env, normalizeMailboxAddress(address)),
    user,
  );
  if (classification.kind !== "reuse") {
    throw new ApiError(404, "Mailbox not found");
  }

  const [resolved] = await attachLastReceivedAt(env, [classification.row]);
  return resolved;
};

export const resetMailboxTtlForUser = async (
  env: WorkerEnv,
  user: AuthUser,
  mailboxId: string,
  input: { expiresInMinutes: number | null },
) => {
  await expireDueMailboxes(env);
  const db = getDb(env);
  const rows = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.id, mailboxId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ApiError(404, "Mailbox not found");
  if (!isVisibleMailbox(row, user)) {
    throw new ApiError(403, "Forbidden");
  }
  if (row.source !== "registered" || row.status !== "active") {
    throw new ApiError(
      409,
      "Mailbox TTL can only be reset for active registered mailboxes",
      {
        mailboxId,
        source: row.source,
        status: row.status,
      },
    );
  }

  const resolvedExpiresAt = resolveMailboxExpiresAtFromMinutes(
    input.expiresInMinutes,
  );
  const nextExpiresAt = toMailboxStorageExpiresAt(resolvedExpiresAt);
  if (!nextExpiresAt) {
    throw new ApiError(400, "Invalid mailbox TTL");
  }

  await updateMailboxExpiry(db, row.id, nextExpiresAt, "active");
  const [updatedMailbox] = await attachLastReceivedAt(env, [
    {
      ...row,
      expiresAt: nextExpiresAt,
      status: "active",
    },
  ]);
  return updatedMailbox;
};

export const updateMailboxTagsForUser = async (
  env: WorkerEnv,
  user: AuthUser,
  mailboxId: string,
  input: { tags: string[] },
) => {
  await expireDueMailboxes(env);
  const db = getDb(env);
  const rows = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.id, mailboxId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ApiError(404, "Mailbox not found");
  if (!isVisibleMailbox(row, user)) {
    throw new ApiError(403, "Forbidden");
  }

  const normalizedTags = normalizeMailboxTags(input.tags);
  const tagsJson = serializeMailboxTags(normalizedTags);
  await db.update(mailboxes).set({ tagsJson }).where(eq(mailboxes.id, row.id));
  await syncMailboxTagTables(env, {
    mailboxId: row.id,
    userId: row.userId,
    tags: normalizedTags,
  });
  const [updatedMailbox] = await attachLastReceivedAt(env, [
    {
      ...row,
      tagsJson,
    },
  ]);
  return updatedMailbox;
};

export const ensureCatchAllMailboxForAddress = async (
  env: WorkerEnv,
  domain: DomainRow,
  address: string,
) => {
  if (!domain.catchAllEnabled || !domain.catchAllOwnerUserId) {
    return null;
  }

  const db = getDb(env);
  const normalizedAddress = normalizeMailboxAddress(address);
  const existing = await getActiveMailboxByAddress(db, normalizedAddress);
  if (existing) {
    return existing;
  }

  const parsed = parseMailboxAddressAgainstDomains(normalizedAddress, [
    domain.rootDomain,
  ]);
  if (!parsed) {
    return null;
  }

  const created = {
    id: randomId("mbx"),
    userId: domain.catchAllOwnerUserId,
    domainId: domain.id,
    localPart: parsed.localPart,
    subdomain: parsed.subdomain,
    address: parsed.address,
    source: "catch_all",
    createdVia: "system",
    createdByApiKeyId: null,
    tagsJson: serializeMailboxTags(undefined),
    routingRuleId: null,
    status: "active",
    createdAt: nowIso(),
    expiresAt: null,
    destroyedAt: null,
  } as const;

  try {
    const result = await env.DB.prepare(
      `INSERT INTO mailboxes (
        id, user_id, domain_id, local_part, subdomain, address,
        source, created_via, created_by_api_key_id, tags_json,
        routing_rule_id, status, created_at, expires_at, destroyed_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1
        FROM domains
        WHERE id = ?
          AND status = 'active'
          AND deleted_at IS NULL
          AND catch_all_enabled = 1
          AND catch_all_owner_user_id = ?
      )`,
    )
      .bind(
        created.id,
        created.userId,
        created.domainId,
        created.localPart,
        created.subdomain,
        created.address,
        created.source,
        created.createdVia,
        created.createdByApiKeyId,
        created.tagsJson,
        created.routingRuleId,
        created.status,
        created.createdAt,
        created.expiresAt,
        created.destroyedAt,
        domain.id,
        domain.catchAllOwnerUserId,
      )
      .run();

    if ((result.meta?.changes ?? 0) !== 1) {
      return getActiveMailboxByAddress(db, normalizedAddress);
    }

    const inserted = await getActiveMailboxByAddress(db, normalizedAddress);
    return inserted;
  } catch (error) {
    if (isMailboxAddressConflictError(error)) {
      return getActiveMailboxByAddress(db, normalizedAddress);
    }
    throw error;
  }
};

export const destroyMailbox = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  mailboxId: string,
  actor?: AuthUser,
) => {
  const db = getDb(env);
  const mailboxRows = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.id, mailboxId))
    .limit(1);
  const mailbox = mailboxRows[0];
  if (!mailbox) throw new ApiError(404, "Mailbox not found");
  if (actor && actor.role !== "admin" && actor.id !== mailbox.userId) {
    throw new ApiError(403, "Forbidden");
  }

  const rootDomain = getFallbackRootDomain(mailbox);
  const dtoBase = {
    ...mailbox,
    rootDomain,
    createdByApiKey: null,
  };
  if (mailbox.status === "destroyed") {
    return toMailboxDto(dtoBase, null);
  }

  await db
    .update(mailboxes)
    .set({
      status: "destroying",
      cleanupNextAttemptAt: null,
      cleanupLastError: null,
    })
    .where(eq(mailboxes.id, mailbox.id));

  try {
    if (mailbox.routingRuleId) {
      const domain = await resolveMailboxDomain(env, config, mailbox);
      if (!domain) {
        throw new ApiError(
          500,
          "Mailbox domain not found for routing cleanup",
          {
            mailboxId: mailbox.id,
            address: mailbox.address,
          },
        );
      }
      await deleteRoutingRule(
        env,
        config,
        domain,
        mailbox.routingRuleId,
        mailboxRouteContexts.destroy,
      );
    }

    const relatedMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.mailboxId, mailbox.id));
    const messageIds = relatedMessages.map((message) => message.id);
    for (const message of relatedMessages) {
      await env.MAIL_BUCKET.delete(message.rawR2Key);
      await env.MAIL_BUCKET.delete(message.parsedR2Key);
    }
    if (messageIds.length > 0) {
      for (const messageIdChunk of chunkD1InValues(messageIds)) {
        await db
          .delete(messageAttachments)
          .where(inArray(messageAttachments.messageId, messageIdChunk));
        await db
          .delete(messageRecipients)
          .where(inArray(messageRecipients.messageId, messageIdChunk));
      }
    }
    await db.delete(messages).where(eq(messages.mailboxId, mailbox.id));
    const destroyedAt = nowIso();
    await db
      .update(mailboxes)
      .set({
        status: "destroyed",
        destroyedAt,
        routingRuleId: null,
        cleanupNextAttemptAt: null,
        cleanupLastError: null,
      })
      .where(eq(mailboxes.id, mailbox.id));

    return toMailboxDto(
      {
        ...dtoBase,
        status: "destroyed",
        destroyedAt,
        routingRuleId: null,
      },
      null,
    );
  } catch (error) {
    try {
      await markMailboxCleanupBackoff(db, mailbox.id, nowIso(), error);
    } catch (backoffError) {
      logOperationalEvent("error", "mailboxes.cleanup.backoff_failed", {
        mailboxId: mailbox.id,
        cleanupError: formatMailboxCleanupError(error),
        backoffError: formatMailboxCleanupError(backoffError),
      });
    }
    throw error;
  }
};

export const listMailboxIdsPendingCleanup = async (
  env: WorkerEnv,
  config: RuntimeConfig,
) => {
  const db = getDb(env);
  const now = nowIso();
  await expireDueMailboxes(env, now);
  const expiredCleanupCutoff = resolveExpiredMailboxCleanupCutoff(now);
  const destroyingRows = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(
      and(
        eq(mailboxes.status, "destroying"),
        or(
          isNull(mailboxes.cleanupNextAttemptAt),
          lte(mailboxes.cleanupNextAttemptAt, now),
        ),
      ),
    )
    .orderBy(mailboxes.createdAt)
    .limit(config.CLEANUP_BATCH_SIZE);
  const shouldAlternateSingleSlotCleanup =
    config.CLEANUP_BATCH_SIZE === 1 && destroyingRows.length > 0;
  const reservedDestroyingCount =
    destroyingRows.length > 0 && config.CLEANUP_BATCH_SIZE > 1 ? 1 : 0;
  const expiredRows = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(
      and(
        eq(mailboxes.status, "expired"),
        isNotNull(mailboxes.expiresAt),
        lte(mailboxes.expiresAt, expiredCleanupCutoff),
      ),
    )
    .orderBy(mailboxes.expiresAt)
    .limit(Math.max(config.CLEANUP_BATCH_SIZE - reservedDestroyingCount, 0));
  if (shouldAlternateSingleSlotCleanup && expiredRows.length > 0) {
    const shouldRetryDestroyingFirst =
      Math.floor(new Date(now).getTime() / (60 * 1000)) % 2 === 0;
    const selectedRow = shouldRetryDestroyingFirst
      ? destroyingRows[0]
      : expiredRows[0];
    return selectedRow?.id ? [selectedRow.id] : [];
  }
  const additionalDestroyingRows = destroyingRows.slice(
    0,
    Math.max(config.CLEANUP_BATCH_SIZE - expiredRows.length, 0),
  );

  return [...additionalDestroyingRows, ...expiredRows]
    .filter((row) => row.id && row.id.length > 0)
    .map((row) => row.id);
};

export const autorepairStaleDestroyingMailboxes = async (
  env: WorkerEnv,
  config: Pick<
    RuntimeConfig,
    | "MAILBOX_CLEANUP_AUTOREPAIR_MIN_AGE_MINUTES"
    | "MAILBOX_CLEANUP_REPAIR_BATCH_SIZE"
  >,
  now = nowIso(),
) => {
  const repairBatchSize =
    config.MAILBOX_CLEANUP_REPAIR_BATCH_SIZE ??
    defaultMailboxCleanupRepairBatchSize;
  if (repairBatchSize === 0) return 0;

  const cutoff = resolveMailboxAutorepairCutoff(config, now);
  const rows = await env.DB.prepare(
    `SELECT m.id
    FROM mailboxes m
    WHERE m.status = 'destroying'
      AND m.routing_rule_id IS NULL
      AND m.created_at <= ?
      AND NOT EXISTS (
        SELECT 1
        FROM messages msg
        WHERE msg.mailbox_id = m.id
      )
    ORDER BY m.created_at
    LIMIT ?`,
  )
    .bind(cutoff, repairBatchSize)
    .all<{ id: string }>();
  const mailboxIds = (rows.results ?? [])
    .map((row) => row.id)
    .filter((id) => id.length > 0);
  if (mailboxIds.length === 0) return 0;

  let repairedCount = 0;
  for (const mailboxIdChunk of chunkD1InValues(mailboxIds)) {
    const placeholders = mailboxIdChunk.map(() => "?").join(",");
    const result = await env.DB.prepare(
      `UPDATE mailboxes
      SET status = 'destroyed',
          destroyed_at = ?,
          routing_rule_id = NULL,
          cleanup_next_attempt_at = NULL,
          cleanup_last_error = NULL
      WHERE id IN (${placeholders})
        AND status = 'destroying'
        AND routing_rule_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM messages msg
          WHERE msg.mailbox_id = mailboxes.id
        )`,
    )
      .bind(now, ...mailboxIdChunk)
      .run();
    repairedCount += result.meta?.changes ?? 0;
  }

  if (repairedCount > 0) {
    logOperationalEvent("info", "mailboxes.cleanup.autorepaired", {
      repairedCount,
      selectedCount: mailboxIds.length,
      cutoff,
    });
  }

  return repairedCount;
};
