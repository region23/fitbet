import { db } from "../db";
import { checkinRecommendations, type NewCheckinRecommendation } from "../db/schema";
import { eq } from "drizzle-orm";

export const checkinRecommendationService = {
  /**
   * Create a new checkin recommendation
   */
  async create(data: NewCheckinRecommendation) {
    const [recommendation] = await db.insert(checkinRecommendations).values(data).returning();
    return recommendation;
  },

  /**
   * Find recommendation by checkin ID
   */
  async findByCheckinId(checkinId: number) {
    const [recommendation] = await db
      .select()
      .from(checkinRecommendations)
      .where(eq(checkinRecommendations.checkinId, checkinId));

    return recommendation || null;
  },

  /**
   * Find all recommendations for a participant
   */
  async findByParticipantId(participantId: number) {
    return await db
      .select()
      .from(checkinRecommendations)
      .where(eq(checkinRecommendations.participantId, participantId))
      .orderBy(checkinRecommendations.createdAt);
  },
};
