ALTER TABLE `registration_settings` ADD COLUMN `github_client_id` text NOT NULL DEFAULT '';
ALTER TABLE `registration_settings` ADD COLUMN `github_client_secret` text NOT NULL DEFAULT '';
ALTER TABLE `registration_settings` ADD COLUMN `github_oauth_scopes` text NOT NULL DEFAULT 'read:user';
ALTER TABLE `registration_settings` ADD COLUMN `linuxdo_client_id` text NOT NULL DEFAULT '';
ALTER TABLE `registration_settings` ADD COLUMN `linuxdo_client_secret` text NOT NULL DEFAULT '';
ALTER TABLE `registration_settings` ADD COLUMN `linuxdo_oauth_base_url` text NOT NULL DEFAULT 'https://connect.linux.do';
