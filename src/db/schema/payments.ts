import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { participants } from "./participants";

export const paymentStatusEnum = ["pending", "marked_paid", "confirmed", "refunded"] as const;
export type PaymentStatus = (typeof paymentStatusEnum)[number];

export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  participantId: integer("participant_id").notNull().references(() => participants.id),

  // Status
  status: text("status", { enum: paymentStatusEnum }).notNull().default("pending"),

  // Tracking
  markedPaidAt: integer("marked_paid_at", { mode: "timestamp" }),
  confirmedAt: integer("confirmed_at", { mode: "timestamp" }),
  confirmedBy: integer("confirmed_by"), // Bank Holder user ID

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
