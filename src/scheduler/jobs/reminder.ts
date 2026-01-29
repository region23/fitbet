import type { Bot } from "grammy";
import type { BotContext } from "../../types";
import {
  checkinService,
  challengeService,
  participantService,
} from "../../services";

export async function runReminderJob(bot: Bot<BotContext>) {
  const now = new Date();
  const windowsNeedingReminder = await checkinService.getWindowsNeedingReminder(now);

  for (const window of windowsNeedingReminder) {
    try {
      const challenge = await challengeService.findById(window.challengeId);
      if (!challenge || challenge.status !== "active") continue;

      // Get participants who haven't submitted
      const participants = await participantService.findActiveByChallenge(
        challenge.id
      );
      const checkins = await checkinService.getCheckinsByWindow(window.id);
      const submittedIds = new Set(checkins.map((c) => c.participantId));
      const missing = participants.filter((p) => !submittedIds.has(p.id));

      if (missing.length === 0) {
        // Everyone submitted, just mark reminder as sent
        await checkinService.markReminderSent(window.id);
        continue;
      }

      // Mark reminder as sent
      await checkinService.markReminderSent(window.id);

      const closeTime = window.closesAt.toLocaleString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Notify group
      const missingNames = missing
        .map((p) => p.firstName || p.username || `User ${p.userId}`)
        .join(", ");

      await bot.api.sendMessage(
        challenge.chatId,
        `⏰ *Напоминание о чек-ине #${window.windowNumber}*\n\n` +
          `Осталось 12 часов до закрытия окна!\n` +
          `⏰ Закрытие: сегодня в ${closeTime}\n\n` +
          `❗ Ещё не сдали: ${missingNames}`,
        { parse_mode: "Markdown" }
      );

      // Notify each missing participant
      for (const p of missing) {
        try {
          await bot.api.sendMessage(
            p.userId,
            `⏰ *Напоминание!*\n\n` +
              `Вы ещё не сдали чек-ин #${window.windowNumber}.\n` +
              `До закрытия осталось 12 часов!\n\n` +
              `Перейдите в групповой чат "${challenge.chatTitle}" и сдайте чек-ин.`,
            { parse_mode: "Markdown" }
          );
        } catch (e) {
          console.error(`Failed to remind user ${p.userId}:`, e);
        }
      }

      console.log(
        `Sent reminder for window #${window.windowNumber}, ${missing.length} participants missing`
      );
    } catch (e) {
      console.error(`Error sending reminder for window ${window.id}:`, e);
    }
  }
}
