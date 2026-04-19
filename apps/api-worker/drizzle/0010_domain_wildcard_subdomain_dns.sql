ALTER TABLE `domains` ADD COLUMN `subdomain_dns_mode` text NOT NULL DEFAULT 'explicit';
ALTER TABLE `domains` ADD COLUMN `wildcard_dns_verified_at` text;
ALTER TABLE `domains` ADD COLUMN `wildcard_dns_last_error` text;
