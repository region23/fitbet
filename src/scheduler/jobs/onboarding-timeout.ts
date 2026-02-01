import type { Bot } from "grammy";
import type { BotContext } from "../../types";
import { challengeService, participantService } from "../../services";

const ONBOARDING_TIMEOUT_HOURS = 48;

export async function runOnboardingTimeoutJob(bot: Bot<BotContext>) {
  const cutoff = new Date(Date.now() - ONBOARDING_TIMEOUT_HOURS * 60 * 60 * 1000);
  const staleParticipants = await participantService.findOnboardingOlderThan(cutoff);

  for (const participant of staleParticipants) {
    try {
      await participantService.updateStatus(participant.id, "dropped");

      const challenge = await challengeService.findById(participant.challengeId);
      const name =
        participant.firstName || participant.username || `User ${participant.userId}`;

      if (challenge) {
        await bot.api.sendMessage(
          challenge.chatId,
          `⚠️ ${name} не завершил онбординг за 48 часов и исключён из челленджа.`
        );
      }

      try {
        await bot.api.sendMessage(
          participant.userId,
          `⚠️ *Онбординг завершить не удалось*\n\n` +
            `Вы не завершили онбординг за 48 часов и были исключены из челленджа.\n` +
            `Если хотите участвовать, нажмите "Участвовать" в групповом чате снова.`,
          { parse_mode: "Markdown" }
        );
      } catch (e) {
        // User may have blocked the bot
      }
    } catch (error) {
      console.error(
        `Error excluding onboarding participant ${participant.id}:`,
        error
      );
    }
  }
}
