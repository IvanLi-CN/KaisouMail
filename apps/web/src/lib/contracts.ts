import type {
  accountResponseSchema,
  adminTransferVerificationResponseSchema,
  adminUserSchema,
  apiErrorSchema,
  apiKeySchema,
  apiMetaResponseSchema,
  authProviderStatusSchema,
  cloudflareRateLimitContextSchema,
  cloudflareSyncSchema,
  completeExternalRegistrationRequestSchema,
  completePasskeyRegistrationRequestSchema,
  createAdminTransferIntentResponseSchema,
  createApiKeyResponseSchema,
  createInviteResponseSchema,
  domainCatalogItemSchema,
  domainSchema,
  externalAccountSchema,
  inviteSchema,
  listDomainCatalogResponseSchema,
  listExternalAccountsResponseSchema,
  listInvitesResponseSchema,
  listUsersResponseSchema,
  mailboxSchema,
  messageDetailSchema,
  messageSummarySchema,
  paginationMetaSchema,
  passkeySchema,
  pendingRegistrationResponseSchema,
  pendingRegistrationSchema,
  registrationSettingsResponseSchema,
  sessionResponseSchema,
  startProviderRegistrationResponseSchema,
  userSchema,
  versionResponseSchema,
} from "@kaisoumail/shared";
import type { z } from "zod";

export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type SessionUser = SessionResponse["user"];
export type ApiErrorPayload = z.infer<typeof apiErrorSchema>;
export type ApiMeta = z.infer<typeof apiMetaResponseSchema>;
export type CreateAdminTransferIntentResponse = z.infer<
  typeof createAdminTransferIntentResponseSchema
>;
export type AdminTransferVerificationResponse = z.infer<
  typeof adminTransferVerificationResponseSchema
>;
export type DomainRecord = z.infer<typeof domainSchema>;
export type DomainCatalogItem = z.infer<typeof domainCatalogItemSchema>;
export type CloudflareRateLimitContext = z.infer<
  typeof cloudflareRateLimitContextSchema
>;
export type CloudflareSync = z.infer<typeof cloudflareSyncSchema>;
export type DomainCatalogResponse = z.infer<
  typeof listDomainCatalogResponseSchema
>;
export type Mailbox = z.infer<typeof mailboxSchema>;
export type MessageSummary = z.infer<typeof messageSummarySchema>;
export type MessageDetail = z.infer<typeof messageDetailSchema>;
export type ApiKeyRecord = z.infer<typeof apiKeySchema>;
export type PasskeyRecord = z.infer<typeof passkeySchema>;
export type UserRecord = z.infer<typeof userSchema>;
export type AdminUserRecord = z.infer<typeof adminUserSchema>;
export type ExternalAccountRecord = z.infer<typeof externalAccountSchema>;
export type InviteRecord = z.infer<typeof inviteSchema>;
export type AuthProviderStatus = z.infer<typeof authProviderStatusSchema>;
export type PendingRegistration = z.infer<typeof pendingRegistrationSchema>;
export type PendingRegistrationResponse = z.infer<
  typeof pendingRegistrationResponseSchema
>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
export type StartProviderRegistrationResult = z.infer<
  typeof startProviderRegistrationResponseSchema
>;
export type VersionInfo = z.infer<typeof versionResponseSchema>;
export type CreateApiKeyResult = z.infer<typeof createApiKeyResponseSchema>;
export type AccountResponse = z.infer<typeof accountResponseSchema>;
export type ListExternalAccountsResponse = z.infer<
  typeof listExternalAccountsResponseSchema
>;
export type ListUsersResponse = z.infer<typeof listUsersResponseSchema>;
export type ListInvitesResponse = z.infer<typeof listInvitesResponseSchema>;
export type CreateInviteResponse = z.infer<typeof createInviteResponseSchema>;
export type RegistrationSettingsResponse = z.infer<
  typeof registrationSettingsResponseSchema
>;
export type RegistrationSettings = RegistrationSettingsResponse["settings"];
export type CompleteExternalRegistrationInput = z.infer<
  typeof completeExternalRegistrationRequestSchema
>;
export type CompletePasskeyRegistrationInput = z.infer<
  typeof completePasskeyRegistrationRequestSchema
>;
