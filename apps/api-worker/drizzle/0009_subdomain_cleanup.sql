ALTER TABLE `subdomains` ADD COLUMN `cleanup_next_attempt_at` text;
ALTER TABLE `subdomains` ADD COLUMN `cleanup_last_error` text;
CREATE INDEX `subdomains_cleanup_idx` ON `subdomains` (`cleanup_next_attempt_at`,`last_used_at`);
CREATE INDEX `mailboxes_domain_subdomain_status_idx` ON `mailboxes` (`domain_id`,`subdomain`,`status`);
