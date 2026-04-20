import { z } from "zod";

import {
  attachmentDispositions,
  domainBindingSources,
  domainCatalogAvailabilities,
  domainProjectStatuses,
  domainStatuses,
  mailboxSources,
  mailboxStatuses,
  recipientKinds,
  subdomainDnsModes,
  userRoles,
} from "../consts";
import { withMailDomainAliases } from "./mail-domain";

export const isoDateSchema = z.string().datetime({ offset: true });
export const userRoleSchema = z.enum(userRoles);
export const mailboxStatusSchema = z.enum(mailboxStatuses);
export const mailboxSourceSchema = z.enum(mailboxSources);
export const domainStatusSchema = z.enum(domainStatuses);
export const passkeyDeviceTypeSchema = z.enum(["singleDevice", "multiDevice"]);
export const domainBindingSourceSchema = z.enum(domainBindingSources);
export const subdomainDnsModeSchema = z.enum(subdomainDnsModes);
export const domainCatalogAvailabilitySchema = z.enum(
  domainCatalogAvailabilities,
);
export const domainProjectStatusSchema = z.enum(domainProjectStatuses);
export const recipientKindSchema = z.enum(recipientKinds);
export const attachmentDispositionSchema = z.enum(attachmentDispositions);
export const verificationSourceSchema = z.enum(["subject", "body"]);
export const verificationMethodSchema = z.enum(["rules", "ai"]);
export const domainCutoverTaskActionSchema = z.enum(["enable", "disable"]);
export const domainCutoverTaskStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);

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

export const verificationSchema = z.object({
  code: z.string().min(4).max(8),
  source: verificationSourceSchema,
  method: verificationMethodSchema,
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

export const passkeySchema = z.object({
  id: z.string(),
  name: z.string(),
  credentialId: z.string(),
  deviceType: passkeyDeviceTypeSchema,
  backedUp: z.boolean(),
  transports: z.array(z.string()),
  createdAt: isoDateSchema,
  lastUsedAt: isoDateSchema.nullable(),
  revokedAt: isoDateSchema.nullable(),
});

export const mailboxSchema = withMailDomainAliases(
  {
    id: z.string(),
    userId: z.string(),
    localPart: z.string(),
    subdomain: z.string(),
    address: z.string().email(),
    source: mailboxSourceSchema,
    status: mailboxStatusSchema,
    createdAt: isoDateSchema,
    lastReceivedAt: isoDateSchema.nullable(),
    expiresAt: isoDateSchema.nullable(),
    destroyedAt: isoDateSchema.nullable(),
    routingRuleId: z.string().nullable(),
  },
  { required: true },
);

export const domainSchema = withMailDomainAliases(
  {
    id: z.string(),
    zoneId: z.string().nullable(),
    bindingSource: domainBindingSourceSchema,
    status: domainStatusSchema,
    catchAllEnabled: z.boolean(),
    subdomainDnsMode: subdomainDnsModeSchema.optional(),
    wildcardDnsVerifiedAt: isoDateSchema.nullable().optional(),
    wildcardDnsLastError: z.string().nullable().optional(),
    lastProvisionError: z.string().nullable(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
    lastProvisionedAt: isoDateSchema.nullable(),
    disabledAt: isoDateSchema.nullable(),
  },
  { required: true },
);

export const domainCatalogItemSchema = withMailDomainAliases(
  {
    id: z.string().nullable(),
    zoneId: z.string().nullable(),
    bindingSource: domainBindingSourceSchema.nullable(),
    cloudflareAvailability: domainCatalogAvailabilitySchema,
    cloudflareStatus: z.string().nullable(),
    nameServers: z.array(z.string()),
    projectStatus: domainProjectStatusSchema,
    catchAllEnabled: z.boolean(),
    subdomainDnsMode: subdomainDnsModeSchema.optional(),
    wildcardDnsVerifiedAt: isoDateSchema.nullable().optional(),
    wildcardDnsLastError: z.string().nullable().optional(),
    lastProvisionError: z.string().nullable(),
    createdAt: isoDateSchema.nullable(),
    updatedAt: isoDateSchema.nullable(),
    lastProvisionedAt: isoDateSchema.nullable(),
    disabledAt: isoDateSchema.nullable(),
  },
  { required: true },
);

export const domainCutoverTaskSchema = z.object({
  id: z.string(),
  domainId: z.string(),
  rootDomain: z.string(),
  requestedByUserId: z.string().nullable(),
  action: domainCutoverTaskActionSchema,
  targetMode: subdomainDnsModeSchema,
  status: domainCutoverTaskStatusSchema,
  phase: z.string().min(1),
  currentHost: z.string().nullable(),
  deletedCount: z.number().int().nonnegative(),
  rebuiltCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  rollbackPhase: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: isoDateSchema,
  startedAt: isoDateSchema.nullable(),
  updatedAt: isoDateSchema,
  completedAt: isoDateSchema.nullable(),
  failedAt: isoDateSchema.nullable(),
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
  verification: verificationSchema.nullable(),
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
