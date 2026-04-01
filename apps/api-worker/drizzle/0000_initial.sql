CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `name` text NOT NULL,
  `role` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);

CREATE TABLE `api_keys` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `prefix` text NOT NULL,
  `key_hash` text NOT NULL,
  `scopes` text NOT NULL,
  `created_at` text NOT NULL,
  `last_used_at` text,
  `revoked_at` text,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);
CREATE INDEX `api_keys_user_idx` ON `api_keys` (`user_id`);

CREATE TABLE `subdomains` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `enabled_at` text NOT NULL,
  `last_used_at` text NOT NULL,
  `metadata` text
);
CREATE UNIQUE INDEX `subdomains_name_unique` ON `subdomains` (`name`);

CREATE TABLE `mailboxes` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `local_part` text NOT NULL,
  `subdomain` text NOT NULL,
  `address` text NOT NULL,
  `routing_rule_id` text,
  `status` text NOT NULL,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `destroyed_at` text,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `mailboxes_address_unique` ON `mailboxes` (`address`);
CREATE INDEX `mailboxes_user_idx` ON `mailboxes` (`user_id`);
CREATE INDEX `mailboxes_status_expires_idx` ON `mailboxes` (`status`, `expires_at`);

CREATE TABLE `messages` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `mailbox_id` text NOT NULL,
  `mailbox_address` text NOT NULL,
  `envelope_from` text,
  `envelope_to` text NOT NULL,
  `from_name` text,
  `from_address` text,
  `subject` text NOT NULL,
  `preview_text` text NOT NULL,
  `message_id_header` text,
  `date_header` text,
  `received_at` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `attachment_count` integer NOT NULL,
  `has_html` integer NOT NULL,
  `parse_status` text NOT NULL,
  `raw_r2_key` text NOT NULL,
  `parsed_r2_key` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `messages_mailbox_received_idx` ON `messages` (`mailbox_id`, `received_at`);
CREATE INDEX `messages_user_received_idx` ON `messages` (`user_id`, `received_at`);

CREATE TABLE `message_recipients` (
  `id` text PRIMARY KEY NOT NULL,
  `message_id` text NOT NULL,
  `kind` text NOT NULL,
  `name` text,
  `address` text NOT NULL,
  FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `message_recipients_message_idx` ON `message_recipients` (`message_id`);

CREATE TABLE `message_attachments` (
  `id` text PRIMARY KEY NOT NULL,
  `message_id` text NOT NULL,
  `filename` text,
  `content_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `content_id` text,
  `disposition` text NOT NULL,
  FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `message_attachments_message_idx` ON `message_attachments` (`message_id`);
