import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { checkins } from "./checkins";
import { participants } from "./participants";

export const checkinRecommendations = sqliteTable("checkin_recommendations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  checkinId: integer("checkin_id")
    .notNull()
    .references(() => checkins.id),
  participantId: integer("participant_id")
    .notNull()
    .references(() => participants.id),

  // LLM-generated content
  progressAssessment: text("progress_assessment").notNull(),
  bodyCompositionNotes: text("body_composition_notes").notNull(),
  nutritionAdvice: text("nutrition_advice").notNull(),
  trainingAdvice: text("training_advice").notNull(),
  motivationalMessage: text("motivational_message").notNull(),
  warningFlags: text("warning_flags"), // JSON array of warnings

  // Metrics
  llmModel: text("llm_model").notNull(),
  tokensUsed: integer("tokens_used"),
  processingTimeMs: integer("processing_time_ms"),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type CheckinRecommendation = typeof checkinRecommendations.$inferSelect;
export type NewCheckinRecommendation = typeof checkinRecommendations.$inferInsert;
