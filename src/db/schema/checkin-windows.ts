import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { challenges } from "./challenges";

export const checkinWindowStatusEnum = ["scheduled", "open", "closed"] as const;
export type CheckinWindowStatus = (typeof checkinWindowStatusEnum)[number];

export const checkinWindows = sqliteTable("checkin_windows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  challengeId: integer("challenge_id").notNull().references(() => challenges.id),

  // Window number (1, 2, 3, ...)
  windowNumber: integer("window_number").notNull(),

  // Timing
  opensAt: integer("opens_at", { mode: "timestamp" }).notNull(),
  closesAt: integer("closes_at", { mode: "timestamp" }).notNull(),
  reminderSentAt: integer("reminder_sent_at", { mode: "timestamp" }),

  // Status
  status: text("status", { enum: checkinWindowStatusEnum }).notNull().default("scheduled"),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type CheckinWindow = typeof checkinWindows.$inferSelect;
export type NewCheckinWindow = typeof checkinWindows.$inferInsert;
