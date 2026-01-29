import type { BotContext } from "../../types";
import { challengeService, participantService } from "../../services";
import { InlineKeyboard } from "grammy";

export async function createCommand(ctx: BotContext) {
  const chatType = ctx.chat?.type;
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;

  if (chatType === "private") {
    await ctx.reply(
      "⚠️ Команда /create работает только в групповых чатах.\n\n" +
        "Добавьте бота в группу и выполните команду там."
    );
    return;
  }

  // Check if challenge already exists in this chat
  if (chatId && userId) {
    const existingChallenge = await challengeService.findOngoingByChatId(chatId);

    if (existingChallenge) {
      // Challenge exists - show info
      const participation = await participantService.findByUserAndChallenge(
        userId,
        existingChallenge.id
      );

      let message =
        `📊 *В этом чате уже есть активный челлендж*\n\n` +
        `Дождитесь его завершения.\n\n` +
        `📅 Длительность: ${existingChallenge.durationMonths} месяцев\n` +
        `💰 Ставка: ${existingChallenge.stakeAmount}₽\n` +
        `📊 Порог дисциплины: ${Math.round(existingChallenge.disciplineThreshold * 100)}%\n` +
        `⏭️ Макс. пропусков: ${existingChallenge.maxSkips}`;

      if (existingChallenge.status === "active") {
        if (existingChallenge.startedAt) {
          message += `\n🏁 Начало: ${existingChallenge.startedAt.toLocaleDateString("ru-RU")}`;
        }
        if (existingChallenge.endsAt) {
          message += `\n🏁 Окончание: ${existingChallenge.endsAt.toLocaleDateString("ru-RU")}`;
        }
      }

      // Show join button if user not participating and challenge is open
      if (
        !participation &&
        (existingChallenge.status === "draft" ||
          existingChallenge.status === "pending_payments")
      ) {
        const joinKeyboard = new InlineKeyboard().text(
          "🙋 Участвовать",
          `join_${existingChallenge.id}`
        );

        message += `\n\nНажмите кнопку ниже, чтобы присоединиться.`;

        await ctx.reply(message, {
          parse_mode: "Markdown",
          reply_markup: joinKeyboard,
        });
      } else {
        await ctx.reply(message, { parse_mode: "Markdown" });
      }

      return;
    }
  }

  // Start the challenge setup conversation
  await ctx.conversation.enter("challengeSetupConversation");
}
