import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../types";
import {
  participantService,
  challengeService,
  goalService,
  commitmentService,
  paymentService,
  llmService,
  metricsService,
} from "../services";
import { InlineKeyboard } from "grammy";
import type { Track } from "../db/schema";

type OnboardingConversation = Conversation<BotContext>;

export async function onboardingConversation(
  conversation: OnboardingConversation,
  ctx: BotContext
) {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Ошибка: не удалось определить пользователя.");
    return;
  }

  // Find participant in onboarding status
  const participant = await conversation.external(() =>
    participantService.getOnboardingParticipant(userId)
  );

  if (!participant) {
    await ctx.reply(
      "У вас нет активного онбординга. Присоединитесь к челленджу через кнопку в групповом чате."
    );
    return;
  }

  const challenge = await conversation.external(() =>
    challengeService.findById(participant.challengeId)
  );

  if (!challenge) {
    await ctx.reply("Ошибка: челлендж не найден.");
    return;
  }

  await ctx.reply(
    `🎯 *Добро пожаловать в челлендж!*\n\n` +
      `Чат: ${challenge.chatTitle}\n` +
      `Длительность: ${challenge.durationMonths} месяцев\n` +
      `Ставка: ${challenge.stakeAmount}₽\n\n` +
      `Давайте настроим ваш профиль.`,
    { parse_mode: "Markdown" }
  );

  // Step 1: Track selection
  const trackKeyboard = new InlineKeyboard()
    .text("🔥 Cut (похудение)", "track_cut")
    .text("💪 Bulk (набор массы)", "track_bulk");

  await ctx.reply(
    "*Выберите ваш трек:*\n\n" +
      "🔥 *Cut* — снижение веса и уменьшение талии\n" +
      "💪 *Bulk* — набор мышечной массы",
    {
      reply_markup: trackKeyboard,
      parse_mode: "Markdown",
    }
  );

  const trackCtx = await conversation.waitForCallbackQuery(/^track_(cut|bulk)$/);
  const track = trackCtx.callbackQuery.data.replace("track_", "") as Track;
  await trackCtx.answerCallbackQuery();
  await trackCtx.editMessageText(
    `✅ Трек: ${track === "cut" ? "🔥 Cut (похудение)" : "💪 Bulk (набор массы)"}`
  );

  // Step 2: Current weight
  await ctx.reply("⚖️ *Введите ваш текущий вес в кг:*\n(например: 85.5)", {
    parse_mode: "Markdown",
  });

  let currentWeight: number;
  while (true) {
    const weightCtx = await conversation.wait();
    const text = weightCtx.message?.text;

    if (!text) {
      await ctx.reply("Пожалуйста, введите число.");
      continue;
    }

    const parsed = parseFloat(text.replace(",", "."));
    if (isNaN(parsed) || parsed < 30 || parsed > 300) {
      await ctx.reply("Введите корректный вес (30-300 кг).");
      continue;
    }

    currentWeight = parsed;
    break;
  }

  await ctx.reply(`✅ Текущий вес: ${currentWeight} кг`);

  // Step 3: Current waist
  await ctx.reply("📏 *Введите обхват талии в см:*\n(например: 90)", {
    parse_mode: "Markdown",
  });

  let currentWaist: number;
  while (true) {
    const waistCtx = await conversation.wait();
    const text = waistCtx.message?.text;

    if (!text) {
      await ctx.reply("Пожалуйста, введите число.");
      continue;
    }

    const parsed = parseFloat(text.replace(",", "."));
    if (isNaN(parsed) || parsed < 40 || parsed > 200) {
      await ctx.reply("Введите корректный обхват (40-200 см).");
      continue;
    }

    currentWaist = parsed;
    break;
  }

  await ctx.reply(`✅ Обхват талии: ${currentWaist} см`);

  // Step 4: Height
  await ctx.reply("📐 *Введите ваш рост в см:*\n(например: 175)", {
    parse_mode: "Markdown",
  });

  let height: number;
  while (true) {
    const heightCtx = await conversation.wait();
    const text = heightCtx.message?.text;

    if (!text) {
      await ctx.reply("Пожалуйста, введите число.");
      continue;
    }

    const parsed = parseFloat(text.replace(",", "."));
    if (isNaN(parsed) || parsed < 100 || parsed > 250) {
      await ctx.reply("Введите корректный рост (100-250 см).");
      continue;
    }

    height = parsed;
    break;
  }

  await ctx.reply(`✅ Рост: ${height} см`);

  // Step 5: Front photo (анфас)
  await ctx.reply(
    "📸 *Фото 1/4 — Анфас (спереди):*\n\n" +
      "Встаньте прямо, руки вдоль тела. " +
      "Фото должно быть в полный рост или по пояс.",
    { parse_mode: "Markdown" }
  );

  let photoFrontId: string;
  while (true) {
    const photoCtx = await conversation.wait();
    const photo = photoCtx.message?.photo;

    if (!photo || photo.length === 0) {
      await ctx.reply("Пожалуйста, отправьте фотографию.");
      continue;
    }

    photoFrontId = photo[photo.length - 1].file_id;
    break;
  }

  await ctx.reply("✅ Фото анфас получено");

  // Step 6: Left profile photo (профиль слева)
  await ctx.reply(
    "📸 *Фото 2/4 — Профиль слева:*\n\n" +
      "Встаньте левым боком к камере.",
    { parse_mode: "Markdown" }
  );

  let photoLeftId: string;
  while (true) {
    const photoCtx = await conversation.wait();
    const photo = photoCtx.message?.photo;

    if (!photo || photo.length === 0) {
      await ctx.reply("Пожалуйста, отправьте фотографию.");
      continue;
    }

    photoLeftId = photo[photo.length - 1].file_id;
    break;
  }

  await ctx.reply("✅ Фото профиль слева получено");

  // Step 7: Right profile photo (профиль справа)
  await ctx.reply(
    "📸 *Фото 3/4 — Профиль справа:*\n\n" +
      "Встаньте правым боком к камере.",
    { parse_mode: "Markdown" }
  );

  let photoRightId: string;
  while (true) {
    const photoCtx = await conversation.wait();
    const photo = photoCtx.message?.photo;

    if (!photo || photo.length === 0) {
      await ctx.reply("Пожалуйста, отправьте фотографию.");
      continue;
    }

    photoRightId = photo[photo.length - 1].file_id;
    break;
  }

  await ctx.reply("✅ Фото профиль справа получено");

  // Step 8: Back photo (со спины)
  await ctx.reply(
    "📸 *Фото 4/4 — Со спины:*\n\n" +
      "Встаньте спиной к камере.",
    { parse_mode: "Markdown" }
  );

  let photoBackId: string;
  while (true) {
    const photoCtx = await conversation.wait();
    const photo = photoCtx.message?.photo;

    if (!photo || photo.length === 0) {
      await ctx.reply("Пожалуйста, отправьте фотографию.");
      continue;
    }

    photoBackId = photo[photo.length - 1].file_id;
    break;
  }

  await ctx.reply("✅ Все фото получены");

  // Update participant with metrics and photos
  await conversation.external(() =>
    participantService.updateOnboardingData(participant.id, {
      track,
      startWeight: currentWeight,
      startWaist: currentWaist,
      height,
      startPhotoFrontId: photoFrontId,
      startPhotoLeftId: photoLeftId,
      startPhotoRightId: photoRightId,
      startPhotoBackId: photoBackId,
    })
  );

  // Calculate recommended goals
  const recommendedGoals = metricsService.calculateRecommendedGoals({
    track,
    currentWeight,
    currentWaist,
    height,
    durationMonths: challenge.durationMonths,
  });

  // Start LLM recommendation fetch in background (non-blocking)
  const llmRecommendationPromise = llmService.getGoalRecommendation({
    track,
    currentWeight,
    currentWaist,
    height,
    durationMonths: challenge.durationMonths,
    recommendedWeight: recommendedGoals.targetWeight,
    recommendedWaist: recommendedGoals.targetWaist,
  });

  // Step 9: Target weight with recommendations
  const weightKeyboard = new InlineKeyboard().text(
    `✨ Использовать ${recommendedGoals.targetWeight} кг`,
    `use_weight_${recommendedGoals.targetWeight}`
  );

  await ctx.reply(
    `🎯 *Целевой вес*\n\n` +
      `Сейчас: ${currentWeight} кг\n` +
      `📊 Рекомендуемый: *${recommendedGoals.targetWeight} кг*\n` +
      `   _(${recommendedGoals.weightReason})_\n\n` +
      `Введите желаемый вес или нажмите кнопку:`,
    {
      reply_markup: weightKeyboard,
      parse_mode: "Markdown",
    }
  );

  // Try to get LLM recommendation and show as additional message
  const showLlmAdvice = async () => {
    try {
      const llmAdvice = await llmRecommendationPromise;
      if (llmAdvice?.weightAdvice) {
        await ctx.reply(`💡 *Совет:* ${llmAdvice.weightAdvice}`, {
          parse_mode: "Markdown",
        });
      }
    } catch {
      // Silently ignore LLM errors
    }
  };
  // Non-blocking: show advice when ready
  showLlmAdvice();

  let targetWeight: number;
  while (true) {
    const targetCtx = await conversation.wait();

    // Check for button press
    if (targetCtx.callbackQuery?.data?.startsWith("use_weight_")) {
      targetWeight = parseFloat(targetCtx.callbackQuery.data.replace("use_weight_", ""));
      await targetCtx.answerCallbackQuery();
      await targetCtx.editMessageText(`✅ Целевой вес: ${targetWeight} кг`);
      break;
    }

    const text = targetCtx.message?.text;

    if (!text) {
      await ctx.reply("Пожалуйста, введите число или нажмите кнопку.");
      continue;
    }

    const parsed = parseFloat(text.replace(",", "."));
    if (isNaN(parsed) || parsed < 30 || parsed > 300) {
      await ctx.reply("Введите корректный вес (30-300 кг).");
      continue;
    }

    if (track === "cut" && parsed >= currentWeight) {
      await ctx.reply("Для Cut целевой вес должен быть меньше текущего.");
      continue;
    }

    if (track === "bulk" && parsed <= currentWeight) {
      await ctx.reply("Для Bulk целевой вес должен быть больше текущего.");
      continue;
    }

    targetWeight = parsed;
    await ctx.reply(`✅ Целевой вес: ${targetWeight} кг`);
    break;
  }

  // Step 10: Target waist with recommendations
  const waistKeyboard = new InlineKeyboard().text(
    `✨ Использовать ${recommendedGoals.targetWaist} см`,
    `use_waist_${recommendedGoals.targetWaist}`
  );

  await ctx.reply(
    `🎯 *Целевой обхват талии*\n\n` +
      `Сейчас: ${currentWaist} см\n` +
      `📊 Рекомендуемый: *${recommendedGoals.targetWaist} см*\n` +
      `   _(${recommendedGoals.waistReason})_\n\n` +
      `Введите желаемый обхват или нажмите кнопку:`,
    {
      reply_markup: waistKeyboard,
      parse_mode: "Markdown",
    }
  );

  let targetWaist: number;
  while (true) {
    const targetCtx = await conversation.wait();

    // Check for button press
    if (targetCtx.callbackQuery?.data?.startsWith("use_waist_")) {
      targetWaist = parseFloat(targetCtx.callbackQuery.data.replace("use_waist_", ""));
      await targetCtx.answerCallbackQuery();
      await targetCtx.editMessageText(`✅ Целевой обхват талии: ${targetWaist} см`);
      break;
    }

    const text = targetCtx.message?.text;

    if (!text) {
      await ctx.reply("Пожалуйста, введите число или нажмите кнопку.");
      continue;
    }

    const parsed = parseFloat(text.replace(",", "."));
    if (isNaN(parsed) || parsed < 40 || parsed > 200) {
      await ctx.reply("Введите корректный обхват (40-200 см).");
      continue;
    }

    if (track === "cut" && parsed >= currentWaist) {
      await ctx.reply("Для Cut целевой обхват должен быть меньше текущего.");
      continue;
    }

    targetWaist = parsed;
    await ctx.reply(`✅ Целевой обхват талии: ${targetWaist} см`);
    break;
  }

  // Validate goal with LLM
  await ctx.reply("🤖 Проверяю реалистичность цели...");

  const validation = await conversation.external(() =>
    llmService.validateGoal({
      track,
      currentWeight,
      currentWaist,
      height,
      targetWeight,
      targetWaist,
      durationMonths: challenge.durationMonths,
    })
  );

  // Create goal record
  const goal = await conversation.external(() =>
    goalService.create({
      participantId: participant.id,
      targetWeight,
      targetWaist,
      isValidated: true,
      validationResult: validation.result,
      validationFeedback: validation.feedback,
      validatedAt: new Date(),
    })
  );

  const validationEmoji =
    validation.result === "realistic"
      ? "✅"
      : validation.result === "too_aggressive"
        ? "⚠️"
        : "💡";

  await ctx.reply(
    `${validationEmoji} *Оценка цели:* ${validation.feedback}\n\n` +
      `Цель сохранена. Продолжаем настройку.`,
    { parse_mode: "Markdown" }
  );

  // Step 9: Commitments selection
  const templates = await conversation.external(() =>
    commitmentService.getAllTemplates()
  );

  if (templates.length > 0) {
    let commitmentsList = "*Выберите 2-3 обязательства:*\n\n";
    templates.forEach((t, i) => {
      commitmentsList += `${i + 1}. *${t.name}*\n   ${t.description}\n\n`;
    });
    commitmentsList += "Введите номера через пробел (например: 1 3 5)";

    await ctx.reply(commitmentsList, { parse_mode: "Markdown" });

    let selectedCommitments: number[] = [];
    while (true) {
      const commitCtx = await conversation.wait();
      const text = commitCtx.message?.text;

      if (!text) {
        await ctx.reply("Пожалуйста, введите номера обязательств.");
        continue;
      }

      const numbers = text
        .split(/[\s,]+/)
        .map((n) => parseInt(n))
        .filter((n) => !isNaN(n) && n >= 1 && n <= templates.length);

      if (numbers.length < 2 || numbers.length > 3) {
        await ctx.reply("Выберите от 2 до 3 обязательств.");
        continue;
      }

      selectedCommitments = numbers.map((n) => templates[n - 1].id);
      break;
    }

    // Save commitments
    await conversation.external(() =>
      commitmentService.addParticipantCommitments(participant.id, selectedCommitments)
    );

    const selectedNames = selectedCommitments
      .map((id) => templates.find((t) => t.id === id)?.name)
      .filter(Boolean);

    await ctx.reply(`✅ Ваши обязательства:\n• ${selectedNames.join("\n• ")}`);
  }

  // Complete onboarding
  await conversation.external(() =>
    participantService.completeOnboarding(participant.id)
  );

  // Create payment record
  await conversation.external(() => paymentService.create(participant.id));

  // Show payment button
  const paymentKeyboard = new InlineKeyboard().text(
    "💳 Я оплатил",
    `paid_${participant.id}`
  );

  await ctx.reply(
    `🎉 *Онбординг завершён!*\n\n` +
      `*Ваш профиль:*\n` +
      `• Трек: ${track === "cut" ? "Cut" : "Bulk"}\n` +
      `• Старт: ${currentWeight} кг / ${currentWaist} см\n` +
      `• Цель: ${targetWeight} кг / ${targetWaist} см\n\n` +
      `💰 *Следующий шаг:* оплатите ставку ${challenge.stakeAmount}₽\n` +
      `После оплаты нажмите кнопку ниже.`,
    {
      reply_markup: paymentKeyboard,
      parse_mode: "Markdown",
    }
  );
}
