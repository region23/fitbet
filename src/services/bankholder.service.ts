import { eq, and } from "drizzle-orm";
import { db, schema } from "../db";
import type { NewBankHolderElection, ElectionStatus, NewBankHolderVote } from "../db/schema";

export const bankHolderService = {
  async createElection(data: NewBankHolderElection) {
    const [election] = await db
      .insert(schema.bankHolderElections)
      .values(data)
      .returning();
    return election;
  },

  async getElection(id: number) {
    const [election] = await db
      .select()
      .from(schema.bankHolderElections)
      .where(eq(schema.bankHolderElections.id, id));
    return election;
  },

  async getActiveElection(challengeId: number) {
    const [election] = await db
      .select()
      .from(schema.bankHolderElections)
      .where(
        and(
          eq(schema.bankHolderElections.challengeId, challengeId),
          eq(schema.bankHolderElections.status, "in_progress")
        )
      );
    return election;
  },

  async completeElection(electionId: number) {
    const [updated] = await db
      .update(schema.bankHolderElections)
      .set({
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(schema.bankHolderElections.id, electionId))
      .returning();
    return updated;
  },

  async recordVote(data: NewBankHolderVote) {
    const [vote] = await db
      .insert(schema.bankHolderVotes)
      .values(data)
      .returning();
    return vote;
  },

  async getVote(electionId: number, voterId: number) {
    const [vote] = await db
      .select()
      .from(schema.bankHolderVotes)
      .where(
        and(
          eq(schema.bankHolderVotes.electionId, electionId),
          eq(schema.bankHolderVotes.voterId, voterId)
        )
      );
    return vote;
  },

  async getVotes(electionId: number) {
    return db
      .select()
      .from(schema.bankHolderVotes)
      .where(eq(schema.bankHolderVotes.electionId, electionId));
  },
};
