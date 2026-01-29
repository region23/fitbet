-- Add creator_id to challenges table
ALTER TABLE `challenges` ADD COLUMN `creator_id` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Create bank_holder_elections table
CREATE TABLE `bank_holder_elections` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `challenge_id` integer NOT NULL UNIQUE,
  `initiated_by` integer NOT NULL,
  `status` text DEFAULT 'in_progress' NOT NULL,
  `created_at` integer NOT NULL,
  `completed_at` integer
);
--> statement-breakpoint
-- Create bank_holder_votes table
CREATE TABLE `bank_holder_votes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `election_id` integer NOT NULL,
  `voter_id` integer NOT NULL,
  `voted_for_id` integer NOT NULL,
  `voted_at` integer NOT NULL
);
