CREATE TABLE `tags` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `tags_user_name_unique` ON `tags` (`user_id`, `name`);
CREATE INDEX `tags_user_idx` ON `tags` (`user_id`, `name`);

CREATE TABLE `mailbox_tags` (
  `mailbox_id` text NOT NULL,
  `tag_id` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`mailbox_id`, `tag_id`),
  FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `mailbox_tags_tag_idx` ON `mailbox_tags` (`tag_id`, `mailbox_id`);
CREATE INDEX `mailbox_tags_mailbox_idx` ON `mailbox_tags` (`mailbox_id`);

INSERT OR IGNORE INTO `tags` (`id`, `user_id`, `name`, `created_at`, `updated_at`)
SELECT
  'tag_' || lower(hex(randomblob(12))),
  `mailboxes`.`user_id`,
  lower(trim(`tag_values`.`value`)),
  `mailboxes`.`created_at`,
  `mailboxes`.`created_at`
FROM `mailboxes`, json_each(`mailboxes`.`tags_json`) AS `tag_values`
WHERE json_valid(`mailboxes`.`tags_json`)
  AND typeof(`tag_values`.`value`) = 'text'
  AND lower(trim(`tag_values`.`value`)) NOT GLOB '*[^a-z0-9_-]*'
  AND length(lower(trim(`tag_values`.`value`))) BETWEEN 1 AND 32;

INSERT OR IGNORE INTO `mailbox_tags` (`mailbox_id`, `tag_id`, `created_at`)
SELECT
  `mailboxes`.`id`,
  `tags`.`id`,
  `mailboxes`.`created_at`
FROM `mailboxes`, json_each(`mailboxes`.`tags_json`) AS `tag_values`
INNER JOIN `tags`
  ON `tags`.`user_id` = `mailboxes`.`user_id`
  AND `tags`.`name` = lower(trim(`tag_values`.`value`))
WHERE json_valid(`mailboxes`.`tags_json`)
  AND typeof(`tag_values`.`value`) = 'text'
  AND lower(trim(`tag_values`.`value`)) NOT GLOB '*[^a-z0-9_-]*'
  AND length(lower(trim(`tag_values`.`value`))) BETWEEN 1 AND 32;
