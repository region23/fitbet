import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../types";
import { challengeService } from "../services";
import { InlineKeyboard } from "grammy";

// ForceReply makes Telegram show reply interface to the user
const forceReply = { force_reply: true as const, selective: true as const };

type ChallengeSetupConversation = Conversation<BotContext>;

export async function challengeSetupConversation(
  conversation: ChallengeSetupConversation,
  ctx: BotContext
) {
  const chatId = ctx.chat?.id;
  const chatTitle = ctx.chat?.title || "Группа";
  const creatorId = ctx.from?.id;

  if (!chatId || !creatorId) {
    await ctx.reply("Ошибка: не удалось определить чат или пользователя.");
    return;
  }

  // Check if challenge already exists for this chat (not completed/cancelled)
  const existing = await conversation.external(() =>
    challengeService.findOngoingByChatId(chatId)
  );

  if (existing) {
    await ctx.reply(
      "В этом чате уже есть активный челлендж. Дождитесь его завершения или отмените."
    );
    return;
  }

  await ctx.reply(
    "🏋️ *Создание нового челленджа*\n\n" +
      "Давайте настроим параметры. Это займёт пару минут.",
    { parse_mode: "Markdown" }
  );

  // Step 1: Duration
  const durationKeyboard = new InlineKeyboard()
    .text("6 месяцев", "setup_duration_6")
    .text("12 месяцев", "setup_duration_12");

  await ctx.reply("📅 *Выберите длительность челленджа:*", {
    reply_markup: durationKeyboard,
    parse_mode: "Markdown",
  });

  let durationMonths: number;
  while (true) {
    const durationCtx = await conversation.waitFor("callback_query:data");

    // Only accept from the creator
    if (durationCtx.from?.id !== creatorId) {
      await durationCtx.answerCallbackQuery({
        text: "Только создатель челленджа может настраивать параметры",
        show_alert: true
      });
      continue;
    }

    const data = durationCtx.callbackQuery?.data;
    if (data === "setup_duration_6" || data === "setup_duration_12") {
      durationMonths = data === "setup_duration_6" ? 6 : 12;
      await durationCtx.answerCallbackQuery();
      await durationCtx.editMessageText(`✅ Длительность: ${durationMonths} месяцев`);
      break;
    }

    await durationCtx.answerCallbackQuery({ text: "Выберите вариант из списка" });
  }

  // Step 2: Stake amount
  await ctx.reply(
    "💰 *Введите размер ставки в рублях:*\n" +
      "(например: 5000)\n\n" +
      "_Ответьте на это сообщение_",
    { parse_mode: "Markdown", reply_markup: forceReply }
  );

  let stakeAmount: number;
  while (true) {
    const stakeCtx = await conversation.waitFor("message:text");

    // Only accept from the creator
    if (stakeCtx.from?.id !== creatorId) {
      continue; // Silently ignore messages from others
    }

    const text = stakeCtx.message?.text;
    if (!text) {
      await ctx.reply("Пожалуйста, введите число.", { reply_markup: forceReply });
      continue;
    }

    const parsed = parseFloat(text.replace(/\s/g, ""));
    if (isNaN(parsed) || parsed <= 0) {
      await ctx.reply("Введите корректную сумму (положительное число).", { reply_markup: forceReply });
      continue;
    }

    stakeAmount = parsed;
    break;
  }

  await ctx.reply(`✅ Ставка: ${stakeAmount}₽`);

  // Step 3: Discipline threshold
  const thresholdKeyboard = new InlineKeyboard()
    .text("70%", "setup_threshold_70")
    .text("80%", "setup_threshold_80")
    .text("90%", "setup_threshold_90");

  await ctx.reply(
    "📊 *Минимальный порог дисциплины:*\n" +
      "Участник должен сдать не менее X% чек-инов для победы.",
    {
      reply_markup: thresholdKeyboard,
      parse_mode: "Markdown",
    }
  );

  let disciplineThreshold: number;
  while (true) {
    const thresholdCtx = await conversation.waitFor("callback_query:data");

    // Only accept from the creator
    if (thresholdCtx.from?.id !== creatorId) {
      await thresholdCtx.answerCallbackQuery({
        text: "Только создатель челленджа может настраивать параметры",
        show_alert: true
      });
      continue;
    }

    const data = thresholdCtx.callbackQuery?.data;
    const match = data?.match(/^setup_threshold_(\d+)$/);
    if (match) {
      disciplineThreshold = parseInt(match[1]) / 100;
      await thresholdCtx.answerCallbackQuery();
      await thresholdCtx.editMessageText(`✅ Порог дисциплины: ${disciplineThreshold * 100}%`);
      break;
    }

    await thresholdCtx.answerCallbackQuery({ text: "Выберите вариант из списка" });
  }

  // Step 4: Max skips
  const skipsKeyboard = new InlineKeyboard()
    .text("1", "setup_skips_1")
    .text("2", "setup_skips_2")
    .text("3", "setup_skips_3");

  await ctx.reply(
    "⏭️ *Максимум пропусков до дисквалификации:*\n" +
      "(подряд пропущенных чек-инов)",
    {
      reply_markup: skipsKeyboard,
      parse_mode: "Markdown",
    }
  );

  let maxSkips: number;
  while (true) {
    const skipsCtx = await conversation.waitFor("callback_query:data");

    // Only accept from the creator
    if (skipsCtx.from?.id !== creatorId) {
      await skipsCtx.answerCallbackQuery({
        text: "Только создатель челленджа может настраивать параметры",
        show_alert: true
      });
      continue;
    }

    const data = skipsCtx.callbackQuery?.data;
    const match = data?.match(/^setup_skips_(\d+)$/);
    if (match) {
      maxSkips = parseInt(match[1]);
      await skipsCtx.answerCallbackQuery();
      await skipsCtx.editMessageText(`✅ Максимум пропусков: ${maxSkips}`);
      break;
    }

    await skipsCtx.answerCallbackQuery({ text: "Выберите вариант из списка" });
  }

  // Create the challenge
  const challenge = await conversation.external(() =>
    challengeService.create({
      chatId,
      chatTitle,
      creatorId,
      durationMonths,
      stakeAmount,
      disciplineThreshold,
      maxSkips,
      status: "draft",
    })
  );

  // Post the join message
  const joinKeyboard = new InlineKeyboard().text(
    "🙋 Участвовать",
    `join_${challenge.id}`
  );

  await ctx.reply(
    `🎯 *Челлендж создан!*\n\n` +
      `📅 Длительность: ${durationMonths} месяцев\n` +
      `💰 Ставка: ${stakeAmount}₽\n` +
      `📊 Порог дисциплины: ${disciplineThreshold * 100}%\n` +
      `⏭️ Макс. пропусков: ${maxSkips}\n\n` +
      `Нажмите кнопку ниже, чтобы присоединиться. ` +
      `После регистрации всех участников выберем Bank Holder и начнём!`,
    {
      reply_markup: joinKeyboard,
      parse_mode: "Markdown",
    }
  );
}
