import type { BotContext } from "../../types";
import { participantService, challengeService, goalService } from "../../services";
import { config } from "../../config";
import { formatDuration } from "../../utils/duration";

export async function statusCommand(ctx: BotContext) {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const isPrivateChat = ctx.chat?.type === "private";

  if (!userId) {
    await ctx.reply("Ошибка: не удалось определить пользователя.");
    return;
  }

  if (isPrivateChat) {
    // Find all user's participations
    const participations = await participantService.findByUserId(userId);

    if (participations.length === 0) {
      await ctx.reply(
        "У вас нет активных челленджей.\n" +
          "Присоединитесь к челленджу через кнопку в групповом чате."
      );
      return;
    }

    let message = "📋 *Ваши челленджи:*\n\n";

    for (const p of participations) {
      const challenge = await challengeService.findById(p.challengeId);
      if (!challenge) continue;
      const participants = await participantService.findByChallengeId(challenge.id);
      const totalParticipants = participants.length;
      const activeParticipants = participants.filter((pp) => pp.status === "active").length;

      let statusText = "";
      let action = "";

      switch (p.status) {
        case "onboarding":
          statusText = "Онбординг не завершён";
          action = "Напишите /start, чтобы продолжить";
          break;
        case "pending_payment":
          statusText = "Ожидает оплаты";
          action = "Оплатите и нажмите «Я оплатил» в чате";
          break;
        case "payment_marked":
          statusText = "Оплата отмечена, ждёт подтверждения";
          break;
        case "active":
          statusText = `Активен (${p.completedCheckins}/${p.totalCheckins} чек-инов)`;
          break;
        case "dropped":
          statusText = "Не участвуете (выбыли/исключены)";
          break;
        case "disqualified":
          statusText = "Дисквалифицированы (пропуски чек-инов)";
          break;
        case "completed":
          statusText = "Челлендж завершён";
          break;
      }

      message += `*${challenge.chatTitle}*\n`;
      message += `Статус участия: ${statusText}\n`;
      if (challenge.startedAt) {
        message += `Старт: ${challenge.startedAt.toLocaleDateString("ru-RU")}\n`;
      } else {
        message += `Старт: ещё не начался\n`;
      }
      if (challenge.endsAt) {
        message += `Финиш: ${challenge.endsAt.toLocaleDateString("ru-RU")}\n`;
      } else {
        message += `Финиш: не назначен\n`;
      }
      message += `Участников: ${totalParticipants} (активных: ${activeParticipants})\n`;

      if (p.startWeight && p.startWaist) {
        const goal = await goalService.findByParticipantId(p.id);
        if (goal?.targetWeight && goal?.targetWaist) {
          message += `Старт: ${p.startWeight} кг / ${p.startWaist} см\n`;
          message += `Цель: ${goal.targetWeight} кг / ${goal.targetWaist} см\n`;
        }
      }

      if (action) {
        message += `_${action}_\n`;
      }

      message += "\n";
    }

    await ctx.reply(message, { parse_mode: "Markdown" });
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
    `Длительность: ${formatDuration(
      challenge.durationMonths,
      config.challengeDurationUnit
    )}\n` +
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
