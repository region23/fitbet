import type { BotContext } from "../../types";
import {
  challengeService,
  participantService,
  goalService,
  commitmentService,
} from "../../services";
import { InlineKeyboard } from "grammy";
import { config } from "../../config";
import { formatDuration } from "../../utils/duration";

export async function handleJoinCallback(ctx: BotContext) {
  const callbackData = ctx.callbackQuery?.data;
  const userId = ctx.from?.id;
  const username = ctx.from?.username;
  const firstName = ctx.from?.first_name;

  if (!callbackData || !userId) {
    await ctx.answerCallbackQuery({ text: "Ошибка", show_alert: true });
    return;
  }

  const challengeId = parseInt(callbackData.replace("join_", ""));
  if (isNaN(challengeId)) {
    await ctx.answerCallbackQuery({ text: "Некорректный челлендж", show_alert: true });
    return;
  }

  const challenge = await challengeService.findById(challengeId);
  if (!challenge) {
    await ctx.answerCallbackQuery({ text: "Челлендж не найден", show_alert: true });
    return;
  }

  if (challenge.status !== "draft" && challenge.status !== "pending_payments") {
    await ctx.answerCallbackQuery({
      text: "Присоединение к этому челленджу уже закрыто",
      show_alert: true,
    });
    return;
  }

  // Check if already joined
  const existing = await participantService.findByUserAndChallenge(userId, challengeId);
  if (existing) {
    if (existing.status === "onboarding") {
      // Send them to continue onboarding
      await ctx.answerCallbackQuery({
        text: "Вы уже начали онбординг. Проверьте личные сообщения.",
        show_alert: true,
      });

      // Send message to private chat
      try {
        await ctx.api.sendMessage(
          userId,
          `👋 Вы уже начали онбординг для челленджа "${challenge.chatTitle}".\n\n` +
            `Напишите /start чтобы продолжить.`
        );
      } catch (e) {
        // User may have blocked the bot
      }
      return;
    }

    if (
      existing.status === "dropped" &&
      (challenge.status === "draft" || challenge.status === "pending_payments")
    ) {
      await participantService.restartOnboarding(existing.id);
      await goalService.deleteByParticipantId(existing.id);
      await commitmentService.deleteParticipantCommitments(existing.id);

      await ctx.answerCallbackQuery({
        text: "Онбординг начат заново. Проверьте личные сообщения.",
        show_alert: true,
      });

      try {
        await ctx.api.sendMessage(
          userId,
          `🎯 *Вы снова присоединились к челленджу!*\n\n` +
            `Чат: ${challenge.chatTitle}\n` +
            `Длительность: ${formatDuration(
              challenge.durationMonths,
              config.challengeDurationUnit
            )}\n` +
            `Ставка: ${challenge.stakeAmount}₽\n\n` +
            `⏳ На завершение онбординга есть 48 часов.\n\n` +
            `Напишите /start чтобы начать онбординг.`,
          { parse_mode: "Markdown" }
        );
      } catch (e) {
        await ctx.reply(
          `@${username || firstName}, пожалуйста, напишите боту @${ctx.me.username} в личку, ` +
            `чтобы начать онбординг.`
        );
      }

      return;
    }

    await ctx.answerCallbackQuery({
      text: "Вы уже участвуете в этом челлендже",
      show_alert: true,
    });
    return;
  }

  // Create participant
  const participant = await participantService.create({
    challengeId,
    userId,
    username,
    firstName,
    status: "onboarding",
  });

  await ctx.answerCallbackQuery({ text: "Отлично! Проверьте личные сообщения." });

  // Update the join message with new participant count
  const participants = await participantService.findByChallengeId(challengeId);
  const joinKeyboard = new InlineKeyboard().text(
    `🙋 Участвовать (${participants.length})`,
    `join_${challengeId}`
  );

  try {
    await ctx.editMessageReplyMarkup({ reply_markup: joinKeyboard });
  } catch (e) {
    // Message might be too old to edit
  }

  // Send onboarding message to private chat
  try {
    await ctx.api.sendMessage(
      userId,
      `🎯 *Вы присоединились к челленджу!*\n\n` +
        `Чат: ${challenge.chatTitle}\n` +
        `Длительность: ${formatDuration(
          challenge.durationMonths,
          config.challengeDurationUnit
        )}\n` +
        `Ставка: ${challenge.stakeAmount}₽\n\n` +
        `⏳ На завершение онбординга есть 48 часов.\n\n` +
        `Напишите /start чтобы начать онбординг.`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    // User may have not started the bot yet
    await ctx.reply(
      `@${username || firstName}, пожалуйста, напишите боту @${ctx.me.username} в личку, ` +
        `чтобы начать онбординг.`
    );
  }
}
