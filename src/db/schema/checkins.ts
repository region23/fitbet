import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { participants } from "./participants";
import { checkinWindows } from "./checkin-windows";

export const checkins = sqliteTable("checkins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  participantId: integer("participant_id").notNull().references(() => participants.id),
  windowId: integer("window_id").notNull().references(() => checkinWindows.id),

  // Metrics
  weight: real("weight").notNull(),            // kg
  waist: real("waist").notNull(),              // cm

  // Photos (4 angles) - Telegram file_ids
  photoFrontId: text("photo_front_id").notNull(),     // анфас
  photoLeftId: text("photo_left_id").notNull(),       // профиль слева
  photoRightId: text("photo_right_id").notNull(),     // профиль справа
  photoBackId: text("photo_back_id").notNull(),       // со спины

  // Timestamps
  submittedAt: integer("submitted_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type Checkin = typeof checkins.$inferSelect;
export type NewCheckin = typeof checkins.$inferInsert;
