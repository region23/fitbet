-- Add missing pending check-in requested timestamp
ALTER TABLE `participants` ADD COLUMN `pending_checkin_requested_at` integer;
--> statement-breakpoint
-- Ensure unique check-ins per participant per window
CREATE UNIQUE INDEX IF NOT EXISTS `checkins_participant_window_unique` ON `checkins` (`participant_id`, `window_id`);
