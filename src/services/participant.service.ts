import { eq, and } from "drizzle-orm";
import { db, schema } from "../db";
import type { NewParticipant, ParticipantStatus, Track } from "../db/schema";

export const participantService = {
  async create(data: NewParticipant) {
    const [participant] = await db.insert(schema.participants).values(data).returning();
    return participant;
  },

  async findById(id: number) {
    const [participant] = await db
      .select()
      .from(schema.participants)
      .where(eq(schema.participants.id, id));
    return participant;
  },

  async findByUserAndChallenge(userId: number, challengeId: number) {
    const [participant] = await db
      .select()
      .from(schema.participants)
      .where(
        and(
          eq(schema.participants.userId, userId),
          eq(schema.participants.challengeId, challengeId)
        )
      );
    return participant;
  },

  async findByChallengeId(challengeId: number) {
    return db
      .select()
      .from(schema.participants)
      .where(eq(schema.participants.challengeId, challengeId));
  },

  async findActiveByChallenge(challengeId: number) {
    return db
      .select()
      .from(schema.participants)
      .where(
        and(
          eq(schema.participants.challengeId, challengeId),
          eq(schema.participants.status, "active")
        )
      );
  },

  async updateStatus(id: number, status: ParticipantStatus) {
    const [updated] = await db
      .update(schema.participants)
      .set({ status })
      .where(eq(schema.participants.id, id))
      .returning();
    return updated;
  },

  async updateOnboardingData(
    id: number,
    data: {
      track?: Track | null;
      startWeight?: number | null;
      startWaist?: number | null;
      height?: number | null;
      startPhotoFrontId?: string | null;
      startPhotoLeftId?: string | null;
      startPhotoRightId?: string | null;
      startPhotoBackId?: string | null;
    }
  ) {
    // Convert undefined to null for database update
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      updateData[key] = value === undefined ? null : value;
    }

    const [updated] = await db
      .update(schema.participants)
      .set(updateData)
      .where(eq(schema.participants.id, id))
      .returning();
    return updated;
  },

  async completeOnboarding(id: number) {
    const [updated] = await db
      .update(schema.participants)
      .set({
        status: "pending_payment",
        onboardingCompletedAt: new Date(),
      })
      .where(eq(schema.participants.id, id))
      .returning();
    return updated;
  },

  async incrementCheckins(id: number, completed: boolean) {
    const participant = await this.findById(id);
    if (!participant) return null;

    const updates: Partial<typeof schema.participants.$inferInsert> = {
      totalCheckins: participant.totalCheckins + 1,
    };

    if (completed) {
      updates.completedCheckins = participant.completedCheckins + 1;
    } else {
      updates.skippedCheckins = participant.skippedCheckins + 1;
    }

    const [updated] = await db
      .update(schema.participants)
      .set(updates)
      .where(eq(schema.participants.id, id))
      .returning();
    return updated;
  },

  async getOnboardingParticipant(userId: number) {
    // Find a participant in onboarding status for this user
    const [participant] = await db
      .select()
      .from(schema.participants)
      .where(
        and(
          eq(schema.participants.userId, userId),
          eq(schema.participants.status, "onboarding")
        )
      );
    return participant;
  },
};
