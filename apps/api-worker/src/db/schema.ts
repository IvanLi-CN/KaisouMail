import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: text("scopes").notNull(),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("api_keys_key_hash_unique").on(table.keyHash),
    index("api_keys_user_idx").on(table.userId),
  ],
);

export const domains = sqliteTable(
  "domains",
  {
    id: text("id").primaryKey(),
    rootDomain: text("root_domain").notNull(),
    zoneId: text("zone_id"),
    status: text("status").notNull(),
    lastProvisionError: text("last_provision_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastProvisionedAt: text("last_provisioned_at"),
    disabledAt: text("disabled_at"),
  },
  (table) => [
    uniqueIndex("domains_root_domain_unique").on(table.rootDomain),
    index("domains_status_idx").on(table.status, table.rootDomain),
  ],
);

export const subdomains = sqliteTable(
  "subdomains",
  {
    id: text("id").primaryKey(),
    domainId: text("domain_id").references(() => domains.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    enabledAt: text("enabled_at").notNull(),
    lastUsedAt: text("last_used_at").notNull(),
    metadata: text("metadata"),
  },
  (table) => [
    uniqueIndex("subdomains_domain_name_unique").on(table.domainId, table.name),
    index("subdomains_domain_idx").on(table.domainId),
  ],
);

export const mailboxes = sqliteTable(
  "mailboxes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    domainId: text("domain_id").references(() => domains.id, {
      onDelete: "restrict",
    }),
    localPart: text("local_part").notNull(),
    subdomain: text("subdomain").notNull(),
    address: text("address").notNull(),
    routingRuleId: text("routing_rule_id"),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    destroyedAt: text("destroyed_at"),
  },
  (table) => [
    uniqueIndex("mailboxes_address_unique")
      .on(table.address)
      .where(sql`${table.status} != 'destroyed'`),
    index("mailboxes_user_idx").on(table.userId),
    index("mailboxes_domain_idx").on(table.domainId, table.status),
    index("mailboxes_status_expires_idx").on(table.status, table.expiresAt),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    mailboxAddress: text("mailbox_address").notNull(),
    envelopeFrom: text("envelope_from"),
    envelopeTo: text("envelope_to").notNull(),
    fromName: text("from_name"),
    fromAddress: text("from_address"),
    subject: text("subject").notNull(),
    previewText: text("preview_text").notNull(),
    messageIdHeader: text("message_id_header"),
    dateHeader: text("date_header"),
    receivedAt: text("received_at").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    attachmentCount: integer("attachment_count").notNull(),
    hasHtml: integer("has_html", { mode: "boolean" }).notNull(),
    parseStatus: text("parse_status").notNull(),
    rawR2Key: text("raw_r2_key").notNull(),
    parsedR2Key: text("parsed_r2_key").notNull(),
  },
  (table) => [
    index("messages_mailbox_received_idx").on(
      table.mailboxId,
      table.receivedAt,
    ),
    index("messages_user_received_idx").on(table.userId, table.receivedAt),
  ],
);

export const messageRecipients = sqliteTable(
  "message_recipients",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name"),
    address: text("address").notNull(),
  },
  (table) => [index("message_recipients_message_idx").on(table.messageId)],
);

export const messageAttachments = sqliteTable(
  "message_attachments",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    filename: text("filename"),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    contentId: text("content_id"),
    disposition: text("disposition").notNull(),
  },
  (table) => [index("message_attachments_message_idx").on(table.messageId)],
);
