ALTER TABLE `mailboxes` ADD COLUMN `created_via` text NOT NULL DEFAULT 'unknown';
ALTER TABLE `mailboxes` ADD COLUMN `created_by_api_key_id` text;
ALTER TABLE `mailboxes` ADD COLUMN `tags_json` text NOT NULL DEFAULT '[]';
CREATE INDEX `mailboxes_created_by_api_key_idx` ON `mailboxes` (`created_by_api_key_id`);
