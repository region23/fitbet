-- Create checkin_recommendations table
CREATE TABLE `checkin_recommendations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `checkin_id` integer NOT NULL,
  `participant_id` integer NOT NULL,
  `progress_assessment` text NOT NULL,
  `body_composition_notes` text NOT NULL,
  `nutrition_advice` text NOT NULL,
  `training_advice` text NOT NULL,
  `motivational_message` text NOT NULL,
  `warning_flags` text,
  `llm_model` text NOT NULL,
  `tokens_used` integer,
  `processing_time_ms` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`checkin_id`) REFERENCES `checkins`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action
);
