import {
  filterMailboxesForWorkspaceScope,
  generatedMailboxMaxAttempts,
  generateRealisticMailboxLocalPart,
  generateRealisticMailboxSubdomain,
  type mailboxListScopes,
  mailboxSchema,
} from "@kaisoumail/shared";
import { and, desc, eq, inArray, isNotNull, lte } from "drizzle-orm";

import { getDb } from "../db/client";
import {
  domains,
  mailboxes,
  messageAttachments,
  messageRecipients,
  messages,
  subdomains,
} from "../db/schema";
import type { RuntimeConfig, WorkerEnv } from "../env";
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
import type { AuthUser } from "../types";
import {
  type DomainRow,
  listActiveRootDomains,
  pickRandomActiveDomain,
  requireActiveDomainByRootDomain,
  resolveMailboxDomain,
} from "./domains";
import {
  createRoutingRule,
  deleteRoutingRule,
  ensureSubdomainEnabled,
} from "./emailRouting";

type MailboxRow = typeof mailboxes.$inferSelect;
type MailboxLookupRow = MailboxRow;
type MailboxRowWithRootDomain = MailboxRow & { rootDomain: string };
type MailboxListScope = (typeof mailboxListScopes)[number];

const longTermMailboxExpirySentinel = "9999-12-31T23:59:59.999Z";

const toMailboxApiExpiresAt = (expiresAt: string | null) =>
  expiresAt === longTermMailboxExpirySentinel ? null : expiresAt;

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
) =>
  mailboxSchema.parse({
    id: row.id,
    userId: row.userId,
    localPart: row.localPart,
    subdomain: row.subdomain,
    rootDomain: row.rootDomain,
    address: row.address,
    source: row.source,
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
) => {
  const rows = await listMailboxRowsForUser(env, user);
  if (scope !== "workspace") return rows;
  return filterMailboxesForWorkspaceScope(rows, nowIso());
};

export const classifyMailboxAddressState = (
  rows: MailboxLookupRow[],
  user: AuthUser,
) => {
  const visibleActive = rows.find(
    (row) => row.status === "active" && isVisibleMailbox(row, user),
  );
  if (visibleActive) {
    return {
      kind: "reuse" as const,
      row: visibleActive,
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
      source, routing_rule_id, status, created_at, expires_at, destroyed_at
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
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
    })
    .where(eq(mailboxes.id, mailboxId));
};

const activateMailbox = async (
  db: ReturnType<typeof getDb>,
  mailboxId: string,
) => {
  await db
    .update(mailboxes)
    .set({ status: "active" })
    .where(eq(mailboxes.id, mailboxId));
};

export const resolveRequestedMailboxAddress = (
  input:
    | { address: string; expiresInMinutes?: number | null }
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
  if (expiresInMinutes === undefined) {
    return fallbackExpiresAt;
  }
  if (expiresInMinutes === null) {
    return longTermMailboxExpirySentinel;
  }
  return new Date(Date.now() + expiresInMinutes * 60_000).toISOString();
};

const upsertSubdomainUsage = async (
  db: ReturnType<typeof getDb>,
  config: RuntimeConfig,
  domain: DomainRow,
  subdomain: string,
  now: string,
) => {
  const knownSubdomain = await db
    .select()
    .from(subdomains)
    .where(
      and(eq(subdomains.domainId, domain.id), eq(subdomains.name, subdomain)),
    )
    .limit(1);

  if (!knownSubdomain[0]) {
    await ensureSubdomainEnabled(config, domain, subdomain);
  }

  if (knownSubdomain[0]) {
    await db
      .update(subdomains)
      .set({ lastUsedAt: now })
      .where(eq(subdomains.id, knownSubdomain[0].id));
  } else {
    await db.insert(subdomains).values({
      id: randomId("sub"),
      domainId: domain.id,
      name: subdomain,
      enabledAt: now,
      lastUsedAt: now,
      metadata: JSON.stringify({
        mode: config.EMAIL_ROUTING_MANAGEMENT_ENABLED ? "live" : "disabled",
      }),
    });
  }
};

const promoteCatchAllMailbox = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  mailbox: MailboxRow,
  expiresInMinutes: number | null | undefined,
) => {
  const db = getDb(env);
  const domain = await resolveMailboxDomain(env, config, mailbox);
  if (!domain || domain.status !== "active" || domain.deletedAt) {
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

  await upsertSubdomainUsage(db, config, domain, mailbox.subdomain, now);

  const routingRuleId = await createRoutingRule(
    config,
    domain,
    mailbox.address,
  );
  if (!routingRuleId) {
    throw new ApiError(
      409,
      "Catch-all mailbox cannot be promoted without Email Routing management",
    );
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

  return rows.map((row) => ({
    ...row,
    rootDomain:
      (row.domainId ? domainMap.get(row.domainId) : null) ??
      getFallbackRootDomain(row),
  }));
};

const attachLastReceivedAt = async (env: WorkerEnv, rows: MailboxRow[]) => {
  if (rows.length === 0) return [];

  const db = getDb(env);
  const hydratedRows = await attachRootDomains(env, rows);
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
    toMailboxDto(row, recentMap.get(row.id) ?? null),
  );
};

export const listMailboxesForUser = async (
  env: WorkerEnv,
  user: AuthUser,
  scope: MailboxListScope = "default",
) => {
  const rows = await listScopedMailboxRowsForUser(env, user, scope);
  return attachLastReceivedAt(env, rows);
};

export const getMailboxForUser = async (
  env: WorkerEnv,
  user: AuthUser,
  mailboxId: string,
) => {
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
  const recentRows =
    row.status === "destroying"
      ? []
      : await db
          .select({ receivedAt: messages.receivedAt })
          .from(messages)
          .where(eq(messages.mailboxId, row.id))
          .orderBy(desc(messages.receivedAt))
          .limit(1);

  return toMailboxDto(hydrated, recentRows[0]?.receivedAt ?? null);
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
  },
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
      status: domains.status,
      zoneId: domains.zoneId,
      deletedAt: domains.deletedAt,
    })
    .from(domains)
    .where(eq(domains.id, domain.id))
    .limit(1);
  const currentDomain = currentDomainRows[0];
  if (
    !currentDomain ||
    currentDomain.status !== "active" ||
    currentDomain.deletedAt ||
    currentDomain.zoneId !== domain.zoneId
  ) {
    throw domainNoLongerAvailableError(domain.id, domain.rootDomain);
  }

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
      if (classification.row.source === "catch_all") {
        return promoteCatchAllMailbox(
          env,
          config,
          classification.row,
          expiresInMinutes,
        );
      }
      throw new ApiError(409, "Mailbox already exists");
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

        throw new ApiError(409, "Mailbox already exists");
      }

      throw error;
    }

    const classification = classifyMailboxAddressState(
      await listMailboxesByAddress(env, mailboxAddress.address),
      user,
    );
    if (classification.kind === "reuse") {
      if (classification.row.source === "catch_all") {
        return promoteCatchAllMailbox(
          env,
          config,
          classification.row,
          expiresInMinutes,
        );
      }
      throw new ApiError(409, "Mailbox already exists");
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

    const created = {
      id: randomId("mbx"),
      userId: user.id,
      domainId: domain.id,
      localPart,
      subdomain,
      address: mailboxAddress.address,
      source: "registered",
      routingRuleId: null,
      status: "destroying",
      createdAt: now,
      expiresAt,
      destroyedAt: null,
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

      await upsertSubdomainUsage(db, config, domain, subdomain, now);

      routingRuleId = await createRoutingRule(
        config,
        domain,
        mailboxAddress.address,
      );

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
          await deleteRoutingRule(config, domain, routingRuleId);
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

        throw new ApiError(409, "Mailbox already exists");
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
      },
) => {
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
        ),
        created: false,
      };
    }
    const [mailbox] = await attachLastReceivedAt(env, [classification.row]);
    return {
      mailbox,
      created: false,
    };
  }

  if (classification.kind === "conflict") {
    throw new ApiError(409, "Mailbox already exists");
  }

  const mailbox = await createMailboxForUser(env, config, user, {
    localPart: mailboxAddress.localPart,
    subdomain: mailboxAddress.subdomain,
    rootDomain: mailboxAddress.rootDomain,
    expiresInMinutes,
  });

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
        source, routing_rule_id, status, created_at, expires_at, destroyed_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
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
  if (mailbox.status === "destroyed") {
    return toMailboxDto({ ...mailbox, rootDomain }, null);
  }

  await db
    .update(mailboxes)
    .set({ status: "destroying" })
    .where(eq(mailboxes.id, mailbox.id));

  if (mailbox.routingRuleId) {
    const domain = await resolveMailboxDomain(env, config, mailbox);
    if (!domain) {
      throw new ApiError(500, "Mailbox domain not found for routing cleanup", {
        mailboxId: mailbox.id,
        address: mailbox.address,
      });
    }
    await deleteRoutingRule(config, domain, mailbox.routingRuleId);
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
    .set({ status: "destroyed", destroyedAt, routingRuleId: null })
    .where(eq(mailboxes.id, mailbox.id));

  return toMailboxDto(
    {
      ...mailbox,
      status: "destroyed",
      destroyedAt,
      routingRuleId: null,
      rootDomain,
    },
    null,
  );
};

export const listMailboxIdsPendingCleanup = async (
  env: WorkerEnv,
  config: RuntimeConfig,
) => {
  const db = getDb(env);
  const now = nowIso();
  const destroyingRows = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(eq(mailboxes.status, "destroying"))
    .orderBy(mailboxes.createdAt)
    .limit(config.CLEANUP_BATCH_SIZE);
  const shouldAlternateSingleSlotCleanup =
    config.CLEANUP_BATCH_SIZE === 1 && destroyingRows.length > 0;
  const reservedDestroyingCount =
    destroyingRows.length > 0 && config.CLEANUP_BATCH_SIZE > 1 ? 1 : 0;
  const activeRows = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(
      and(
        eq(mailboxes.status, "active"),
        isNotNull(mailboxes.expiresAt),
        lte(mailboxes.expiresAt, now),
      ),
    )
    .orderBy(mailboxes.expiresAt)
    .limit(Math.max(config.CLEANUP_BATCH_SIZE - reservedDestroyingCount, 0));
  if (shouldAlternateSingleSlotCleanup && activeRows.length > 0) {
    const shouldRetryDestroyingFirst =
      Math.floor(new Date(now).getTime() / (60 * 1000)) % 2 === 0;
    const selectedRow = shouldRetryDestroyingFirst
      ? destroyingRows[0]
      : activeRows[0];
    return selectedRow?.id ? [selectedRow.id] : [];
  }
  const additionalDestroyingRows = destroyingRows.slice(
    0,
    Math.max(config.CLEANUP_BATCH_SIZE - activeRows.length, 0),
  );

  return [...additionalDestroyingRows, ...activeRows]
    .filter((row) => row.id && row.id.length > 0)
    .map((row) => row.id);
};
