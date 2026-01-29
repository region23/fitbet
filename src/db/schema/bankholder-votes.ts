import { sqliteTable, integer } from "drizzle-orm/sqlite-core";

export const bankHolderVotes = sqliteTable("bank_holder_votes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  electionId: integer("election_id").notNull(),
  voterId: integer("voter_id").notNull(),
  votedForId: integer("voted_for_id").notNull(),
  votedAt: integer("voted_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type BankHolderVote = typeof bankHolderVotes.$inferSelect;
export type NewBankHolderVote = typeof bankHolderVotes.$inferInsert;
