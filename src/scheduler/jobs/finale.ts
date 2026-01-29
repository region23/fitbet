import type { Bot } from "grammy";
import type { BotContext } from "../../types";
import {
  challengeService,
  participantService,
  scoringService,
} from "../../services";

export async function runFinaleJob(bot: Bot<BotContext>) {
  const now = new Date();
  const activeChallenges = await challengeService.getAllActive();

  for (const challenge of activeChallenges) {
    try {
      // Check if challenge has ended
      if (!challenge.endsAt || challenge.endsAt > now) {
        continue;
      }

      // Calculate scores
      const scores = await scoringService.calculateScores(challenge);

      // Update challenge status
      await challengeService.updateStatus(challenge.id, "completed");

      // Mark all active participants as completed
      const participants = await participantService.findActiveByChallenge(
        challenge.id
      );
      for (const p of participants) {
        await participantService.updateStatus(p.id, "completed");
      }

      // Format and send results
      const resultsMessage = scoringService.formatResults(challenge, scores);

      await bot.api.sendMessage(challenge.chatId, resultsMessage, {
        parse_mode: "Markdown",
      });

      // Notify each participant privately
      for (const score of scores) {
        const personalMessage = formatPersonalResults(challenge, score);

        try {
          await bot.api.sendMessage(score.participant.userId, personalMessage, {
            parse_mode: "Markdown",
          });
        } catch (e) {
          console.error(
            `Failed to send finale to user ${score.participant.userId}:`,
            e
          );
        }
      }

      console.log(`Completed finale for challenge ${challenge.id}`);
    } catch (e) {
      console.error(`Error running finale for challenge ${challenge.id}:`, e);
    }
  }
}

function formatPersonalResults(
  challenge: { chatTitle: string | null; stakeAmount: number },
  score: {
    participant: { startWeight: number | null; startWaist: number | null };
    goal: { targetWeight: number | null; targetWaist: number | null } | null;
    goalAchievement: number;
    disciplineScore: number;
    totalScore: number;
    isWinner: boolean;
    prizeShare: number;
  }
): string {
  let message = `🏁 *Челлендж "${challenge.chatTitle}" завершён!*\n\n`;

  message += `*Ваши результаты:*\n`;
  message += `• Достижение цели: ${score.goalAchievement.toFixed(1)}%\n`;
  message += `• Дисциплина: ${score.disciplineScore.toFixed(1)}%\n`;
  message += `• Итоговый балл: ${score.totalScore.toFixed(1)}%\n\n`;

  if (score.isWinner) {
    if (score.prizeShare > 0) {
      const prize = score.prizeShare * challenge.stakeAmount;
      message += `🎉 *Поздравляем, вы победили!*\n`;
      message += `💰 Ваш выигрыш: ${prize.toFixed(0)}₽\n\n`;
      message += `Свяжитесь с Bank Holder для получения выигрыша.`;
    } else {
      message += `🎉 *Поздравляем, вы достигли цели!*\n`;
      message += `Все участники справились, ставки возвращаются.`;
    }
  } else {
    message += `😔 К сожалению, цель не достигнута.\n`;
    message += `Ваша ставка ${challenge.stakeAmount}₽ переходит победителям.\n\n`;
    message += `Не сдавайтесь! В следующий раз обязательно получится.`;
  }

  return message;
}
