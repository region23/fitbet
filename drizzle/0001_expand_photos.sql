-- Add new photo columns to participants table (4 angles instead of 2)
-- Rename start_photo_profile_id to start_photo_left_id
ALTER TABLE `participants` RENAME COLUMN `start_photo_profile_id` TO `start_photo_left_id`;
--> statement-breakpoint
-- Add start_photo_right_id column
ALTER TABLE `participants` ADD COLUMN `start_photo_right_id` text;
--> statement-breakpoint
-- Add start_photo_back_id column
ALTER TABLE `participants` ADD COLUMN `start_photo_back_id` text;
--> statement-breakpoint
-- Add new photo columns to checkins table (4 angles instead of 2)
-- Rename photo_profile_id to photo_left_id
ALTER TABLE `checkins` RENAME COLUMN `photo_profile_id` TO `photo_left_id`;
--> statement-breakpoint
-- Add photo_right_id column
ALTER TABLE `checkins` ADD COLUMN `photo_right_id` text NOT NULL DEFAULT '';
--> statement-breakpoint
-- Add photo_back_id column
ALTER TABLE `checkins` ADD COLUMN `photo_back_id` text NOT NULL DEFAULT '';
