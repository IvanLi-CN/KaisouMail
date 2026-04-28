ALTER TABLE `mailboxes` ADD COLUMN `cleanup_next_attempt_at` text;
ALTER TABLE `mailboxes` ADD COLUMN `cleanup_last_error` text;
CREATE INDEX `mailboxes_cleanup_retry_idx` ON `mailboxes` (`status`,`cleanup_next_attempt_at`,`created_at`);
