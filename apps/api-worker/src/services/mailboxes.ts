import { mailboxSchema } from "@cf-mail/shared";
import { and, desc, eq, inArray, lte } from "drizzle-orm";

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
import {
  buildMailboxAddress,
  extractRootDomainFromAddress,
  normalizeLabel,
  normalizeMailboxAddress,
  normalizeRootDomain,
  parseMailboxAddressAgainstDomains,
  randomLabel,
} from "../lib/email";
import { ApiError } from "../lib/errors";
import type { AuthUser } from "../types";
import {
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
    status: row.status,
    createdAt: row.createdAt,
    lastReceivedAt,
    expiresAt: row.expiresAt,
    destroyedAt: row.destroyedAt,
    routingRuleId: row.routingRuleId,
  });

const isVisibleMailbox = (row: MailboxLookupRow, user: AuthUser) =>
  user.role === "admin" || row.userId === user.id;

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

const ensureAddressAvailable = async (env: WorkerEnv, address: string) => {
  const rows = await listMailboxesByAddress(env, address);
  if (rows.some((row) => row.status !== "destroyed")) {
    throw new ApiError(409, "Mailbox already exists");
  }
};

export const resolveRequestedMailboxAddress = (
  input:
    | { address: string; expiresInMinutes?: number }
    | {
        localPart: string;
        subdomain: string;
        rootDomain?: string;
        expiresInMinutes?: number;
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
    const domainRows = await db
      .select({
        id: domains.id,
        rootDomain: domains.rootDomain,
      })
      .from(domains)
      .where(inArray(domains.id, domainIds));

    for (const domainRow of domainRows) {
      domainMap.set(domainRow.id, domainRow.rootDomain);
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
  const recentRows = await db
    .select({
      mailboxId: messages.mailboxId,
      receivedAt: messages.receivedAt,
    })
    .from(messages)
    .where(
      inArray(
        messages.mailboxId,
        hydratedRows.map((row) => row.id),
      ),
    )
    .orderBy(desc(messages.receivedAt));

  for (const recentRow of recentRows) {
    if (!recentMap.has(recentRow.mailboxId)) continue;
    if (!recentMap.get(recentRow.mailboxId)) {
      recentMap.set(recentRow.mailboxId, recentRow.receivedAt);
    }
  }

  return hydratedRows.map((row) =>
    toMailboxDto(row, recentMap.get(row.id) ?? null),
  );
};

export const listMailboxesForUser = async (env: WorkerEnv, user: AuthUser) => {
  const db = getDb(env);
  const rows =
    user.role === "admin"
      ? await db.select().from(mailboxes).orderBy(desc(mailboxes.createdAt))
      : await db
          .select()
          .from(mailboxes)
          .where(eq(mailboxes.userId, user.id))
          .orderBy(desc(mailboxes.createdAt));

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
  const recentRows = await db
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
    expiresInMinutes?: number;
  },
) => {
  const db = getDb(env);
  const domain = input.rootDomain
    ? await requireActiveDomainByRootDomain(env, input.rootDomain)
    : await pickRandomActiveDomain(env);
  const localPart = normalizeLabel(input.localPart ?? randomLabel("mail"));
  const subdomain = normalizeLabel(input.subdomain ?? randomLabel("box"));
  const expiresInMinutes =
    input.expiresInMinutes ?? config.DEFAULT_MAILBOX_TTL_MINUTES;
  const mailboxAddress = buildMailboxAddress(
    localPart,
    subdomain,
    domain.rootDomain,
  );

  const knownSubdomain = await db
    .select()
    .from(subdomains)
    .where(
      and(eq(subdomains.domainId, domain.id), eq(subdomains.name, subdomain)),
    )
    .limit(1);

  await ensureAddressAvailable(env, mailboxAddress.address);

  const now = nowIso();
  const expiresAt = new Date(
    Date.now() + expiresInMinutes * 60_000,
  ).toISOString();

  if (!knownSubdomain[0]) {
    await ensureSubdomainEnabled(config, domain, subdomain);
  }
  const routingRuleId = await createRoutingRule(
    config,
    domain,
    mailboxAddress.address,
  );

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

  const created = {
    id: randomId("mbx"),
    userId: user.id,
    domainId: domain.id,
    localPart,
    subdomain,
    address: mailboxAddress.address,
    routingRuleId,
    status: "active",
    createdAt: now,
    expiresAt,
    destroyedAt: null,
  } as const;

  await db.insert(mailboxes).values(created);
  return toMailboxDto(
    {
      ...created,
      rootDomain: domain.rootDomain,
    },
    null,
  );
};

export const ensureMailboxForUser = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  user: AuthUser,
  input:
    | { address: string; expiresInMinutes?: number }
    | {
        localPart: string;
        subdomain: string;
        rootDomain?: string;
        expiresInMinutes?: number;
      },
) => {
  const activeRootDomains = await listActiveRootDomains(env);
  const mailboxAddress =
    "address" in input
      ? resolveRequestedMailboxAddress(input, activeRootDomains)
      : resolveRequestedMailboxAddress(input, activeRootDomains);

  const classification = classifyMailboxAddressState(
    await listMailboxesByAddress(env, mailboxAddress.address),
    user,
  );

  if (classification.kind === "reuse") {
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
    expiresInMinutes: input.expiresInMinutes,
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
  for (const message of relatedMessages) {
    await env.MAIL_BUCKET.delete(message.rawR2Key);
    await env.MAIL_BUCKET.delete(message.parsedR2Key);
  }

  const messageIds = relatedMessages.map((message) => message.id);
  if (messageIds.length > 0) {
    await db
      .delete(messageAttachments)
      .where(inArray(messageAttachments.messageId, messageIds));
    await db
      .delete(messageRecipients)
      .where(inArray(messageRecipients.messageId, messageIds));
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

export const listExpiredMailboxIds = async (
  env: WorkerEnv,
  config: RuntimeConfig,
) => {
  const db = getDb(env);
  const now = nowIso();
  const rows = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(and(eq(mailboxes.status, "active"), lte(mailboxes.expiresAt, now)))
    .orderBy(mailboxes.expiresAt)
    .limit(config.CLEANUP_BATCH_SIZE);

  return rows.filter((row) => row.id && row.id.length > 0).map((row) => row.id);
};
