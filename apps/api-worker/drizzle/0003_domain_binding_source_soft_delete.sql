ALTER TABLE `domains` ADD COLUMN `binding_source` text NOT NULL DEFAULT 'catalog';
ALTER TABLE `domains` ADD COLUMN `deleted_at` text;
DROP INDEX IF EXISTS `domains_status_idx`;
CREATE INDEX `domains_status_idx` ON `domains` (`deleted_at`, `status`, `root_domain`);
