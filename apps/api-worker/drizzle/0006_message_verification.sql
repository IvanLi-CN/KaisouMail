ALTER TABLE `messages` ADD COLUMN `verification_code` text;
ALTER TABLE `messages` ADD COLUMN `verification_source` text;
ALTER TABLE `messages` ADD COLUMN `verification_method` text;
ALTER TABLE `messages` ADD COLUMN `verification_checked_at` text;

CREATE TABLE `runtime_state` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE INDEX `messages_verification_backfill_idx`
  ON `messages` (`verification_checked_at`, `received_at`);
