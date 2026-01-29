import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { participants } from "./participants";

// Predefined commitment templates
export const commitmentTemplates = sqliteTable("commitment_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // "nutrition", "exercise", "lifestyle"
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

// Participant's selected commitments
export const participantCommitments = sqliteTable("participant_commitments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  participantId: integer("participant_id").notNull().references(() => participants.id),
  templateId: integer("template_id").notNull().references(() => commitmentTemplates.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type CommitmentTemplate = typeof commitmentTemplates.$inferSelect;
export type NewCommitmentTemplate = typeof commitmentTemplates.$inferInsert;
export type ParticipantCommitment = typeof participantCommitments.$inferSelect;
export type NewParticipantCommitment = typeof participantCommitments.$inferInsert;
