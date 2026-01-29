import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const challengeStatusEnum = ["draft", "pending_payments", "active", "completed", "cancelled"] as const;
export type ChallengeStatus = (typeof challengeStatusEnum)[number];

export const challenges = sqliteTable("challenges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chatId: integer("chat_id").notNull(),
  chatTitle: text("chat_title"),
  creatorId: integer("creator_id").notNull(),

  // Challenge settings
  durationMonths: integer("duration_months").notNull().default(6), // 6 or 12 months
  stakeAmount: real("stake_amount").notNull(), // in rubles
  disciplineThreshold: real("discipline_threshold").notNull().default(0.8), // 80% default
  maxSkips: integer("max_skips").notNull().default(2),

  // Bank Holder (set after onboarding)
  bankHolderId: integer("bank_holder_id"),
  bankHolderUsername: text("bank_holder_username"),

  // Status
  status: text("status", { enum: challengeStatusEnum }).notNull().default("draft"),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  startedAt: integer("started_at", { mode: "timestamp" }),
  endsAt: integer("ends_at", { mode: "timestamp" }),
});

export type Challenge = typeof challenges.$inferSelect;
export type NewChallenge = typeof challenges.$inferInsert;
