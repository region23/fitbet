import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../types";
import {
  challengeService,
  participantService,
  bankHolderService,
} from "../services";
import { InlineKeyboard } from "grammy";

type BankHolderVotingConversation = Conversation<BotContext>;

export async function bankHolderVotingConversation(
  conversation: BankHolderVotingConversation,
  ctx: BotContext
) {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;

  if (!chatId || !userId) {
    await ctx.reply("Ошибка: не удалось определить чат или пользователя.");
    return;
  }

  // Get challenge
  const challenge = await conversation.external(() =>
    challengeService.findOngoingByChatId(chatId)
  );

  if (!challenge) {
    await ctx.reply("Ошибка: челлендж не найден.");
    return;
  }

  // Get participants who completed onboarding (they are voters and candidates)
  const allParticipants = await conversation.external(() =>
    participantService.findByChallengeId(challenge.id)
  );

  const eligibleParticipants = allParticipants.filter(
    (p) => p.status !== "onboarding"
  );

  if (eligibleParticipants.length < 2) {
    await ctx.reply(
      "Ошибка: недостаточно участников для голосования."
    );
    return;
  }

  // Create election
  const election = await conversation.external(() =>
    bankHolderService.createElection({
      challengeId: challenge.id,
      initiatedBy: userId,
      status: "in_progress",
    })
  );

  // Announce voting in group
  await ctx.reply(
    `🗳️ *Голосование за Bank Holder началось!*\n\n` +
      `Каждый участник получит личное сообщение для голосования.\n` +
      `Голосование приватное — никто не увидит ваш выбор.\n\n` +
      `Кандидаты: ${eligibleParticipants.length}\n` +
      `После голосования всех участников результаты будут объявлены.`,
    { parse_mode: "Markdown" }
  );

  // Send voting messages to each participant
  for (const participant of eligibleParticipants) {
    // Create inline keyboard with all candidates
    const keyboard = new InlineKeyboard();

    for (const candidate of eligibleParticipants) {
      const candidateName =
        candidate.firstName || candidate.username || `User ${candidate.userId}`;
      keyboard
        .text(candidateName, `vote_${election.id}_${candidate.userId}`)
        .row();
    }

    const voterName =
      participant.firstName || participant.username || `User ${participant.userId}`;

    try {
      await ctx.api.sendMessage(
        participant.userId,
        `🗳️ *Голосование за Bank Holder*\n\n` +
          `Челлендж: ${challenge.chatTitle}\n\n` +
          `Bank Holder будет получать оплаты от всех участников и подтверждать их.\n\n` +
          `Выберите кандидата, который, по вашему мнению, лучше всего подходит на эту роль:`,
        {
          reply_markup: keyboard,
          parse_mode: "Markdown",
        }
      );
    } catch (e) {
      // User may have blocked the bot
      console.error(`Failed to send voting message to ${participant.userId}:`, e);

      // Notify in group that this user can't vote
      await ctx.api.sendMessage(
        chatId,
        `⚠️ Не удалось отправить сообщение для голосования пользователю ${voterName}. ` +
          `Убедитесь, что бот не заблокирован.`
      );
    }
  }

  await ctx.reply(
    `✅ Сообщения для голосования отправлены всем участникам.\n` +
      `Ожидаем голоса...`,
    { parse_mode: "Markdown" }
  );
}
