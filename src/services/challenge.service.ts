import { eq, and, notInArray } from "drizzle-orm";
import { db, schema } from "../db";
import type { NewChallenge, ChallengeStatus } from "../db/schema";
import { addDuration } from "../utils/duration";
import { config } from "../config";

export const challengeService = {
  async create(data: NewChallenge) {
    const [challenge] = await db.insert(schema.challenges).values(data).returning();
    return challenge;
  },

  async findById(id: number) {
    const [challenge] = await db
      .select()
      .from(schema.challenges)
      .where(eq(schema.challenges.id, id));
    return challenge;
  },

  async findByChatId(chatId: number) {
    const [challenge] = await db
      .select()
      .from(schema.challenges)
      .where(eq(schema.challenges.chatId, chatId));
    return challenge;
  },

  async findActiveByChatId(chatId: number) {
    const [challenge] = await db
      .select()
      .from(schema.challenges)
      .where(
        and(
          eq(schema.challenges.chatId, chatId),
          eq(schema.challenges.status, "active")
        )
      );
    return challenge;
  },

  async findOngoingByChatId(chatId: number) {
    // Returns challenge that is not completed or cancelled
    const [challenge] = await db
      .select()
      .from(schema.challenges)
      .where(
        and(
          eq(schema.challenges.chatId, chatId),
          notInArray(schema.challenges.status, ["completed", "cancelled"])
        )
      );
    return challenge;
  },

  async updateStatus(id: number, status: ChallengeStatus) {
    const [updated] = await db
      .update(schema.challenges)
      .set({ status })
      .where(eq(schema.challenges.id, id))
      .returning();
    return updated;
  },

  async setBankHolder(id: number, userId: number, username: string | undefined) {
    const [updated] = await db
      .update(schema.challenges)
      .set({
        bankHolderId: userId,
        bankHolderUsername: username,
      })
      .where(eq(schema.challenges.id, id))
      .returning();
    return updated;
  },

  async activate(id: number) {
    const now = new Date();
    const challenge = await this.findById(id);
    if (!challenge) return null;

    const endsAt = addDuration(now, challenge.durationMonths, config.challengeDurationUnit);

    const [updated] = await db
      .update(schema.challenges)
      .set({
        status: "active",
        startedAt: now,
        endsAt,
      })
      .where(eq(schema.challenges.id, id))
      .returning();
    return updated;
  },

  async getAllActive() {
    return db
      .select()
      .from(schema.challenges)
      .where(eq(schema.challenges.status, "active"));
  },
};
