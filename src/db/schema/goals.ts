import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { participants } from "./participants";

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  participantId: integer("participant_id").notNull().references(() => participants.id),

  // Target metrics
  targetWeight: real("target_weight"),         // kg
  targetWaist: real("target_waist"),           // cm

  // LLM validation
  isValidated: integer("is_validated", { mode: "boolean" }).notNull().default(false),
  validationResult: text("validation_result"), // "realistic", "too_aggressive", "too_easy"
  validationFeedback: text("validation_feedback"), // LLM explanation
  validatedAt: integer("validated_at", { mode: "timestamp" }),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
