import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const electionStatusEnum = ["in_progress", "completed", "cancelled"] as const;
export type ElectionStatus = (typeof electionStatusEnum)[number];

export const bankHolderElections = sqliteTable("bank_holder_elections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  challengeId: integer("challenge_id").notNull().unique(),
  initiatedBy: integer("initiated_by").notNull(),
  status: text("status", { enum: electionStatusEnum }).notNull().default("in_progress"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

export type BankHolderElection = typeof bankHolderElections.$inferSelect;
export type NewBankHolderElection = typeof bankHolderElections.$inferInsert;
