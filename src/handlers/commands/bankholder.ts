import type { BotContext } from "../../types";
import {
  challengeService,
  participantService,
  bankHolderService,
} from "../../services";

export async function bankholderCommand(ctx: BotContext) {
  const chatType = ctx.chat?.type;
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;

  // Check if command is used in group chat
  if (chatType === "private") {
    await ctx.reply(
      "⚠️ Команда /bankholder работает только в групповых чатах.\n\n" +
        "Выполните команду в чате с челленджем."
    );
    return;
  }

  if (!chatId || !userId) {
    await ctx.reply("Ошибка: не удалось определить чат или пользователя.");
    return;
  }

  // Find ongoing challenge in this chat
  const challenge = await challengeService.findOngoingByChatId(chatId);
  if (!challenge) {
    await ctx.reply(
      "⚠️ В этом чате нет активного челленджа.\n\n" +
        "Создайте челлендж командой /create"
    );
    return;
  }

  // Check if user is the creator
  if (challenge.creatorId !== userId) {
    await ctx.reply(
      "⚠️ Только создатель челленджа может запустить голосование за Bank Holder."
    );
    return;
  }

  // Check if Bank Holder already selected
  if (challenge.bankHolderId) {
    await ctx.reply(
      "⚠️ Bank Holder уже выбран для этого челленджа.\n\n" +
        `Bank Holder: ${challenge.bankHolderUsername || "участник"}`
    );
    return;
  }

  // Check minimum participants (completed onboarding)
  const allParticipants = await participantService.findByChallengeId(challenge.id);
  const completedOnboarding = allParticipants.filter(
    (p) => p.status !== "onboarding"
  );

  if (completedOnboarding.length < 2) {
    await ctx.reply(
      "⚠️ Для голосования необходимо минимум 2 участника, завершивших онбординг.\n\n" +
        `Сейчас завершили: ${completedOnboarding.length} из ${allParticipants.length}`
    );
    return;
  }

  // Check if there's already an active election
  const existingElection = await bankHolderService.getActiveElection(challenge.id);
  if (existingElection) {
    await ctx.reply(
      "⚠️ Голосование за Bank Holder уже идёт.\n\n" +
        "Дождитесь его завершения."
    );
    return;
  }

  // Start the voting conversation
  await ctx.conversation.enter("bankHolderVotingConversation");
}
