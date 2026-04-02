import { z } from "zod";

import {
  attachmentDispositions,
  mailboxStatuses,
  recipientKinds,
  userRoles,
} from "../consts";

export const isoDateSchema = z.string().datetime({ offset: true });
export const userRoleSchema = z.enum(userRoles);
export const mailboxStatusSchema = z.enum(mailboxStatuses);
export const recipientKindSchema = z.enum(recipientKinds);
export const attachmentDispositionSchema = z.enum(attachmentDispositions);

export const addressLabelSchema = z.object({
  name: z.string().nullable(),
  address: z.string().email(),
});

export const headerSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const recipientSchema = z.object({
  id: z.string(),
  kind: recipientKindSchema,
  name: z.string().nullable(),
  address: z.string().email(),
});

export const attachmentSchema = z.object({
  id: z.string(),
  filename: z.string().nullable(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  contentId: z.string().nullable(),
  disposition: attachmentDispositionSchema,
});

export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: userRoleSchema,
});

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  createdAt: isoDateSchema,
  lastUsedAt: isoDateSchema.nullable(),
  revokedAt: isoDateSchema.nullable(),
});

export const mailboxSchema = z.object({
  id: z.string(),
  userId: z.string(),
  localPart: z.string(),
  subdomain: z.string(),
  address: z.string().email(),
  status: mailboxStatusSchema,
  createdAt: isoDateSchema,
  lastReceivedAt: isoDateSchema.nullable(),
  expiresAt: isoDateSchema,
  destroyedAt: isoDateSchema.nullable(),
  routingRuleId: z.string().nullable(),
});

export const messageSummarySchema = z.object({
  id: z.string(),
  mailboxId: z.string(),
  mailboxAddress: z.string().email(),
  subject: z.string(),
  previewText: z.string(),
  fromName: z.string().nullable(),
  fromAddress: z.string().email().nullable(),
  receivedAt: isoDateSchema,
  sizeBytes: z.number().int().nonnegative(),
  attachmentCount: z.number().int().nonnegative(),
  hasHtml: z.boolean(),
});

export const messageDetailSchema = messageSummarySchema.extend({
  envelopeFrom: z.string().nullable(),
  envelopeTo: z.string().email(),
  messageId: z.string().nullable(),
  dateHeader: z.string().nullable(),
  html: z.string().nullable(),
  text: z.string().nullable(),
  headers: z.array(headerSchema),
  recipients: z.object({
    to: z.array(recipientSchema),
    cc: z.array(recipientSchema),
    bcc: z.array(recipientSchema),
    replyTo: z.array(recipientSchema),
  }),
  attachments: z.array(attachmentSchema),
  rawDownloadPath: z.string(),
});

export const userSchema = sessionUserSchema.extend({
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
