import { eq, and } from "drizzle-orm";
import { db, schema } from "../db";
import type { PaymentStatus } from "../db/schema";

export const paymentService = {
  async create(participantId: number) {
    const [payment] = await db
      .insert(schema.payments)
      .values({ participantId })
      .returning();
    return payment;
  },

  async findByParticipantId(participantId: number) {
    const [payment] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.participantId, participantId));
    return payment;
  },

  async markPaid(participantId: number) {
    const [updated] = await db
      .update(schema.payments)
      .set({
        status: "marked_paid",
        markedPaidAt: new Date(),
      })
      .where(eq(schema.payments.participantId, participantId))
      .returning();
    return updated;
  },

  async confirm(participantId: number, confirmedBy: number) {
    const [updated] = await db
      .update(schema.payments)
      .set({
        status: "confirmed",
        confirmedAt: new Date(),
        confirmedBy,
      })
      .where(eq(schema.payments.participantId, participantId))
      .returning();
    return updated;
  },

  async getPendingConfirmations(challengeId: number) {
    // Get all participants with marked_paid status
    const participants = await db
      .select()
      .from(schema.participants)
      .where(
        and(
          eq(schema.participants.challengeId, challengeId),
          eq(schema.participants.status, "payment_marked")
        )
      );

    const results = [];
    for (const p of participants) {
      const [payment] = await db
        .select()
        .from(schema.payments)
        .where(
          and(
            eq(schema.payments.participantId, p.id),
            eq(schema.payments.status, "marked_paid")
          )
        );
      if (payment) {
        results.push({ participant: p, payment });
      }
    }

    return results;
  },

  async areAllPaymentsConfirmed(challengeId: number) {
    const participants = await db
      .select()
      .from(schema.participants)
      .where(eq(schema.participants.challengeId, challengeId));

    for (const p of participants) {
      if (p.status === "onboarding" || p.status === "pending_payment" || p.status === "payment_marked") {
        return false;
      }
    }

    return participants.length > 0;
  },
};
