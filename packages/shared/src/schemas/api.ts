import { z } from "zod";

import {
  mailboxLocalPartRegex,
  mailboxSubdomainRegex,
  maxMailboxTtlMinutes,
  minMailboxTtlMinutes,
  rootDomainRegex,
} from "../consts";
import {
  apiKeySchema,
  domainCatalogItemSchema,
  domainSchema,
  mailboxSchema,
  messageDetailSchema,
  messageSummarySchema,
  sessionUserSchema,
  userRoleSchema,
  userSchema,
} from "./common";

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

export const createMailboxRequestSchema = z.object({
  localPart: z.string().regex(mailboxLocalPartRegex).optional(),
  subdomain: z.string().regex(mailboxSubdomainRegex).optional(),
  rootDomain: z.string().regex(rootDomainRegex).optional(),
  expiresInMinutes: z
    .number()
    .int()
    .min(minMailboxTtlMinutes)
    .max(maxMailboxTtlMinutes)
    .default(60),
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
        .optional(),
    })
    .strict(),
  z
    .object({
      localPart: z.string().regex(mailboxLocalPartRegex),
      subdomain: z.string().regex(mailboxSubdomainRegex),
      rootDomain: z.string().regex(rootDomainRegex).optional(),
      expiresInMinutes: z
        .number()
        .int()
        .min(minMailboxTtlMinutes)
        .max(maxMailboxTtlMinutes)
        .optional(),
    })
    .strict(),
]);

export const resolveMailboxQuerySchema = z.object({
  address: z.string().email(),
});

export const listMessagesQuerySchema = z.object({
  after: z.string().datetime({ offset: true }).optional(),
  since: z.string().datetime({ offset: true }).optional(),
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

export const createDomainRequestSchema = z.object({
  rootDomain: z.string().regex(rootDomainRegex),
  zoneId: z.string().min(1).max(128),
});

export const listMailboxesResponseSchema = z.object({
  mailboxes: z.array(mailboxSchema),
});

export const listDomainsResponseSchema = z.object({
  domains: z.array(domainSchema),
});

export const listDomainCatalogResponseSchema = z.object({
  domains: z.array(domainCatalogItemSchema),
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

export const apiMetaResponseSchema = z.object({
  domains: z.array(z.string().regex(rootDomainRegex)),
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
