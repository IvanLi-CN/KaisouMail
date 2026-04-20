ALTER TABLE `subdomains` ADD COLUMN `cleanup_lease_owner` text;
ALTER TABLE `subdomains` ADD COLUMN `cleanup_lease_until` text;
CREATE INDEX `subdomains_cleanup_lease_idx` ON `subdomains` (`cleanup_lease_until`,`cleanup_lease_owner`);
