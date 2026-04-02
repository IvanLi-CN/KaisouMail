import { mailboxSchema } from "@cf-mail/shared";
import { and, desc, eq, inArray, lte } from "drizzle-orm";

import { getDb } from "../db/client";
import {
  mailboxes,
  messageAttachments,
  messageRecipients,
  messages,
  subdomains,
} from "../db/schema";
import type { RuntimeConfig, WorkerEnv } from "../env";
import { nowIso, randomId } from "../lib/crypto";
import { buildMailboxAddress, normalizeLabel, randomLabel } from "../lib/email";
import { ApiError } from "../lib/errors";
import type { AuthUser } from "../types";
import {
  createRoutingRule,
  deleteRoutingRule,
  ensureSubdomainEnabled,
} from "./emailRouting";

const toMailboxDto = (
  row: typeof mailboxes.$inferSelect,
  lastReceivedAt: string | null = null,
) =>
  mailboxSchema.parse({
    id: row.id,
    userId: row.userId,
    localPart: row.localPart,
    subdomain: row.subdomain,
    address: row.address,
    status: row.status,
    createdAt: row.createdAt,
    lastReceivedAt,
    expiresAt: row.expiresAt,
    destroyedAt: row.destroyedAt,
    routingRuleId: row.routingRuleId,
  });

const attachLastReceivedAt = async (
  env: WorkerEnv,
  rows: Array<typeof mailboxes.$inferSelect>,
) => {
  if (rows.length === 0) return [];

  const db = getDb(env);
  const recentMap = new Map<string, string | null>(
    rows.map((row) => [row.id, null]),
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
        rows.map((row) => row.id),
      ),
    )
    .orderBy(desc(messages.receivedAt));

  for (const recentRow of recentRows) {
    if (!recentMap.has(recentRow.mailboxId)) continue;
    if (!recentMap.get(recentRow.mailboxId)) {
      recentMap.set(recentRow.mailboxId, recentRow.receivedAt);
    }
  }

  return rows.map((row) => toMailboxDto(row, recentMap.get(row.id) ?? null));
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
  if (row.userId !== user.id && user.role !== "admin")
    throw new ApiError(403, "Forbidden");

  const recentRows = await db
    .select({ receivedAt: messages.receivedAt })
    .from(messages)
    .where(eq(messages.mailboxId, row.id))
    .orderBy(desc(messages.receivedAt))
    .limit(1);

  return toMailboxDto(row, recentRows[0]?.receivedAt ?? null);
};

export const createMailboxForUser = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  user: AuthUser,
  input: { localPart?: string; subdomain?: string; expiresInMinutes?: number },
) => {
  const db = getDb(env);
  const localPart = normalizeLabel(input.localPart ?? randomLabel("mail"));
  const subdomain = normalizeLabel(input.subdomain ?? randomLabel("box"));
  const expiresInMinutes =
    input.expiresInMinutes ?? config.DEFAULT_MAILBOX_TTL_MINUTES;
  const mailboxAddress = buildMailboxAddress(
    localPart,
    subdomain,
    config.MAIL_DOMAIN,
  );
  const knownSubdomain = await db
    .select()
    .from(subdomains)
    .where(eq(subdomains.name, subdomain))
    .limit(1);
  const existing = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.address, mailboxAddress.address))
    .limit(1);
  if (existing[0] && existing[0].status !== "destroyed")
    throw new ApiError(409, "Mailbox already exists");

  const now = nowIso();
  const expiresAt = new Date(
    Date.now() + expiresInMinutes * 60_000,
  ).toISOString();
  if (!knownSubdomain[0]) {
    await ensureSubdomainEnabled(config, subdomain);
  }
  const routingRuleId = await createRoutingRule(config, mailboxAddress.address);
  if (knownSubdomain[0]) {
    await db
      .update(subdomains)
      .set({ lastUsedAt: now })
      .where(eq(subdomains.id, knownSubdomain[0].id));
  } else {
    await db.insert(subdomains).values({
      id: randomId("sub"),
      name: subdomain,
      enabledAt: now,
      lastUsedAt: now,
      metadata: JSON.stringify({
        mode: config.EMAIL_ROUTING_MANAGEMENT_ENABLED ? "live" : "disabled",
      }),
    });
  }

  const id = randomId("mbx");
  const created = {
    id,
    userId: user.id,
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
  return toMailboxDto(created, null);
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
  if (actor && actor.role !== "admin" && actor.id !== mailbox.userId)
    throw new ApiError(403, "Forbidden");
  if (mailbox.status === "destroyed") return toMailboxDto(mailbox, null);

  await db
    .update(mailboxes)
    .set({ status: "destroying" })
    .where(eq(mailboxes.id, mailbox.id));
  if (mailbox.routingRuleId)
    await deleteRoutingRule(config, mailbox.routingRuleId);

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
