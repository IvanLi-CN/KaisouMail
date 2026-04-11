ALTER TABLE `messages` ADD COLUMN `verification_retry_after` text;

CREATE INDEX `messages_verification_retry_idx`
  ON `messages` (`verification_checked_at`, `verification_retry_after`, `received_at`);
