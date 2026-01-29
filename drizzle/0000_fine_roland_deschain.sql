CREATE TABLE `challenges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` integer NOT NULL,
	`chat_title` text,
	`duration_months` integer DEFAULT 6 NOT NULL,
	`stake_amount` real NOT NULL,
	`discipline_threshold` real DEFAULT 0.8 NOT NULL,
	`max_skips` integer DEFAULT 2 NOT NULL,
	`bank_holder_id` integer,
	`bank_holder_username` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`ends_at` integer
);
--> statement-breakpoint
CREATE TABLE `participants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`challenge_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`username` text,
	`first_name` text,
	`track` text,
	`start_weight` real,
	`start_waist` real,
	`height` real,
	`start_photo_front_id` text,
	`start_photo_profile_id` text,
	`total_checkins` integer DEFAULT 0 NOT NULL,
	`completed_checkins` integer DEFAULT 0 NOT NULL,
	`skipped_checkins` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'onboarding' NOT NULL,
	`joined_at` integer NOT NULL,
	`onboarding_completed_at` integer,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`participant_id` integer NOT NULL,
	`target_weight` real,
	`target_waist` real,
	`is_validated` integer DEFAULT false NOT NULL,
	`validation_result` text,
	`validation_feedback` text,
	`validated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `checkin_windows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`challenge_id` integer NOT NULL,
	`window_number` integer NOT NULL,
	`opens_at` integer NOT NULL,
	`closes_at` integer NOT NULL,
	`reminder_sent_at` integer,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `checkins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`participant_id` integer NOT NULL,
	`window_id` integer NOT NULL,
	`weight` real NOT NULL,
	`waist` real NOT NULL,
	`photo_front_id` text NOT NULL,
	`photo_profile_id` text NOT NULL,
	`submitted_at` integer NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`window_id`) REFERENCES `checkin_windows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `commitment_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `participant_commitments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`participant_id` integer NOT NULL,
	`template_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `commitment_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`participant_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`marked_paid_at` integer,
	`confirmed_at` integer,
	`confirmed_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action
);
