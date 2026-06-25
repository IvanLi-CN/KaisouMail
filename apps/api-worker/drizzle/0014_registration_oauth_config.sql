ALTER TABLE `users` ADD COLUMN `username` text NOT NULL DEFAULT '';
ALTER TABLE `users` ADD COLUMN `nickname` text NOT NULL DEFAULT '';
ALTER TABLE `users` ADD COLUMN `deleted_at` text;

UPDATE `users`
SET
  `username` = CASE
    WHEN trim(`username`) = '' THEN replace(lower(`id`), '_', '-')
    ELSE trim(`username`)
  END,
  `nickname` = CASE
    WHEN trim(`nickname`) = '' THEN COALESCE(NULLIF(trim(`name`), ''), replace(lower(`id`), '_', '-'))
    ELSE trim(`nickname`)
  END;

CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
CREATE INDEX `users_role_deleted_idx` ON `users` (`role`, `deleted_at`);

CREATE TABLE `external_accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `provider` text NOT NULL,
  `provider_user_id` text NOT NULL,
  `provider_username` text,
  `provider_nickname` text,
  `avatar_url` text,
  `profile_url` text,
  `created_at` text NOT NULL,
  `last_used_at` text,
  `released_at` text,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `external_accounts_provider_user_unique`
ON `external_accounts` (`provider`, `provider_user_id`)
WHERE `released_at` IS NULL;
CREATE UNIQUE INDEX `external_accounts_user_provider_unique`
ON `external_accounts` (`user_id`, `provider`)
WHERE `released_at` IS NULL;
CREATE INDEX `external_accounts_user_idx` ON `external_accounts` (`user_id`);

CREATE TABLE `invites` (
  `id` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL,
  `kind` text NOT NULL,
  `role` text NOT NULL,
  `note` text,
  `created_by_user_id` text REFERENCES `users`(`id`) ON DELETE set null,
  `created_at` text NOT NULL,
  `used_at` text,
  `used_by_user_id` text REFERENCES `users`(`id`) ON DELETE set null
);
CREATE UNIQUE INDEX `invites_code_unique` ON `invites` (`code`);
CREATE INDEX `invites_used_idx` ON `invites` (`used_at`, `created_at`);

CREATE TABLE `registration_settings` (
  `id` integer PRIMARY KEY NOT NULL,
  `github_mode` text NOT NULL DEFAULT 'invite-only',
  `github_daily_limit` integer NOT NULL DEFAULT 10,
  `github_client_id` text NOT NULL DEFAULT '',
  `github_client_secret` text NOT NULL DEFAULT '',
  `github_oauth_scopes` text NOT NULL DEFAULT 'read:user',
  `linuxdo_mode` text NOT NULL DEFAULT 'invite-only',
  `linuxdo_daily_limit` integer NOT NULL DEFAULT 10,
  `linuxdo_client_id` text NOT NULL DEFAULT '',
  `linuxdo_client_secret` text NOT NULL DEFAULT '',
  `linuxdo_oauth_base_url` text NOT NULL DEFAULT 'https://connect.linux.do',
  `passkey_mode` text NOT NULL DEFAULT 'invite-only',
  `deleted_user_mailbox_retention_days` integer NOT NULL DEFAULT 7,
  `updated_at` text NOT NULL
);

CREATE TABLE `daily_signup_counters` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `date_key` text NOT NULL,
  `created_count` integer NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `daily_signup_counters_provider_date_unique`
ON `daily_signup_counters` (`provider`, `date_key`);
