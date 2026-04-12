ALTER TABLE `mailboxes` ADD `source` text NOT NULL DEFAULT 'registered';
ALTER TABLE `domains` ADD `catch_all_enabled` integer NOT NULL DEFAULT 0;
ALTER TABLE `domains` ADD `catch_all_owner_user_id` text;
ALTER TABLE `domains` ADD `catch_all_restore_state_json` text;
ALTER TABLE `domains` ADD `catch_all_updated_at` text;
