import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { NewGoal } from "../db/schema";

export const goalService = {
  async create(data: NewGoal) {
    const [goal] = await db.insert(schema.goals).values(data).returning();
    return goal;
  },

  async findById(id: number) {
    const [goal] = await db.select().from(schema.goals).where(eq(schema.goals.id, id));
    return goal;
  },

  async findByParticipantId(participantId: number) {
    const [goal] = await db
      .select()
      .from(schema.goals)
      .where(eq(schema.goals.participantId, participantId));
    return goal;
  },

  async updateValidation(
    id: number,
    validation: {
      isValidated: boolean;
      validationResult: string;
      validationFeedback: string;
    }
  ) {
    const [updated] = await db
      .update(schema.goals)
      .set({
        ...validation,
        validatedAt: new Date(),
      })
      .where(eq(schema.goals.id, id))
      .returning();
    return updated;
  },

  async updateTargets(
    id: number,
    targets: { targetWeight?: number; targetWaist?: number }
  ) {
    const [updated] = await db
      .update(schema.goals)
      .set({
        ...targets,
        updatedAt: new Date(),
      })
      .where(eq(schema.goals.id, id))
      .returning();
    return updated;
  },
};
