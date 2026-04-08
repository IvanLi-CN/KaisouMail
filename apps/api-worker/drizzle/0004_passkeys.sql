CREATE TABLE `passkeys` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `credential_id` text NOT NULL,
  `public_key_b64u` text NOT NULL,
  `counter` integer NOT NULL,
  `device_type` text NOT NULL,
  `backed_up` integer NOT NULL,
  `transports_json` text NOT NULL,
  `created_at` text NOT NULL,
  `last_used_at` text,
  `revoked_at` text,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `passkeys_credential_id_unique`
ON `passkeys` (`credential_id`)
WHERE `revoked_at` IS NULL;
CREATE INDEX `passkeys_user_idx` ON `passkeys` (`user_id`);
