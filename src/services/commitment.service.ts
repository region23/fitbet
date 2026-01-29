import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { NewParticipantCommitment } from "../db/schema";

export const commitmentService = {
  async getAllTemplates() {
    return db
      .select()
      .from(schema.commitmentTemplates)
      .where(eq(schema.commitmentTemplates.isActive, true));
  },

  async getTemplateById(id: number) {
    const [template] = await db
      .select()
      .from(schema.commitmentTemplates)
      .where(eq(schema.commitmentTemplates.id, id));
    return template;
  },

  async getTemplatesByIds(ids: number[]) {
    if (ids.length === 0) return [];
    const templates = await db.select().from(schema.commitmentTemplates);
    return templates.filter((t) => ids.includes(t.id));
  },

  async addParticipantCommitment(data: NewParticipantCommitment) {
    const [commitment] = await db
      .insert(schema.participantCommitments)
      .values(data)
      .returning();
    return commitment;
  },

  async addParticipantCommitments(participantId: number, templateIds: number[]) {
    const commitments = templateIds.map((templateId) => ({
      participantId,
      templateId,
    }));
    await db.insert(schema.participantCommitments).values(commitments);
  },

  async getParticipantCommitments(participantId: number) {
    const commitments = await db
      .select({
        commitment: schema.participantCommitments,
        template: schema.commitmentTemplates,
      })
      .from(schema.participantCommitments)
      .innerJoin(
        schema.commitmentTemplates,
        eq(schema.participantCommitments.templateId, schema.commitmentTemplates.id)
      )
      .where(eq(schema.participantCommitments.participantId, participantId));

    return commitments.map((c) => c.template);
  },
};
