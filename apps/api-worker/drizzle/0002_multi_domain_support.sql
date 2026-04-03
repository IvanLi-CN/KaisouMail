CREATE TABLE `domains` (
  `id` text PRIMARY KEY NOT NULL,
  `root_domain` text NOT NULL,
  `zone_id` text,
  `status` text NOT NULL,
  `last_provision_error` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `last_provisioned_at` text,
  `disabled_at` text
);
CREATE UNIQUE INDEX `domains_root_domain_unique` ON `domains` (`root_domain`);
CREATE INDEX `domains_status_idx` ON `domains` (`status`, `root_domain`);

ALTER TABLE `subdomains` ADD COLUMN `domain_id` text REFERENCES `domains`(`id`) ON UPDATE no action ON DELETE restrict;
DROP INDEX IF EXISTS `subdomains_name_unique`;
CREATE UNIQUE INDEX `subdomains_domain_name_unique` ON `subdomains` (`domain_id`, `name`);
CREATE INDEX `subdomains_domain_idx` ON `subdomains` (`domain_id`);

ALTER TABLE `mailboxes` ADD COLUMN `domain_id` text REFERENCES `domains`(`id`) ON UPDATE no action ON DELETE restrict;
CREATE INDEX `mailboxes_domain_idx` ON `mailboxes` (`domain_id`, `status`);
