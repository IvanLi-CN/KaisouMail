import { z } from "zod";

import {
  mailboxListScopes,
  mailboxLocalPartRegex,
  mailboxStatuses,
  mailboxSubdomainRegex,
  maxMailboxTtlMinutes,
  minMailboxTtlMinutes,
  rootDomainRegex,
} from "../consts";
import {
  apiKeySchema,
  domainCatalogItemSchema,
  domainCutoverTaskSchema,
  domainSchema,
  mailboxSchema,
  messageDetailSchema,
  messageSummarySchema,
  passkeySchema,
  sessionUserSchema,
  userRoleSchema,
  userSchema,
} from "./common";
import { withMailDomainAliases } from "./mail-domain";

export const createSessionRequestSchema = z.object({
  apiKey: z.string().min(16),
});

export const apiErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().nullable(),
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

export const createPasskeyRequestSchema = z.object({
  name: z.string().trim().min(1).max(64),
});

export const createMailboxRequestSchema = withMailDomainAliases({
  localPart: z.string().regex(mailboxLocalPartRegex).optional(),
  subdomain: z.string().regex(mailboxSubdomainRegex).optional(),
  expiresInMinutes: z
    .number()
    .int()
    .min(minMailboxTtlMinutes)
    .max(maxMailboxTtlMinutes)
    .nullable()
    .optional(),
});

export const ensureMailboxRequestSchema = z.union([
  z
    .object({
      address: z.string().email(),
      expiresInMinutes: z
        .number()
        .int()
        .min(minMailboxTtlMinutes)
        .max(maxMailboxTtlMinutes)
        .nullable()
        .optional(),
    })
    .strict(),
  withMailDomainAliases(
    {
      localPart: z.string().regex(mailboxLocalPartRegex),
      subdomain: z.string().regex(mailboxSubdomainRegex),
      expiresInMinutes: z
        .number()
        .int()
        .min(minMailboxTtlMinutes)
        .max(maxMailboxTtlMinutes)
        .nullable()
        .optional(),
    },
    { strict: true },
  ),
]);

export const resolveMailboxQuerySchema = z.object({
  address: z.string().email(),
});

export const listQueryScopeSchema = z.enum(mailboxListScopes);

export const listMailboxStatusSchema = z.enum(mailboxStatuses);

export const listMailboxesQuerySchema = z.object({
  scope: listQueryScopeSchema.optional(),
  status: z
    .union([listMailboxStatusSchema, z.array(listMailboxStatusSchema)])
    .optional(),
});

export const listMessagesQuerySchema = z.object({
  after: z.string().datetime({ offset: true }).optional(),
  mailboxStatus: z
    .union([listMailboxStatusSchema, z.array(listMailboxStatusSchema)])
    .optional(),
  since: z.string().datetime({ offset: true }).optional(),
  scope: listQueryScopeSchema.optional(),
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

export const createDomainRequestSchema = withMailDomainAliases(
  {
    zoneId: z.string().min(1).max(128),
  },
  { required: true },
);

export const bindDomainRequestSchema = withMailDomainAliases(
  {},
  { required: true },
);

export const listMailboxesResponseSchema = z.object({
  mailboxes: z.array(mailboxSchema),
});

export const listDomainsResponseSchema = z.object({
  domains: z.array(domainSchema),
});

export const domainCutoverTaskAcceptedResponseSchema = z.object({
  taskId: z.string(),
});

export const domainCutoverTaskResponseSchema = z.object({
  task: domainCutoverTaskSchema,
});

export const cloudflareRateLimitContextSchema = z.object({
  triggeredAt: z.string().datetime({ offset: true }),
  projectOperation: z.string().min(1),
  projectRoute: z.string().min(1),
  cloudflareMethod: z.string().min(1),
  cloudflarePath: z.string().min(1),
  lastBlockedAt: z.string().datetime({ offset: true }).nullable(),
  lastBlockedBy: z
    .object({
      projectOperation: z.string().min(1),
      projectRoute: z.string().min(1),
    })
    .nullable(),
});

export const cloudflareSyncSchema = z.object({
  status: z.enum(["live", "rate_limited"]),
  retryAfter: z.string().datetime({ offset: true }).nullable(),
  retryAfterSeconds: z.number().int().nonnegative().nullable(),
  rateLimitContext: cloudflareRateLimitContextSchema.nullable().default(null),
});

export const listDomainCatalogResponseSchema = z.object({
  domains: z.array(domainCatalogItemSchema),
  cloudflareSync: cloudflareSyncSchema,
});

export const listMessagesResponseSchema = z.object({
  messages: z.array(messageSummarySchema),
});

export const listApiKeysResponseSchema = z.object({
  apiKeys: z.array(apiKeySchema),
});

export const listPasskeysResponseSchema = z.object({
  passkeys: z.array(passkeySchema),
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

export const apiMetaResponseSchema = z.object({
  domains: z.array(z.string().regex(rootDomainRegex)),
  cloudflareDomainBindingEnabled: z.boolean(),
  cloudflareDomainLifecycleEnabled: z.boolean(),
  cloudflareCatchAllManagementEnabled: z.boolean(),
  cloudflareCatchAllEnablementEnabled: z.boolean(),
  passkeyAuthEnabled: z.boolean(),
  passkeyTrustedOrigins: z.array(z.string().url()),
  supportsUnlimitedMailboxTtl: z.boolean().optional().default(false),
  defaultMailboxTtlMinutes: z
    .number()
    .int()
    .min(minMailboxTtlMinutes)
    .max(maxMailboxTtlMinutes),
  minMailboxTtlMinutes: z.number().int().min(1),
  maxMailboxTtlMinutes: z.number().int().min(minMailboxTtlMinutes),
  addressRules: z.object({
    format: z.literal("localPart@subdomain.rootDomain"),
    localPartPattern: z.string(),
    subdomainPattern: z.string(),
    examples: z.array(z.string()),
  }),
});
