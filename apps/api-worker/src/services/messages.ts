import {
  type mailboxListScopes,
  messageDetailSchema,
  messageSummarySchema,
} from "@kaisoumail/shared";
import type { SQLWrapper } from "drizzle-orm";
import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";
import PostalMime from "postal-mime";

import { getDb } from "../db/client";
import {
  mailboxes,
  messageAttachments,
  messageRecipients,
  messages,
} from "../db/schema";
import type { WorkerEnv } from "../env";
import { nowIso, randomId } from "../lib/crypto";
import { chunkD1InsertValues, chunkD1InValues } from "../lib/d1-batches";
import {
  extractPreviewText,
  normalizeMailboxAddress,
  resolveDisposition,
} from "../lib/email";
import { ApiError } from "../lib/errors";
import type { AuthUser } from "../types";
import { resolveCatchAllDomainForAddress } from "./domains";
import {
  ensureCatchAllMailboxForAddress,
  listScopedMailboxRowsForUser,
} from "./mailboxes";
import {
  createRetryableVerificationFallback,
  resolveNextVerificationRetryAtIso,
  resolveVerificationDetectionForMessage,
  type StoredVerification,
} from "./message-verification";

type MailboxListScope = (typeof mailboxListScopes)[number];

const normalizePeople = (value: unknown) => {
  if (!value) return [] as Array<{ name: string | null; address: string }>;
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as { name?: string; address?: string };
      if (!candidate.address) return null;
      return { name: candidate.name ?? null, address: candidate.address };
    })
    .filter((entry): entry is { name: string | null; address: string } =>
      Boolean(entry),
    );
};

const mapVerification = (row: typeof messages.$inferSelect) => {
  if (
    !row.verificationCode ||
    !row.verificationSource ||
    !row.verificationMethod
  ) {
    return null;
  }

  return {
    code: row.verificationCode,
    source: row.verificationSource,
    method: row.verificationMethod,
  } as StoredVerification;
};

const mapSummary = (row: typeof messages.$inferSelect) =>
  messageSummarySchema.parse({
    id: row.id,
    mailboxId: row.mailboxId,
    mailboxAddress: row.mailboxAddress,
    subject: row.subject,
    previewText: row.previewText,
    fromName: row.fromName,
    fromAddress: row.fromAddress,
    receivedAt: row.receivedAt,
    sizeBytes: row.sizeBytes,
    attachmentCount: row.attachmentCount,
    hasHtml: row.hasHtml,
    verification: mapVerification(row),
  });

const visibleMessageMailboxFilter = ne(mailboxes.status, "destroying");

const buildMessageFilters = (filters: SQLWrapper[], extraFilter?: SQLWrapper) =>
  and(
    ...(extraFilter ? [...filters, extraFilter] : filters),
    visibleMessageMailboxFilter,
  );

const queryMessageRows = async (
  db: ReturnType<typeof getDb>,
  filters: SQLWrapper[],
  extraFilter?: SQLWrapper,
) => {
  const rows = await db
    .select({ message: messages })
    .from(messages)
    .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
    .where(buildMessageFilters(filters, extraFilter))
    .orderBy(desc(messages.receivedAt));

  return rows.map((row) => row.message);
};

const getReadableMessageRow = async (
  db: ReturnType<typeof getDb>,
  messageId: string,
) => {
  const rows = await db
    .select({
      message: messages,
      mailboxStatus: mailboxes.status,
    })
    .from(messages)
    .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
    .where(eq(messages.id, messageId))
    .limit(1);
  const row = rows[0];
  if (!row || row.mailboxStatus === "destroying") {
    throw new ApiError(404, "Message not found");
  }
  return row.message;
};

export const resolveReceivedAfter = (input: {
  after?: string;
  since?: string;
}) => {
  const candidates = [input.after, input.since]
    .map((value) => {
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    })
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));

  return candidates.at(-1) ?? null;
};

export const listMessagesForUser = async (
  env: WorkerEnv,
  user: AuthUser,
  mailboxAddresses: string[],
  mailboxIds: string[],
  after?: string | null,
  scope: MailboxListScope = "default",
) => {
  const db = getDb(env);
  const normalizedMailboxIds = [...new Set(mailboxIds)];
  const normalizedMailboxAddresses = [
    ...new Set(
      mailboxAddresses.map((address) => normalizeMailboxAddress(address)),
    ),
  ];
  const scopedMailboxRows =
    scope === "workspace"
      ? await listScopedMailboxRowsForUser(env, user, "workspace")
      : null;
  const candidateMailboxIds =
    scopedMailboxRows === null
      ? []
      : normalizedMailboxIds.length > 0
        ? scopedMailboxRows
            .filter((mailbox) => normalizedMailboxIds.includes(mailbox.id))
            .map((mailbox) => mailbox.id)
        : normalizedMailboxAddresses.length > 0
          ? scopedMailboxRows
              .filter((mailbox) =>
                normalizedMailboxAddresses.includes(mailbox.address),
              )
              .map((mailbox) => mailbox.id)
          : scopedMailboxRows.map((mailbox) => mailbox.id);
  if (
    (normalizedMailboxIds.length > 0 ||
      normalizedMailboxAddresses.length > 0 ||
      scope === "workspace") &&
    (scope === "workspace"
      ? candidateMailboxIds.length === 0
      : normalizedMailboxIds.length === 0 &&
        normalizedMailboxAddresses.length === 0)
  ) {
    return [];
  }
  const filters: SQLWrapper[] = [];
  if (user.role !== "admin") {
    filters.push(eq(messages.userId, user.id));
  }
  if (after) {
    filters.push(gt(messages.receivedAt, after));
  }

  const rows =
    scope === "workspace" && candidateMailboxIds.length > 0
      ? (
          await Promise.all(
            chunkD1InValues(candidateMailboxIds).map((mailboxIdChunk) =>
              queryMessageRows(
                db,
                filters,
                inArray(messages.mailboxId, mailboxIdChunk),
              ),
            ),
          )
        )
          .flat()
          .sort((left, right) =>
            right.receivedAt.localeCompare(left.receivedAt),
          )
      : normalizedMailboxIds.length > 0
        ? (
            await Promise.all(
              chunkD1InValues(normalizedMailboxIds).map((mailboxIdChunk) =>
                queryMessageRows(
                  db,
                  filters,
                  inArray(messages.mailboxId, mailboxIdChunk),
                ),
              ),
            )
          )
            .flat()
            .sort((left, right) =>
              right.receivedAt.localeCompare(left.receivedAt),
            )
        : normalizedMailboxAddresses.length > 0
          ? (
              await Promise.all(
                chunkD1InValues(normalizedMailboxAddresses).map(
                  (mailboxAddressChunk) =>
                    queryMessageRows(
                      db,
                      filters,
                      inArray(messages.mailboxAddress, mailboxAddressChunk),
                    ),
                ),
              )
            )
              .flat()
              .sort((left, right) =>
                right.receivedAt.localeCompare(left.receivedAt),
              )
          : await queryMessageRows(db, filters);
  return rows.map(mapSummary);
};

export const getMessageDetailForUser = async (
  env: WorkerEnv,
  user: AuthUser,
  messageId: string,
) => {
  const db = getDb(env);
  const message = await getReadableMessageRow(db, messageId);
  if (message.userId !== user.id && user.role !== "admin")
    throw new ApiError(403, "Forbidden");
  const parsedObject = await env.MAIL_BUCKET.get(message.parsedR2Key);
  if (!parsedObject) throw new ApiError(404, "Parsed message not found");
  const parsedPayload = JSON.parse(await parsedObject.text()) as {
    html: string | null;
    text: string | null;
    headers: Array<{ key: string; value: string }>;
  };
  const recipientsRows = await db
    .select()
    .from(messageRecipients)
    .where(eq(messageRecipients.messageId, message.id));
  const attachmentsRows = await db
    .select()
    .from(messageAttachments)
    .where(eq(messageAttachments.messageId, message.id));

  return messageDetailSchema.parse({
    ...mapSummary(message),
    envelopeFrom: message.envelopeFrom,
    envelopeTo: message.envelopeTo,
    messageId: message.messageIdHeader,
    dateHeader: message.dateHeader,
    html: parsedPayload.html,
    text: parsedPayload.text,
    headers: parsedPayload.headers,
    recipients: {
      to: recipientsRows.filter((row) => row.kind === "to"),
      cc: recipientsRows.filter((row) => row.kind === "cc"),
      bcc: recipientsRows.filter((row) => row.kind === "bcc"),
      replyTo: recipientsRows.filter((row) => row.kind === "replyTo"),
    },
    attachments: attachmentsRows.map((row) => ({
      id: row.id,
      filename: row.filename,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      contentId: row.contentId,
      disposition: row.disposition,
    })),
    rawDownloadPath: `/api/messages/${message.id}/raw`,
  });
};

export const getRawMessageResponseForUser = async (
  env: WorkerEnv,
  user: AuthUser,
  messageId: string,
) => {
  const db = getDb(env);
  const message = await getReadableMessageRow(db, messageId);
  if (message.userId !== user.id && user.role !== "admin")
    throw new ApiError(403, "Forbidden");
  const object = await env.MAIL_BUCKET.get(message.rawR2Key);
  if (!object) throw new ApiError(404, "Raw message not found");
  return new Response(object.body, {
    headers: {
      "content-type": "message/rfc822",
      "content-disposition": `attachment; filename="${message.id}.eml"`,
    },
  });
};

export const storeIncomingMessage = async (
  env: WorkerEnv,
  forwardable: ForwardableEmailMessage,
) => {
  const db = getDb(env);
  const normalizedEnvelopeTo = normalizeMailboxAddress(forwardable.to);
  const mailboxRows = await db
    .select()
    .from(mailboxes)
    .where(
      and(
        eq(mailboxes.address, normalizedEnvelopeTo),
        eq(mailboxes.status, "active"),
      ),
    )
    .limit(1);
  let mailbox: typeof mailboxes.$inferSelect | null = mailboxRows[0] ?? null;
  if (!mailbox) {
    const catchAllDomain = await resolveCatchAllDomainForAddress(
      env,
      normalizedEnvelopeTo,
    );
    mailbox = catchAllDomain
      ? await ensureCatchAllMailboxForAddress(
          env,
          catchAllDomain,
          normalizedEnvelopeTo,
        )
      : null;
  }
  if (!mailbox) {
    forwardable.setReject("Mailbox unavailable");
    return;
  }
  if (mailbox.expiresAt && Date.now() > new Date(mailbox.expiresAt).getTime()) {
    forwardable.setReject("Mailbox expired");
    return;
  }

  const rawBuffer = await new Response(forwardable.raw).arrayBuffer();
  const parser = new PostalMime();
  const parsed = await parser.parse(rawBuffer);
  const pendingVerification = createRetryableVerificationFallback();
  const messageId = randomId("msg");
  const receivedAt = nowIso();
  const rawR2Key = `raw/${mailbox.userId}/${mailbox.id}/${messageId}.eml`;
  const parsedR2Key = `parsed/${mailbox.userId}/${mailbox.id}/${messageId}.json`;
  const recipients = {
    to: normalizePeople(parsed.to),
    cc: normalizePeople((parsed as Record<string, unknown>).cc),
    bcc: normalizePeople((parsed as Record<string, unknown>).bcc),
    replyTo: normalizePeople((parsed as Record<string, unknown>).replyTo),
  };
  const attachments = (parsed.attachments ?? []).map((entry) => ({
    id: randomId("att"),
    filename: entry.filename ?? null,
    contentType: entry.mimeType ?? "application/octet-stream",
    sizeBytes:
      entry.content instanceof Uint8Array ? entry.content.byteLength : 0,
    contentId: entry.contentId ?? null,
    disposition: resolveDisposition(entry.disposition),
  }));

  await env.MAIL_BUCKET.put(rawR2Key, rawBuffer, {
    httpMetadata: { contentType: "message/rfc822" },
  });
  await env.MAIL_BUCKET.put(
    parsedR2Key,
    JSON.stringify({
      html: parsed.html ?? null,
      text: parsed.text ?? null,
      headers: parsed.headers ?? [],
    }),
    {
      httpMetadata: { contentType: "application/json" },
    },
  );

  await db.insert(messages).values({
    id: messageId,
    userId: mailbox.userId,
    mailboxId: mailbox.id,
    mailboxAddress: mailbox.address,
    envelopeFrom: forwardable.from,
    envelopeTo: forwardable.to,
    fromName: parsed.from?.name ?? null,
    fromAddress: parsed.from?.address ?? null,
    subject: parsed.subject ?? "(no subject)",
    previewText: extractPreviewText(parsed.text ?? null, parsed.html ?? null),
    messageIdHeader: parsed.messageId ?? null,
    dateHeader: parsed.date ? new Date(parsed.date).toISOString() : null,
    receivedAt,
    sizeBytes: Number(
      (forwardable as { rawSize?: number }).rawSize ?? rawBuffer.byteLength,
    ),
    attachmentCount: attachments.length,
    hasHtml: Boolean(parsed.html),
    verificationCode: null,
    verificationSource: null,
    verificationMethod: null,
    verificationCheckedAt: null,
    verificationRetryAfter:
      pendingVerification.retryAfter ?? resolveNextVerificationRetryAtIso(),
    parseStatus: "parsed",
    rawR2Key,
    parsedR2Key,
  });

  const allRecipients = [
    ...recipients.to.map((recipient) => ({
      ...recipient,
      kind: "to" as const,
    })),
    ...recipients.cc.map((recipient) => ({
      ...recipient,
      kind: "cc" as const,
    })),
    ...recipients.bcc.map((recipient) => ({
      ...recipient,
      kind: "bcc" as const,
    })),
    ...recipients.replyTo.map((recipient) => ({
      ...recipient,
      kind: "replyTo" as const,
    })),
  ];
  if (allRecipients.length > 0) {
    const recipientRows = allRecipients.map((recipient) => ({
      id: randomId("rcp"),
      messageId,
      kind: recipient.kind,
      name: recipient.name,
      address: recipient.address,
    }));
    for (const recipientChunk of chunkD1InsertValues(recipientRows)) {
      await db.insert(messageRecipients).values(recipientChunk);
    }
  }
  if (attachments.length > 0) {
    const attachmentRows = attachments.map((attachment) => ({
      id: attachment.id,
      messageId,
      filename: attachment.filename,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      contentId: attachment.contentId,
      disposition: attachment.disposition,
    }));
    for (const attachmentChunk of chunkD1InsertValues(attachmentRows)) {
      await db.insert(messageAttachments).values(attachmentChunk);
    }
  }

  try {
    const verificationDetection = await resolveVerificationDetectionForMessage(
      env,
      {
        subject: parsed.subject ?? null,
        text: parsed.text ?? null,
        html: parsed.html ?? null,
      },
    );

    await db
      .update(messages)
      .set({
        verificationCode: verificationDetection.verification?.code ?? null,
        verificationSource: verificationDetection.verification?.source ?? null,
        verificationMethod: verificationDetection.verification?.method ?? null,
        verificationCheckedAt: verificationDetection.shouldRetry
          ? null
          : nowIso(),
        verificationRetryAfter: verificationDetection.shouldRetry
          ? (verificationDetection.retryAfter ??
            resolveNextVerificationRetryAtIso())
          : null,
      })
      .where(eq(messages.id, messageId));
  } catch {
    // Keep the retryable placeholder so scheduled backfill can recover later
    // without dropping or rejecting the inbound message.
  }
};
