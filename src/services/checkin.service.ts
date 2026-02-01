import { eq, and, lte, gte } from "drizzle-orm";
import { db, schema } from "../db";
import type { NewCheckin, NewCheckinWindow, CheckinWindowStatus } from "../db/schema";
import { config } from "../config";
import { addDuration } from "../utils/duration";

export const checkinService = {
  // Check-in Window operations
  async createWindow(data: NewCheckinWindow) {
    const [window] = await db.insert(schema.checkinWindows).values(data).returning();
    return window;
  },

  async findWindowById(id: number) {
    const [window] = await db
      .select()
      .from(schema.checkinWindows)
      .where(eq(schema.checkinWindows.id, id));
    return window;
  },

  async findOpenWindowForChallenge(challengeId: number) {
    const [window] = await db
      .select()
      .from(schema.checkinWindows)
      .where(
        and(
          eq(schema.checkinWindows.challengeId, challengeId),
          eq(schema.checkinWindows.status, "open")
        )
      );
    return window;
  },

  async updateWindowStatus(id: number, status: CheckinWindowStatus) {
    const [updated] = await db
      .update(schema.checkinWindows)
      .set({ status })
      .where(eq(schema.checkinWindows.id, id))
      .returning();
    return updated;
  },

  async markReminderSent(id: number) {
    const [updated] = await db
      .update(schema.checkinWindows)
      .set({ reminderSentAt: new Date() })
      .where(eq(schema.checkinWindows.id, id))
      .returning();
    return updated;
  },

  async getWindowsDueToOpen(now: Date) {
    return db
      .select()
      .from(schema.checkinWindows)
      .where(
        and(
          eq(schema.checkinWindows.status, "scheduled"),
          lte(schema.checkinWindows.opensAt, now)
        )
      );
  },

  async getWindowsDueToClose(now: Date) {
    return db
      .select()
      .from(schema.checkinWindows)
      .where(
        and(
          eq(schema.checkinWindows.status, "open"),
          lte(schema.checkinWindows.closesAt, now)
        )
      );
  },

  async getWindowsNeedingReminder(now: Date) {
    // Windows that are open, reminder not sent, and within reminder window
    const reminderThreshold = new Date(now);
    reminderThreshold.setHours(
      reminderThreshold.getHours() + config.reminderHoursBeforeClose
    );

    const windows = await db
      .select()
      .from(schema.checkinWindows)
      .where(eq(schema.checkinWindows.status, "open"));

    // Filter for windows where close time is within reminder threshold
    // and reminder hasn't been sent
    return windows.filter(
      (w) => !w.reminderSentAt && w.closesAt <= reminderThreshold
    );
  },

  // Create scheduled windows for a challenge
  async scheduleWindowsForChallenge(
    challengeId: number,
    startDate: Date,
    durationMonths: number
  ) {
    const periodMs =
      config.checkinPeriodMinutes > 0
        ? config.checkinPeriodMinutes * 60 * 1000
        : (config.checkinPeriodDays > 0 ? config.checkinPeriodDays : 14) *
          24 *
          60 *
          60 *
          1000;

    if (periodMs <= 0) {
      throw new Error("Invalid check-in period configuration");
    }

    const windows: NewCheckinWindow[] = [];

    const endDate = addDuration(startDate, durationMonths, config.challengeDurationUnit);

    let windowNumber = 1;
    let opensAt = new Date(startDate.getTime() + periodMs);

    while (opensAt <= endDate) {
      const closesAt = new Date(opensAt);
      closesAt.setHours(closesAt.getHours() + config.checkinWindowHours);

      windows.push({
        challengeId,
        windowNumber,
        opensAt,
        closesAt,
        status: "scheduled",
      });

      windowNumber += 1;
      opensAt = new Date(opensAt.getTime() + periodMs);
    }

    await db.insert(schema.checkinWindows).values(windows);
    return windows;
  },

  // Check-in operations
  async createCheckin(data: NewCheckin) {
    const [checkin] = await db
      .insert(schema.checkins)
      .values(data)
      .onConflictDoNothing()
      .returning();
    return checkin || null;
  },

  async findCheckinByParticipantAndWindow(participantId: number, windowId: number) {
    const [checkin] = await db
      .select()
      .from(schema.checkins)
      .where(
        and(
          eq(schema.checkins.participantId, participantId),
          eq(schema.checkins.windowId, windowId)
        )
      );
    return checkin;
  },

  async getCheckinsByWindow(windowId: number) {
    return db
      .select()
      .from(schema.checkins)
      .where(eq(schema.checkins.windowId, windowId));
  },

  async getCheckinsByParticipant(participantId: number) {
    return db
      .select()
      .from(schema.checkins)
      .where(eq(schema.checkins.participantId, participantId));
  },
};
