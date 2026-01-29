import type { BotContext } from "../../types";
import { participantService, challengeService, goalService } from "../../services";

export async function statusCommand(ctx: BotContext) {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const isPrivateChat = ctx.chat?.type === "private";

  if (!userId) {
    await ctx.reply("Ошибка: не удалось определить пользователя.");
    return;
  }

  if (isPrivateChat) {
    // Show all user's participations
    // For simplicity, we'll show the onboarding participant if exists
    const onboarding = await participantService.getOnboardingParticipant(userId);

    if (onboarding) {
      const challenge = await challengeService.findById(onboarding.challengeId);
      await ctx.reply(
        `📋 *Ваш статус:*\n\n` +
          `Челлендж: ${challenge?.chatTitle || "Неизвестно"}\n` +
          `Статус: Онбординг не завершён\n\n` +
          `Напишите /start чтобы продолжить онбординг.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    await ctx.reply(
      "У вас нет активных челленджей.\n" +
        "Присоединитесь к челленджу через кнопку в групповом чате."
    );
    return;
  }

  // Group chat - show challenge status
  if (!chatId) {
    await ctx.reply("Ошибка: не удалось определить чат.");
    return;
  }

  const challenge = await challengeService.findByChatId(chatId);

  if (!challenge) {
    await ctx.reply(
      "В этом чате нет активного челленджа.\n" +
        "Создайте новый командой /create"
    );
    return;
  }

  const participants = await participantService.findByChallengeId(challenge.id);

  let statusEmoji = "📋";
  let statusText: string = challenge.status;

  switch (challenge.status) {
    case "draft":
      statusEmoji = "📝";
      statusText = "Ожидание участников";
      break;
    case "pending_payments":
      statusEmoji = "💳";
      statusText = "Ожидание оплат";
      break;
    case "active":
      statusEmoji = "🏃";
      statusText = "Активен";
      break;
    case "completed":
      statusEmoji = "🏆";
      statusText = "Завершён";
      break;
    case "cancelled":
      statusEmoji = "❌";
      statusText = "Отменён";
      break;
  }

  let message =
    `${statusEmoji} *Статус челленджа*\n\n` +
    `Статус: ${statusText}\n` +
    `Длительность: ${challenge.durationMonths} месяцев\n` +
    `Ставка: ${challenge.stakeAmount}₽\n` +
    `Участников: ${participants.length}\n`;

  if (challenge.bankHolderUsername) {
    message += `Bank Holder: @${challenge.bankHolderUsername}\n`;
  }

  if (challenge.startedAt) {
    message += `\nНачало: ${challenge.startedAt.toLocaleDateString("ru-RU")}\n`;
  }

  if (challenge.endsAt) {
    message += `Окончание: ${challenge.endsAt.toLocaleDateString("ru-RU")}\n`;
  }

  if (participants.length > 0) {
    message += "\n*Участники:*\n";
    for (const p of participants) {
      const name = p.firstName || p.username || `User ${p.userId}`;
      let pStatus = "";
      switch (p.status) {
        case "onboarding":
          pStatus = "⏳ онбординг";
          break;
        case "pending_payment":
          pStatus = "💳 ожидает оплаты";
          break;
        case "payment_marked":
          pStatus = "⏳ проверка оплаты";
          break;
        case "active":
          pStatus = `✅ ${p.completedCheckins}/${p.totalCheckins} чек-инов`;
          break;
        case "dropped":
          pStatus = "🚫 выбыл";
          break;
        case "disqualified":
          pStatus = "❌ дисквалифицирован";
          break;
        case "completed":
          pStatus = "🏁 завершил";
          break;
      }
      message += `• ${name}: ${pStatus}\n`;
    }
  }

  await ctx.reply(message, { parse_mode: "Markdown" });
}
