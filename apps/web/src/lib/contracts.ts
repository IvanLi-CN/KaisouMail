import type {
  apiErrorSchema,
  apiKeySchema,
  apiMetaResponseSchema,
  createApiKeyResponseSchema,
  createUserResponseSchema,
  domainCatalogItemSchema,
  domainSchema,
  mailboxSchema,
  messageDetailSchema,
  messageSummarySchema,
  sessionResponseSchema,
  userSchema,
  versionResponseSchema,
} from "@cf-mail/shared";
import type { z } from "zod";

export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type SessionUser = SessionResponse["user"];
export type ApiErrorPayload = z.infer<typeof apiErrorSchema>;
export type ApiMeta = z.infer<typeof apiMetaResponseSchema>;
export type DomainRecord = z.infer<typeof domainSchema>;
export type DomainCatalogItem = z.infer<typeof domainCatalogItemSchema>;
export type Mailbox = z.infer<typeof mailboxSchema>;
export type MessageSummary = z.infer<typeof messageSummarySchema>;
export type MessageDetail = z.infer<typeof messageDetailSchema>;
export type ApiKeyRecord = z.infer<typeof apiKeySchema>;
export type UserRecord = z.infer<typeof userSchema>;
export type VersionInfo = z.infer<typeof versionResponseSchema>;
export type CreateApiKeyResult = z.infer<typeof createApiKeyResponseSchema>;
export type CreateUserResult = z.infer<typeof createUserResponseSchema>;
