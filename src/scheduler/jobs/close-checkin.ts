import type { Bot } from "grammy";
import type { BotContext } from "../../types";
import {
  checkinService,
  challengeService,
  participantService,
} from "../../services";

export async function runCloseCheckinJob(bot: Bot<BotContext>) {
  const now = new Date();
  const windowsToClose = await checkinService.getWindowsDueToClose(now);

  for (const window of windowsToClose) {
    try {
      const challenge = await challengeService.findById(window.challengeId);
      if (!challenge) continue;

      // Close the window
      await checkinService.updateWindowStatus(window.id, "closed");

      // Get participants who haven't submitted
      const participants = await participantService.findActiveByChallenge(
        challenge.id
      );
      const checkins = await checkinService.getCheckinsByWindow(window.id);
      const submittedIds = new Set(checkins.map((c) => c.participantId));

      const submitted = participants.filter((p) => submittedIds.has(p.id));
      const missing = participants.filter((p) => !submittedIds.has(p.id));

      // Update discipline for missing participants
      for (const p of missing) {
        const updated = await participantService.incrementCheckins(p.id, false);

        // Check if participant should be disqualified
        if (updated && updated.skippedCheckins > challenge.maxSkips) {
          await participantService.updateStatus(p.id, "disqualified");

          try {
            await bot.api.sendMessage(
              p.userId,
              `❌ *Вы дисквалифицированы*\n\n` +
                `Вы пропустили слишком много чек-инов (${updated.skippedCheckins}/${challenge.maxSkips} допустимых).\n` +
                `К сожалению, вы выбываете из челленджа "${challenge.chatTitle}".`,
              { parse_mode: "Markdown" }
            );
          } catch (e) {
            // User may have blocked the bot
          }
        }
      }

      // Post summary to group
      let message = `📋 *Чек-ин #${window.windowNumber} закрыт*\n\n`;

      if (submitted.length > 0) {
        message += `✅ Сдали (${submitted.length}):\n`;
        for (const p of submitted) {
          const name = p.firstName || p.username || `User ${p.userId}`;
          message += `• ${name}\n`;
        }
      }

      if (missing.length > 0) {
        message += `\n❌ Пропустили (${missing.length}):\n`;
        for (const p of missing) {
          const name = p.firstName || p.username || `User ${p.userId}`;
          const updated = await participantService.findById(p.id);
          const skipInfo =
            updated?.status === "disqualified"
              ? " — дисквалифицирован"
              : ` — пропуск ${updated?.skippedCheckins}/${challenge.maxSkips}`;
          message += `• ${name}${skipInfo}\n`;
        }
      }

      await bot.api.sendMessage(challenge.chatId, message, {
        parse_mode: "Markdown",
      });

      console.log(
        `Closed check-in window #${window.windowNumber}: ${submitted.length} submitted, ${missing.length} missed`
      );
    } catch (e) {
      console.error(`Error closing check-in window ${window.id}:`, e);
    }
  }
}
