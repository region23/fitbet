import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import type { BotContext } from "../../types";
import {
  checkinService,
  challengeService,
  participantService,
} from "../../services";

export async function runOpenCheckinJob(bot: Bot<BotContext>) {
  const now = new Date();
  const windowsToOpen = await checkinService.getWindowsDueToOpen(now);

  for (const window of windowsToOpen) {
    try {
      const challenge = await challengeService.findById(window.challengeId);
      if (!challenge || challenge.status !== "active") continue;

      // Update window status
      await checkinService.updateWindowStatus(window.id, "open");

      // Notify group chat
      const closeTime = window.closesAt.toLocaleString("ru-RU", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      });

      const checkinKeyboard = new InlineKeyboard().text(
        "📋 Сдать чек-ин",
        `checkin_${window.id}`
      );

      await bot.api.sendMessage(
        challenge.chatId,
        `📢 *Открыто окно чек-ина #${window.windowNumber}!*\n\n` +
          `У вас есть 48 часов чтобы сдать чек-ин.\n` +
          `⏰ Закрытие: ${closeTime}\n\n` +
          `Нажмите кнопку ниже, чтобы начать.`,
        {
          reply_markup: checkinKeyboard,
          parse_mode: "Markdown",
        }
      );

      // Notify each active participant privately
      const participants = await participantService.findActiveByChallenge(
        challenge.id
      );

      for (const p of participants) {
        try {
          await bot.api.sendMessage(
            p.userId,
            `📢 *Открыто окно чек-ина #${window.windowNumber}!*\n\n` +
              `Челлендж: ${challenge.chatTitle}\n` +
              `⏰ Закрытие: ${closeTime}\n\n` +
              `Перейдите в групповой чат и нажмите кнопку "Сдать чек-ин".`,
            { parse_mode: "Markdown" }
          );
        } catch (e) {
          // User may have blocked the bot
          console.error(`Failed to notify user ${p.userId}:`, e);
        }
      }

      console.log(
        `Opened check-in window #${window.windowNumber} for challenge ${challenge.id}`
      );
    } catch (e) {
      console.error(`Error opening check-in window ${window.id}:`, e);
    }
  }
}
