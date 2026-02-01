import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { BotContext } from "../../types";
import {
  bankHolderService,
  challengeService,
  participantService,
  paymentService,
} from "../../services";
import { selectBankHolderWinner } from "../../services/bankholder-election";

const ELECTION_TIMEOUT_HOURS = 24;

export async function runBankHolderElectionTimeoutJob(bot: Bot<BotContext>) {
  const cutoff = new Date(Date.now() - ELECTION_TIMEOUT_HOURS * 60 * 60 * 1000);
  const elections = await bankHolderService.getInProgressBefore(cutoff);

  for (const election of elections) {
    try {
      const challenge = await challengeService.findById(election.challengeId);
      if (!challenge) {
        await bankHolderService.completeElection(election.id);
        continue;
      }

      if (challenge.bankHolderId) {
        await bankHolderService.completeElection(election.id);
        continue;
      }

      const participants = await participantService.findByChallengeId(challenge.id);
      const eligible = participants.filter((p) => p.status !== "onboarding");

      const votes = await bankHolderService.getVotes(election.id);
      const result = selectBankHolderWinner(eligible, votes, challenge.creatorId);

      if (!result) {
        await bankHolderService.completeElection(election.id);
        await bot.api.sendMessage(
          challenge.chatId,
          "⚠️ Голосование завершено по таймауту, но кандидаты не найдены. Запустите голосование снова."
        );
        continue;
      }

      const { winnerId, maxVotes } = result;
      const winner = await participantService.findByUserAndChallenge(
        winnerId,
        challenge.id
      );

      if (!winner) {
        await bankHolderService.completeElection(election.id);
        await bot.api.sendMessage(
          challenge.chatId,
          "⚠️ Ошибка: победитель голосования не найден. Запустите голосование снова."
        );
        continue;
      }

      await challengeService.setBankHolder(
        challenge.id,
        winnerId,
        winner.username || undefined
      );

      await challengeService.updateStatus(challenge.id, "pending_payments");
      await bankHolderService.completeElection(election.id);

      const winnerName = winner.firstName || winner.username || `User ${winnerId}`;

      await bot.api.sendMessage(
        challenge.chatId,
        `🏆 *Голосование завершено по таймауту (24 часа)!*\n\n` +
          `Bank Holder: ${winnerName}\n` +
          `Голосов: ${maxVotes} из ${votes.length}\n\n` +
          `${winnerName} будет получать оплаты и подтверждать их.`,
        { parse_mode: "Markdown" }
      );

      try {
        await bot.api.sendMessage(
          winnerId,
          `🏦 *Вы выбраны Bank Holder!*\n\n` +
            `Челлендж: ${challenge.chatTitle}\n\n` +
            `Вы будете получать оплаты от участников (${challenge.stakeAmount}₽).\n\n` +
            `Когда участник отметит оплату, вы получите уведомление для подтверждения.`,
          { parse_mode: "Markdown" }
        );
      } catch (e) {
        // User may have blocked the bot
      }

      for (const participant of participants) {
        if (participant.status === "pending_payment") {
          const paidKeyboard = new InlineKeyboard().text(
            "💳 Я оплатил",
            `paid_${participant.id}`
          );

          try {
            await bot.api.sendMessage(
              participant.userId,
              `💰 *Пора оплатить ставку*\n\n` +
                `Bank Holder: ${winnerName}\n` +
                `Сумма: ${challenge.stakeAmount}₽\n\n` +
                `Переведите деньги Bank Holder'у и нажмите кнопку ниже.\n` +
                `После подтверждения оплаты челлендж начнётся.`,
              {
                reply_markup: paidKeyboard,
                parse_mode: "Markdown",
              }
            );
          } catch (e) {
            // User may have blocked the bot
          }
        }
      }

      const pendingPayments = await paymentService.getPendingConfirmations(
        challenge.id
      );

      if (pendingPayments.length > 0) {
        for (const { participant } of pendingPayments) {
          const pName =
            participant.firstName ||
            participant.username ||
            `User ${participant.userId}`;
          const confirmKeyboard = new InlineKeyboard().text(
            "✅ Подтвердить оплату",
            `confirm_${participant.id}`
          );

          try {
            await bot.api.sendMessage(
              winnerId,
              `💳 *Ожидает подтверждения:*\n\n` +
                `Участник: ${pName}\n` +
                `Сумма: ${challenge.stakeAmount}₽`,
              {
                reply_markup: confirmKeyboard,
                parse_mode: "Markdown",
              }
            );
          } catch (e) {
            // User may have blocked the bot
          }
        }
      }
    } catch (error) {
      console.error(
        `Error closing bank holder election ${election.id}:`,
        error
      );
    }
  }
}
