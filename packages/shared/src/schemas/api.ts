import { z } from "zod";

import {
  apiKeySchema,
  mailboxSchema,
  messageDetailSchema,
  messageSummarySchema,
  sessionUserSchema,
  userRoleSchema,
  userSchema,
} from "./common";

const mailboxLabelRegex = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export const createSessionRequestSchema = z.object({
  apiKey: z.string().min(16),
});

export const sessionResponseSchema = z.object({
  user: sessionUserSchema,
  authenticatedAt: z.string().datetime({ offset: true }),
});

export const createApiKeyRequestSchema = z.object({
  name: z.string().min(1).max(64),
  scopes: z.array(z.string()).default(["mailboxes:write", "messages:read"]),
});

export const createApiKeyResponseSchema = z.object({
  apiKey: z.string(),
  apiKeyRecord: apiKeySchema,
});

export const createMailboxRequestSchema = z.object({
  localPart: z.string().regex(mailboxLabelRegex).optional(),
  subdomain: z.string().regex(mailboxLabelRegex).optional(),
  expiresInMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(60),
});

export const createUserRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(64),
  role: userRoleSchema.default("member"),
});

export const createUserResponseSchema = z.object({
  user: userSchema,
  initialKey: createApiKeyResponseSchema,
});

export const listMailboxesResponseSchema = z.object({
  mailboxes: z.array(mailboxSchema),
});

export const listMessagesResponseSchema = z.object({
  messages: z.array(messageSummarySchema),
});

export const listApiKeysResponseSchema = z.object({
  apiKeys: z.array(apiKeySchema),
});

export const listUsersResponseSchema = z.object({
  users: z.array(userSchema),
});

export const versionResponseSchema = z.object({
  version: z.string(),
  commitSha: z.string(),
  branch: z.string(),
  builtAt: z.string().datetime({ offset: true }),
});

export const messageDetailResponseSchema = z.object({
  message: messageDetailSchema,
});
