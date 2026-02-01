import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { challenges } from "./challenges";

export const trackEnum = ["cut", "bulk"] as const;
export type Track = (typeof trackEnum)[number];

export const participantStatusEnum = [
  "onboarding",           // Started onboarding but not complete
  "pending_payment",      // Onboarding complete, waiting for payment
  "payment_marked",       // Marked as paid, waiting for Bank Holder confirmation
  "active",               // Payment confirmed, actively participating
  "dropped",              // Dropped out during challenge
  "disqualified",         // Too many skips
  "completed",            // Finished the challenge
] as const;
export type ParticipantStatus = (typeof participantStatusEnum)[number];

export const participants = sqliteTable("participants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  challengeId: integer("challenge_id").notNull().references(() => challenges.id),
  userId: integer("user_id").notNull(),
  username: text("username"),
  firstName: text("first_name"),

  // Track
  track: text("track", { enum: trackEnum }),

  // Starting metrics
  startWeight: real("start_weight"),           // kg
  startWaist: real("start_waist"),             // cm
  height: real("height"),                       // cm

  // Starting photos (4 angles) - Telegram file_ids
  startPhotoFrontId: text("start_photo_front_id"),     // анфас
  startPhotoLeftId: text("start_photo_left_id"),       // профиль слева
  startPhotoRightId: text("start_photo_right_id"),     // профиль справа
  startPhotoBackId: text("start_photo_back_id"),       // со спины

  // Discipline tracking
  totalCheckins: integer("total_checkins").notNull().default(0),
  completedCheckins: integer("completed_checkins").notNull().default(0),
  skippedCheckins: integer("skipped_checkins").notNull().default(0),

  // Pending check-in handoff (from group to private chat)
  pendingCheckinWindowId: integer("pending_checkin_window_id"),
  pendingCheckinRequestedAt: integer("pending_checkin_requested_at", { mode: "timestamp" }),

  // Status
  status: text("status", { enum: participantStatusEnum }).notNull().default("onboarding"),

  // Timestamps
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  onboardingCompletedAt: integer("onboarding_completed_at", { mode: "timestamp" }),
});

export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;
