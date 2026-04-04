import { versionInfo } from "@cf-mail/shared";

import type {
  ApiKeyRecord,
  ApiMeta,
  DomainCatalogItem,
  DomainRecord,
  Mailbox,
  MessageDetail,
  MessageSummary,
  SessionUser,
  UserRecord,
  VersionInfo,
} from "@/lib/contracts";

const primaryRootDomain = "relay.example.test";
const primaryMailboxAddress = `build@alpha.${primaryRootDomain}`;

const baseUser: SessionUser = {
  id: "usr_demo_admin",
  email: "owner@example.com",
  name: "Ivan Owner",
  role: "admin",
};

const memberUser: UserRecord = {
  id: "usr_demo_member",
  email: "teammate@example.com",
  name: "Teammate",
  role: "member",
  createdAt: "2026-04-01T08:00:00.000Z",
  updatedAt: "2026-04-01T08:00:00.000Z",
};

export const demoUsers: UserRecord[] = [
  {
    ...baseUser,
    createdAt: "2026-04-01T08:00:00.000Z",
    updatedAt: "2026-04-01T08:00:00.000Z",
  },
  memberUser,
];

export const demoApiKeys: ApiKeyRecord[] = [
  {
    id: "key_bootstrap",
    name: "Bootstrap Admin",
    prefix: "cfm_live_Lku",
    scopes: ["mailboxes:write", "messages:read"],
    createdAt: "2026-04-01T08:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  },
  {
    id: "key_smoke",
    name: "Smoke Test Key",
    prefix: "cfm_smoke__w",
    scopes: ["mailboxes:write", "messages:read"],
    createdAt: "2026-04-02T01:32:00.000Z",
    lastUsedAt: "2026-04-02T01:34:00.000Z",
    revokedAt: "2026-04-04T06:10:00.000Z",
  },
  {
    id: "key_recovery",
    name: "Recovery API Key",
    prefix: "cfm_v3ZnI32U",
    scopes: ["mailboxes:write", "messages:read"],
    createdAt: "2026-04-04T00:36:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  },
  {
    id: "key_ivan",
    name: "ivan",
    prefix: "cfm_-Dtx1FRi",
    scopes: ["mailboxes:write", "messages:read"],
    createdAt: "2026-04-04T01:59:00.000Z",
    lastUsedAt: "2026-04-04T03:54:00.000Z",
    revokedAt: null,
  },
  {
    id: "key_docs",
    name: "Docs Robot",
    prefix: "cfm_docs__7q",
    scopes: ["messages:read"],
    createdAt: "2026-04-03T22:40:00.000Z",
    lastUsedAt: "2026-04-04T02:10:00.000Z",
    revokedAt: null,
  },
  {
    id: "key_webhook",
    name: "Webhook Mirror",
    prefix: "cfm_hook__4m",
    scopes: ["messages:read"],
    createdAt: "2026-04-04T04:20:00.000Z",
    lastUsedAt: "2026-04-04T04:42:00.000Z",
    revokedAt: null,
  },
  {
    id: "key_support",
    name: "Support Bridge",
    prefix: "cfm_help__8c",
    scopes: ["messages:read"],
    createdAt: "2026-04-04T05:02:00.000Z",
    lastUsedAt: "2026-04-04T05:16:00.000Z",
    revokedAt: null,
  },
  {
    id: "key_deploy",
    name: "Deploy Bot",
    prefix: "cfm_deploy9x",
    scopes: ["mailboxes:write", "messages:read"],
    createdAt: "2026-04-03T20:10:00.000Z",
    lastUsedAt: "2026-04-03T21:00:00.000Z",
    revokedAt: null,
  },
  {
    id: "key_ops",
    name: "Ops Console",
    prefix: "cfm_ops___2n",
    scopes: ["mailboxes:write"],
    createdAt: "2026-04-03T10:15:00.000Z",
    lastUsedAt: "2026-04-03T11:00:00.000Z",
    revokedAt: null,
  },
  {
    id: "key_nightly",
    name: "Nightly Sync",
    prefix: "cfm_night_1p",
    scopes: ["messages:read"],
    createdAt: "2026-04-02T08:50:00.000Z",
    lastUsedAt: "2026-04-02T09:15:00.000Z",
    revokedAt: null,
  },
  {
    id: "key_audit",
    name: "Audit Trail",
    prefix: "cfm_audit_5k",
    scopes: ["messages:read"],
    createdAt: "2026-04-03T20:20:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  },
  {
    id: "key_sync",
    name: "Subdomain Sync",
    prefix: "cfm_sync__3r",
    scopes: ["mailboxes:write"],
    createdAt: "2026-04-02T10:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  },
  {
    id: "key_ci",
    name: "CI Robot",
    prefix: "cfm_demo_ci_",
    scopes: ["messages:read"],
    createdAt: "2026-04-01T08:10:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  },
];

export const demoMailboxes: Mailbox[] = [
  {
    id: "mbx_alpha",
    userId: baseUser.id,
    localPart: "build",
    subdomain: "alpha",
    rootDomain: primaryRootDomain,
    address: primaryMailboxAddress,
    status: "active",
    createdAt: "2026-04-01T08:05:00.000Z",
    lastReceivedAt: "2026-04-01T08:32:00.000Z",
    expiresAt: "2026-04-01T10:05:00.000Z",
    destroyedAt: null,
    routingRuleId: "rule_alpha",
  },
  {
    id: "mbx_beta",
    userId: baseUser.id,
    localPart: "spec",
    subdomain: "ops.beta",
    rootDomain: "mail.example.net",
    address: "spec@ops.beta.mail.example.net",
    status: "active",
    createdAt: "2026-04-01T08:15:00.000Z",
    lastReceivedAt: "2026-04-01T08:40:00.000Z",
    expiresAt: "2026-04-01T09:15:00.000Z",
    destroyedAt: null,
    routingRuleId: "rule_beta",
  },
  {
    id: "mbx_gamma",
    userId: memberUser.id,
    localPart: "qa",
    subdomain: "team.gamma",
    rootDomain: "disabled.example.org",
    address: "qa@team.gamma.disabled.example.org",
    status: "destroyed",
    createdAt: "2026-04-01T07:00:00.000Z",
    lastReceivedAt: null,
    expiresAt: "2026-04-01T08:00:00.000Z",
    destroyedAt: "2026-04-01T08:01:00.000Z",
    routingRuleId: null,
  },
];

const demoDetails: MessageDetail[] = [
  {
    id: "msg_alpha",
    mailboxId: "mbx_alpha",
    mailboxAddress: primaryMailboxAddress,
    subject: "Build artifacts ready",
    previewText: "Your nightly bundle is attached and the preview URL is warm.",
    fromName: "CI Runner",
    fromAddress: "ci@example.net",
    receivedAt: "2026-04-01T08:32:00.000Z",
    sizeBytes: 182340,
    attachmentCount: 1,
    hasHtml: true,
    envelopeFrom: "ci@example.net",
    envelopeTo: primaryMailboxAddress,
    messageId: "<demo-alpha@example.net>",
    dateHeader: "2026-04-01T08:32:00.000Z",
    html: "<p><strong>Nightly bundle</strong> is ready. Preview URL has been pre-warmed.</p>",
    text: "Nightly bundle is ready. Preview URL has been pre-warmed.",
    headers: [
      { key: "From", value: "CI Runner <ci@example.net>" },
      { key: "To", value: primaryMailboxAddress },
      { key: "Subject", value: "Build artifacts ready" },
      { key: "Message-ID", value: "<demo-alpha@example.net>" },
    ],
    recipients: {
      to: [
        {
          id: "rcp_to_alpha",
          kind: "to",
          name: null,
          address: primaryMailboxAddress,
        },
      ],
      cc: [],
      bcc: [],
      replyTo: [
        {
          id: "rcp_reply_alpha",
          kind: "replyTo",
          name: "CI Support",
          address: "support@example.net",
        },
      ],
    },
    attachments: [
      {
        id: "att_alpha",
        filename: "bundle.zip",
        contentType: "application/zip",
        sizeBytes: 180200,
        contentId: null,
        disposition: "attachment",
      },
    ],
    rawDownloadPath: "/api/messages/msg_alpha/raw",
  },
  {
    id: "msg_beta",
    mailboxId: "mbx_beta",
    mailboxAddress: "spec@ops.beta.mail.example.net",
    subject: "Spec review notes",
    previewText:
      "There are two action items and one blocker around API scopes.",
    fromName: "Reviewer",
    fromAddress: "reviewer@example.org",
    receivedAt: "2026-04-01T08:40:00.000Z",
    sizeBytes: 8421,
    attachmentCount: 0,
    hasHtml: false,
    envelopeFrom: "reviewer@example.org",
    envelopeTo: "spec@ops.beta.mail.example.net",
    messageId: "<demo-beta@example.org>",
    dateHeader: "2026-04-01T08:40:00.000Z",
    html: null,
    text: "Action items:\n1. tighten API key scopes\n2. expose mailbox TTL in list view",
    headers: [
      { key: "From", value: "Reviewer <reviewer@example.org>" },
      { key: "To", value: "spec@ops.beta.mail.example.net" },
      { key: "Subject", value: "Spec review notes" },
    ],
    recipients: {
      to: [
        {
          id: "rcp_to_beta",
          kind: "to",
          name: null,
          address: "spec@ops.beta.mail.example.net",
        },
      ],
      cc: [
        {
          id: "rcp_cc_beta",
          kind: "cc",
          name: "Owner",
          address: "owner@example.com",
        },
      ],
      bcc: [],
      replyTo: [],
    },
    attachments: [],
    rawDownloadPath: "/api/messages/msg_beta/raw",
  },
];

export const demoMessages: MessageSummary[] = demoDetails.map((message) => ({
  id: message.id,
  mailboxId: message.mailboxId,
  mailboxAddress: message.mailboxAddress,
  subject: message.subject,
  previewText: message.previewText,
  fromName: message.fromName,
  fromAddress: message.fromAddress,
  receivedAt: message.receivedAt,
  sizeBytes: message.sizeBytes,
  attachmentCount: message.attachmentCount,
  hasHtml: message.hasHtml,
}));

export const demoMessageDetails = Object.fromEntries(
  demoDetails.map((message) => [message.id, message]),
) as Record<string, MessageDetail>;

export const demoVersion: VersionInfo = {
  version: versionInfo.version,
  commitSha: versionInfo.commitSha,
  branch: versionInfo.branch,
  builtAt: versionInfo.builtAt,
};

export const demoSessionUser = baseUser;

export const demoDomains: DomainRecord[] = [
  {
    id: "dom_primary",
    rootDomain: primaryRootDomain,
    zoneId: "zone_primary",
    status: "active",
    lastProvisionError: null,
    createdAt: "2026-04-01T08:00:00.000Z",
    updatedAt: "2026-04-01T08:05:00.000Z",
    lastProvisionedAt: "2026-04-01T08:05:00.000Z",
    disabledAt: null,
  },
  {
    id: "dom_secondary",
    rootDomain: "mail.example.net",
    zoneId: "zone_secondary",
    status: "active",
    lastProvisionError: null,
    createdAt: "2026-04-01T08:10:00.000Z",
    updatedAt: "2026-04-01T08:12:00.000Z",
    lastProvisionedAt: "2026-04-01T08:12:00.000Z",
    disabledAt: null,
  },
  {
    id: "dom_failed",
    rootDomain: "staging.example.dev",
    zoneId: "zone_failed",
    status: "provisioning_error",
    lastProvisionError: "Zone access denied",
    createdAt: "2026-04-01T08:20:00.000Z",
    updatedAt: "2026-04-01T08:25:00.000Z",
    lastProvisionedAt: null,
    disabledAt: null,
  },
  {
    id: "dom_disabled",
    rootDomain: "disabled.example.org",
    zoneId: "zone_disabled",
    status: "disabled",
    lastProvisionError: null,
    createdAt: "2026-04-01T08:30:00.000Z",
    updatedAt: "2026-04-01T08:40:00.000Z",
    lastProvisionedAt: "2026-04-01T08:35:00.000Z",
    disabledAt: "2026-04-01T08:40:00.000Z",
  },
];

export const demoCloudflareZones = [
  {
    id: "zone_primary",
    rootDomain: primaryRootDomain,
  },
  {
    id: "zone_secondary",
    rootDomain: "mail.example.net",
  },
  {
    id: "zone_failed",
    rootDomain: "staging.example.dev",
  },
  {
    id: "zone_disabled",
    rootDomain: "disabled.example.org",
  },
  {
    id: "zone_available",
    rootDomain: "ops.example.org",
  },
];

export const demoDomainCatalog: DomainCatalogItem[] = [
  {
    id: "dom_primary",
    rootDomain: primaryRootDomain,
    zoneId: "zone_primary",
    cloudflareAvailability: "available",
    projectStatus: "active",
    lastProvisionError: null,
    createdAt: "2026-04-01T08:00:00.000Z",
    updatedAt: "2026-04-01T08:05:00.000Z",
    lastProvisionedAt: "2026-04-01T08:05:00.000Z",
    disabledAt: null,
  },
  {
    id: "dom_secondary",
    rootDomain: "mail.example.net",
    zoneId: "zone_secondary",
    cloudflareAvailability: "available",
    projectStatus: "active",
    lastProvisionError: null,
    createdAt: "2026-04-01T08:10:00.000Z",
    updatedAt: "2026-04-01T08:12:00.000Z",
    lastProvisionedAt: "2026-04-01T08:12:00.000Z",
    disabledAt: null,
  },
  {
    id: "dom_failed",
    rootDomain: "staging.example.dev",
    zoneId: "zone_failed",
    cloudflareAvailability: "available",
    projectStatus: "provisioning_error",
    lastProvisionError: "Zone access denied",
    createdAt: "2026-04-01T08:20:00.000Z",
    updatedAt: "2026-04-01T08:25:00.000Z",
    lastProvisionedAt: null,
    disabledAt: null,
  },
  {
    id: "dom_disabled",
    rootDomain: "disabled.example.org",
    zoneId: "zone_disabled",
    cloudflareAvailability: "available",
    projectStatus: "disabled",
    lastProvisionError: null,
    createdAt: "2026-04-01T08:30:00.000Z",
    updatedAt: "2026-04-01T08:40:00.000Z",
    lastProvisionedAt: "2026-04-01T08:35:00.000Z",
    disabledAt: "2026-04-01T08:40:00.000Z",
  },
  {
    id: null,
    rootDomain: "ops.example.org",
    zoneId: "zone_available",
    cloudflareAvailability: "available",
    projectStatus: "not_enabled",
    lastProvisionError: null,
    createdAt: null,
    updatedAt: null,
    lastProvisionedAt: null,
    disabledAt: null,
  },
];

export const demoMeta: ApiMeta = {
  domains: demoDomains
    .filter((domain) => domain.status === "active")
    .map((domain) => domain.rootDomain),
  defaultMailboxTtlMinutes: 60,
  minMailboxTtlMinutes: 5,
  maxMailboxTtlMinutes: 1440,
  addressRules: {
    format: "localPart@subdomain.rootDomain",
    localPartPattern: "^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$",
    subdomainPattern:
      "^(?=.{1,190}$)[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?)*$",
    examples: [primaryMailboxAddress, "spec@ops.alpha.mail.example.net"],
  },
};
