-- Add pending check-in handoff columns
ALTER TABLE `participants` ADD COLUMN `pending_checkin_window_id` integer;
ALTER TABLE `participants` ADD COLUMN `pending_checkin_requested_at` integer;

-- Prevent duplicate check-ins per participant per window
CREATE UNIQUE INDEX `checkins_participant_window_unique` ON `checkins` (`participant_id`, `window_id`);
