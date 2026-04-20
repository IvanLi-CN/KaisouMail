CREATE TABLE `domain_cutover_tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `domain_id` text NOT NULL REFERENCES `domains`(`id`) ON DELETE cascade,
  `root_domain` text NOT NULL,
  `requested_by_user_id` text REFERENCES `users`(`id`) ON DELETE set null,
  `action` text NOT NULL,
  `target_mode` text NOT NULL,
  `status` text NOT NULL,
  `phase` text NOT NULL,
  `current_host` text,
  `deleted_count` integer DEFAULT 0 NOT NULL,
  `rebuilt_count` integer DEFAULT 0 NOT NULL,
  `total_count` integer DEFAULT 0 NOT NULL,
  `rollback_phase` text,
  `error` text,
  `created_at` text NOT NULL,
  `started_at` text,
  `updated_at` text NOT NULL,
  `completed_at` text,
  `failed_at` text
);
CREATE INDEX `domain_cutover_tasks_domain_status_idx` ON `domain_cutover_tasks` (`domain_id`,`status`);
CREATE INDEX `domain_cutover_tasks_status_updated_idx` ON `domain_cutover_tasks` (`status`,`updated_at`);
CREATE INDEX `domain_cutover_tasks_root_domain_idx` ON `domain_cutover_tasks` (`root_domain`,`created_at`);
