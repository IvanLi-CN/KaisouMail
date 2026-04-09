PRAGMA foreign_keys=OFF;

CREATE TABLE `__new_mailboxes` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `domain_id` text REFERENCES `domains`(`id`) ON UPDATE no action ON DELETE restrict,
  `local_part` text NOT NULL,
  `subdomain` text NOT NULL,
  `address` text NOT NULL,
  `routing_rule_id` text,
  `status` text NOT NULL,
  `created_at` text NOT NULL,
  `expires_at` text,
  `destroyed_at` text,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

INSERT INTO `__new_mailboxes` (
  `id`,
  `user_id`,
  `domain_id`,
  `local_part`,
  `subdomain`,
  `address`,
  `routing_rule_id`,
  `status`,
  `created_at`,
  `expires_at`,
  `destroyed_at`
)
SELECT
  `id`,
  `user_id`,
  `domain_id`,
  `local_part`,
  `subdomain`,
  `address`,
  `routing_rule_id`,
  `status`,
  `created_at`,
  `expires_at`,
  `destroyed_at`
FROM `mailboxes`;

DROP TABLE `mailboxes`;
ALTER TABLE `__new_mailboxes` RENAME TO `mailboxes`;

CREATE UNIQUE INDEX `mailboxes_address_unique`
ON `mailboxes` (`address`)
WHERE `status` != 'destroyed';
CREATE INDEX `mailboxes_user_idx` ON `mailboxes` (`user_id`);
CREATE INDEX `mailboxes_domain_idx` ON `mailboxes` (`domain_id`, `status`);
CREATE INDEX `mailboxes_status_expires_idx` ON `mailboxes` (`status`, `expires_at`);

PRAGMA foreign_keys=ON;
