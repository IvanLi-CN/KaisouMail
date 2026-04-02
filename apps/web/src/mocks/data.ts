import { versionInfo } from "@cf-mail/shared";

import type {
  ApiKeyRecord,
  Mailbox,
  MessageDetail,
  MessageSummary,
  SessionUser,
  UserRecord,
  VersionInfo,
} from "@/lib/contracts";

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
    id: "key_primary",
    name: "Primary automation",
    prefix: "cfm_demo_pri",
    scopes: ["mailboxes:write", "messages:read"],
    createdAt: "2026-04-01T08:00:00.000Z",
    lastUsedAt: "2026-04-01T08:30:00.000Z",
    revokedAt: null,
  },
  {
    id: "key_ci",
    name: "CI robot",
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
    address: "build@alpha.707979.xyz",
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
    address: "spec@ops.beta.707979.xyz",
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
    address: "qa@team.gamma.707979.xyz",
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
    mailboxAddress: "build@alpha.707979.xyz",
    subject: "Build artifacts ready",
    previewText: "Your nightly bundle is attached and the preview URL is warm.",
    fromName: "CI Runner",
    fromAddress: "ci@example.net",
    receivedAt: "2026-04-01T08:32:00.000Z",
    sizeBytes: 182340,
    attachmentCount: 1,
    hasHtml: true,
    envelopeFrom: "ci@example.net",
    envelopeTo: "build@alpha.707979.xyz",
    messageId: "<demo-alpha@example.net>",
    dateHeader: "2026-04-01T08:32:00.000Z",
    html: "<p><strong>Nightly bundle</strong> is ready. Preview URL has been pre-warmed.</p>",
    text: "Nightly bundle is ready. Preview URL has been pre-warmed.",
    headers: [
      { key: "From", value: "CI Runner <ci@example.net>" },
      { key: "To", value: "build@alpha.707979.xyz" },
      { key: "Subject", value: "Build artifacts ready" },
      { key: "Message-ID", value: "<demo-alpha@example.net>" },
    ],
    recipients: {
      to: [
        {
          id: "rcp_to_alpha",
          kind: "to",
          name: null,
          address: "build@alpha.707979.xyz",
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
    mailboxAddress: "spec@ops.beta.707979.xyz",
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
    envelopeTo: "spec@ops.beta.707979.xyz",
    messageId: "<demo-beta@example.org>",
    dateHeader: "2026-04-01T08:40:00.000Z",
    html: null,
    text: "Action items:\n1. tighten API key scopes\n2. expose mailbox TTL in list view",
    headers: [
      { key: "From", value: "Reviewer <reviewer@example.org>" },
      { key: "To", value: "spec@ops.beta.707979.xyz" },
      { key: "Subject", value: "Spec review notes" },
    ],
    recipients: {
      to: [
        {
          id: "rcp_to_beta",
          kind: "to",
          name: null,
          address: "spec@ops.beta.707979.xyz",
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
