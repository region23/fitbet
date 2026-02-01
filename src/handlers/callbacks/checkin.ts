import type { BotContext } from "../../types";
import { participantService, checkinService } from "../../services";

export async function handleCheckinCallback(ctx: BotContext) {
  const callbackData = ctx.callbackQuery?.data;
  const userId = ctx.from?.id;

  if (!callbackData || !userId) {
    await ctx.answerCallbackQuery({ text: "Ошибка", show_alert: true });
    return;
  }

  const windowId = parseInt(callbackData.replace("checkin_", ""));
  if (isNaN(windowId)) {
    await ctx.answerCallbackQuery({ text: "Ошибка данных", show_alert: true });
    return;
  }

  const window = await checkinService.findWindowById(windowId);
  if (!window) {
    await ctx.answerCallbackQuery({ text: "Окно не найдено", show_alert: true });
    return;
  }

  if (window.status !== "open") {
    await ctx.answerCallbackQuery({
      text: "Окно чек-ина закрыто",
      show_alert: true,
    });
    return;
  }

  const participant = await participantService.findByUserAndChallenge(
    userId,
    window.challengeId
  );

  if (!participant || participant.status !== "active") {
    await ctx.answerCallbackQuery({
      text: "Вы не участвуете в этом челлендже",
      show_alert: true,
    });
    return;
  }

  // Check if already submitted
  const existing = await checkinService.findCheckinByParticipantAndWindow(
    participant.id,
    windowId
  );

  if (existing) {
    await ctx.answerCallbackQuery({
      text: "Вы уже сдали чек-ин",
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Начинаем чек-ин..." });

  // Set session data for the conversation
  await participantService.setPendingCheckin(participant.id, windowId);

  // Try to send message to private chat and start conversation
  try {
    await ctx.api.sendMessage(
      userId,
      `📋 *Время чек-ина #${window.windowNumber}!*\n\n` +
        `Давайте зафиксируем ваш прогресс.\n` +
        `Напишите /start чтобы начать.`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    await ctx.reply(
      `@${ctx.from?.username}, пожалуйста, напишите боту в личку для сдачи чек-ина.`
    );
  }
}
