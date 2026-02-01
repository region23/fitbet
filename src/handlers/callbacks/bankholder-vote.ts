import type { BotContext } from "../../types";
import {
  challengeService,
  participantService,
  bankHolderService,
  paymentService,
} from "../../services";
import { InlineKeyboard } from "grammy";
import { selectBankHolderWinner } from "../../services/bankholder-election";

export async function handleVoteCallback(ctx: BotContext) {
  const callbackData = ctx.callbackQuery?.data;
  const userId = ctx.from?.id;

  if (!callbackData || !userId) {
    await ctx.answerCallbackQuery({ text: "Ошибка", show_alert: true });
    return;
  }

  // Parse: vote_{electionId}_{candidateUserId}
  const match = callbackData.match(/^vote_(\d+)_(\d+)$/);
  if (!match) {
    await ctx.answerCallbackQuery({ text: "Ошибка данных", show_alert: true });
    return;
  }

  const electionId = parseInt(match[1]);
  const votedForId = parseInt(match[2]);

  // Get election
  const election = await bankHolderService.getElection(electionId);
  if (!election) {
    await ctx.answerCallbackQuery({
      text: "Голосование не найдено",
      show_alert: true,
    });
    return;
  }

  // Check election status
  if (election.status !== "in_progress") {
    await ctx.answerCallbackQuery({
      text: "Голосование уже завершено",
      show_alert: true,
    });
    return;
  }

  // Get challenge
  const challenge = await challengeService.findById(election.challengeId);
  if (!challenge) {
    await ctx.answerCallbackQuery({
      text: "Челлендж не найден",
      show_alert: true,
    });
    return;
  }

  // Check voter is participant who completed onboarding
  const voter = await participantService.findByUserAndChallenge(
    userId,
    challenge.id
  );

  if (!voter || voter.status === "onboarding") {
    await ctx.answerCallbackQuery({
      text: "Вы не можете участвовать в голосовании",
      show_alert: true,
    });
    return;
  }

  // Check candidate is participant who completed onboarding
  const candidate = await participantService.findByUserAndChallenge(
    votedForId,
    challenge.id
  );

  if (!candidate || candidate.status === "onboarding") {
    await ctx.answerCallbackQuery({
      text: "Выбранный кандидат недоступен",
      show_alert: true,
    });
    return;
  }

  // Check if already voted
  const existingVote = await bankHolderService.getVote(electionId, userId);
  if (existingVote) {
    await ctx.answerCallbackQuery({
      text: "Вы уже проголосовали",
      show_alert: true,
    });
    return;
  }

  // Record vote
  await bankHolderService.recordVote({
    electionId,
    voterId: userId,
    votedForId,
  });

  await ctx.answerCallbackQuery({ text: "Голос учтён!" });

  await ctx.editMessageText(
    `✅ *Спасибо! Ваш голос учтён.*\n\n` +
      `Ожидаем голоса остальных участников...`,
    { parse_mode: "Markdown" }
  );

  // Check if all participants voted
  const allParticipants = await participantService.findByChallengeId(challenge.id);
  const eligibleParticipants = allParticipants.filter(
    (p) => p.status !== "onboarding"
  );

  const allVotes = await bankHolderService.getVotes(electionId);

  if (allVotes.length === eligibleParticipants.length) {
    // All voted - finalize election
    await finalizeElection(ctx, election.id, challenge.id);
  }
}

async function finalizeElection(
  ctx: BotContext,
  electionId: number,
  challengeId: number
) {
  const challenge = await challengeService.findById(challengeId);
  if (!challenge) return;

  // Get all votes
  const votes = await bankHolderService.getVotes(electionId);

  const eligibleParticipants = await participantService.findByChallengeId(challengeId);
  const eligible = eligibleParticipants.filter((p) => p.status !== "onboarding");
  const result = selectBankHolderWinner(eligible, votes, challenge.creatorId);

  if (!result) {
    await ctx.api.sendMessage(
      challenge.chatId,
      "⚠️ Ошибка при подсчёте голосов. Попробуйте снова."
    );
    return;
  }

  const { winnerId, maxVotes } = result;

  // Verify winner is a participant
  const winner = await participantService.findByUserAndChallenge(
    winnerId,
    challengeId
  );

  if (!winner || winner.status === "onboarding") {
    await ctx.api.sendMessage(
      challenge.chatId,
      "⚠️ Ошибка: победитель голосования не является активным участником."
    );
    return;
  }

  // Set Bank Holder
  await challengeService.setBankHolder(
    challengeId,
    winnerId,
    winner.username || undefined
  );

  // Update challenge status to pending_payments
  await challengeService.updateStatus(challengeId, "pending_payments");

  // Complete election
  await bankHolderService.completeElection(electionId);

  // Announce in group
  const winnerName = winner.firstName || winner.username || `User ${winnerId}`;

  await ctx.api.sendMessage(
    challenge.chatId,
    `🏆 *Голосование завершено!*\n\n` +
      `Bank Holder: ${winnerName}\n` +
      `Голосов: ${maxVotes} из ${votes.length}\n\n` +
      `${winnerName} будет получать оплаты и подтверждать их.`,
    { parse_mode: "Markdown" }
  );

  // Notify Bank Holder
  try {
    await ctx.api.sendMessage(
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

  // Send "Я оплатил" button to all participants with pending_payment status
  const allParticipants = await participantService.findByChallengeId(challengeId);

  for (const participant of allParticipants) {
    if (participant.status === "pending_payment") {
      const paidKeyboard = new InlineKeyboard().text(
        "💳 Я оплатил",
        `paid_${participant.id}`
      );

      try {
        await ctx.api.sendMessage(
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

  // Send pending confirmations to Bank Holder (if any payments already marked)
  const pendingPayments = await paymentService.getPendingConfirmations(challengeId);

  if (pendingPayments.length > 0) {
    for (const { participant } of pendingPayments) {
      const pName =
        participant.firstName || participant.username || `User ${participant.userId}`;
      const confirmKeyboard = new InlineKeyboard().text(
        "✅ Подтвердить оплату",
        `confirm_${participant.id}`
      );

      try {
        await ctx.api.sendMessage(
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
}
