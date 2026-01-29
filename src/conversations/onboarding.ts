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
import type { Track, Participant } from "../db/schema";

type OnboardingConversation = Conversation<BotContext>;

// Helper to check what's already filled
function getOnboardingProgress(participant: Participant) {
  const hasMetrics = !!(participant.track && participant.startWeight && participant.startWaist && participant.height);
  const hasPhotos = !!(participant.startPhotoFrontId && participant.startPhotoLeftId &&
                       participant.startPhotoRightId && participant.startPhotoBackId);

  return {
    hasTrack: !!participant.track,
    hasMetrics,
    hasPhotos,
    track: participant.track as Track | null,
    startWeight: participant.startWeight,
    startWaist: participant.startWaist,
    height: participant.height,
  };
}

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
  let participant = await conversation.external(() =>
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

  // Check existing progress
  const progress = getOnboardingProgress(participant);
  let shouldRestart = false;

  // If some data exists, ask whether to continue or restart
  if (progress.hasTrack || progress.hasMetrics || progress.hasPhotos) {
    let progressSummary = "📋 *У вас есть сохранённый прогресс:*\n\n";

    if (progress.track) {
      progressSummary += `• Трек: ${progress.track === "cut" ? "Cut" : "Bulk"}\n`;
    }
    if (progress.startWeight) {
      progressSummary += `• Вес: ${progress.startWeight} кг\n`;
    }
    if (progress.startWaist) {
      progressSummary += `• Талия: ${progress.startWaist} см\n`;
    }
    if (progress.height) {
      progressSummary += `• Рост: ${progress.height} см\n`;
    }
    if (progress.hasPhotos) {
      progressSummary += `• Фото: загружены ✅\n`;
    }

    const resumeKeyboard = new InlineKeyboard()
      .text("▶️ Продолжить", "onboarding_continue")
      .text("🔄 Начать заново", "onboarding_restart");

    await ctx.reply(progressSummary + "\nЧто хотите сделать?", {
      reply_markup: resumeKeyboard,
      parse_mode: "Markdown",
    });

    const choiceCtx = await conversation.waitForCallbackQuery(/^onboarding_(continue|restart)$/);
    await choiceCtx.answerCallbackQuery();

    if (choiceCtx.callbackQuery.data === "onboarding_restart") {
      shouldRestart = true;
      await choiceCtx.editMessageText("🔄 Начинаем заново...");

      // Reset participant data
      await conversation.external(() =>
        participantService.updateOnboardingData(participant.id, {
          track: undefined,
          startWeight: undefined,
          startWaist: undefined,
          height: undefined,
          startPhotoFrontId: undefined,
          startPhotoLeftId: undefined,
          startPhotoRightId: undefined,
          startPhotoBackId: undefined,
        })
      );

      // Delete existing goal if any
      await conversation.external(() =>
        goalService.deleteByParticipantId(participant.id)
      );

      // Delete existing commitments if any
      await conversation.external(() =>
        commitmentService.deleteParticipantCommitments(participant.id)
      );
    } else {
      await choiceCtx.editMessageText("▶️ Продолжаем с того места, где остановились...");
    }
  }

  // Welcome message (only if starting fresh)
  if (!progress.hasTrack || shouldRestart) {
    await ctx.reply(
      `🎯 *Добро пожаловать в челлендж!*\n\n` +
        `Чат: ${challenge.chatTitle}\n` +
        `Длительность: ${challenge.durationMonths} месяцев\n` +
        `Ставка: ${challenge.stakeAmount}₽\n\n` +
        `Давайте настроим ваш профиль.`,
      { parse_mode: "Markdown" }
    );
  }

  // === STEP 1: Track selection ===
  let track: Track;
  if (progress.track && !shouldRestart) {
    track = progress.track;
    await ctx.reply(`✅ Трек: ${track === "cut" ? "🔥 Cut (похудение)" : "💪 Bulk (набор массы)"}`);
  } else {
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
    track = trackCtx.callbackQuery.data.replace("track_", "") as Track;
    await trackCtx.answerCallbackQuery();
    await trackCtx.editMessageText(
      `✅ Трек: ${track === "cut" ? "🔥 Cut (похудение)" : "💪 Bulk (набор массы)"}`
    );

    // Save track immediately
    await conversation.external(() =>
      participantService.updateOnboardingData(participant.id, { track })
    );
  }

  // === STEP 2: Current weight ===
  let currentWeight: number;
  if (progress.startWeight && !shouldRestart) {
    currentWeight = progress.startWeight;
    await ctx.reply(`✅ Текущий вес: ${currentWeight} кг`);
  } else {
    await ctx.reply("⚖️ *Введите ваш текущий вес в кг:*\n(например: 85.5)", {
      parse_mode: "Markdown",
    });

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

    // Save weight immediately
    await conversation.external(() =>
      participantService.updateOnboardingData(participant.id, { startWeight: currentWeight })
    );
  }

  // === STEP 3: Current waist ===
  let currentWaist: number;
  if (progress.startWaist && !shouldRestart) {
    currentWaist = progress.startWaist;
    await ctx.reply(`✅ Обхват талии: ${currentWaist} см`);
  } else {
    await ctx.reply("📏 *Введите обхват талии в см:*\n(например: 90)", {
      parse_mode: "Markdown",
    });

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

    // Save waist immediately
    await conversation.external(() =>
      participantService.updateOnboardingData(participant.id, { startWaist: currentWaist })
    );
  }

  // === STEP 4: Height ===
  let height: number;
  if (progress.height && !shouldRestart) {
    height = progress.height;
    await ctx.reply(`✅ Рост: ${height} см`);
  } else {
    await ctx.reply("📐 *Введите ваш рост в см:*\n(например: 175)", {
      parse_mode: "Markdown",
    });

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

    // Save height immediately
    await conversation.external(() =>
      participantService.updateOnboardingData(participant.id, { height })
    );
  }

  // === STEPS 5-8: Photos ===
  let photoFrontId: string;
  let photoLeftId: string;
  let photoRightId: string;
  let photoBackId: string;

  if (progress.hasPhotos && !shouldRestart) {
    photoFrontId = participant.startPhotoFrontId!;
    photoLeftId = participant.startPhotoLeftId!;
    photoRightId = participant.startPhotoRightId!;
    photoBackId = participant.startPhotoBackId!;
    await ctx.reply("✅ Фото уже загружены");
  } else {
    // Front photo
    await ctx.reply(
      "📸 *Фото 1/4 — Анфас (спереди):*\n\n" +
        "Встаньте прямо, руки вдоль тела. " +
        "Фото должно быть в полный рост или по пояс.",
      { parse_mode: "Markdown" }
    );

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

    // Left profile
    await ctx.reply(
      "📸 *Фото 2/4 — Профиль слева:*\n\n" +
        "Встаньте левым боком к камере.",
      { parse_mode: "Markdown" }
    );

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

    // Right profile
    await ctx.reply(
      "📸 *Фото 3/4 — Профиль справа:*\n\n" +
        "Встаньте правым боком к камере.",
      { parse_mode: "Markdown" }
    );

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

    // Back photo
    await ctx.reply(
      "📸 *Фото 4/4 — Со спины:*\n\n" +
        "Встаньте спиной к камере.",
      { parse_mode: "Markdown" }
    );

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

    // Save all photos
    await conversation.external(() =>
      participantService.updateOnboardingData(participant.id, {
        startPhotoFrontId: photoFrontId,
        startPhotoLeftId: photoLeftId,
        startPhotoRightId: photoRightId,
        startPhotoBackId: photoBackId,
      })
    );
  }

  // === Check if goal already exists ===
  const existingGoal = await conversation.external(() =>
    goalService.findByParticipantId(participant.id)
  );

  let targetWeight: number;
  let targetWaist: number;

  if (existingGoal && !shouldRestart) {
    targetWeight = existingGoal.targetWeight!;
    targetWaist = existingGoal.targetWaist!;
    await ctx.reply(
      `✅ Цель уже установлена: ${targetWeight} кг / ${targetWaist} см`
    );
  } else {
    // Calculate recommended goals
    const recommendedGoals = metricsService.calculateRecommendedGoals({
      track,
      currentWeight,
      currentWaist,
      height,
      durationMonths: challenge.durationMonths,
    });

    // Start LLM recommendation fetch in background
    const llmRecommendationPromise = llmService.getGoalRecommendation({
      track,
      currentWeight,
      currentWaist,
      height,
      durationMonths: challenge.durationMonths,
      recommendedWeight: recommendedGoals.targetWeight,
      recommendedWaist: recommendedGoals.targetWaist,
    });

    // === STEP 9: Target weight ===
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

    // Try to get LLM advice (non-blocking)
    const showLlmAdvice = async () => {
      try {
        const llmAdvice = await llmRecommendationPromise;
        if (llmAdvice?.weightAdvice) {
          await ctx.reply(`💡 *Совет:* ${llmAdvice.weightAdvice}`, {
            parse_mode: "Markdown",
          });
        }
      } catch {
        // Silently ignore
      }
    };
    showLlmAdvice();

    while (true) {
      const targetCtx = await conversation.wait();

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

    // === STEP 10: Target waist ===
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

    while (true) {
      const targetCtx = await conversation.wait();

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

    // Validate goal with LLM using streaming reasoning display
    const chatId = ctx.chat?.id;
    if (!chatId) {
      await ctx.reply("Ошибка: не удалось определить чат.");
      return;
    }

    // Generate unique draft ID for sendMessageDraft
    const draftId = Date.now();

    // Throttle for Telegram API limits
    let lastDraftUpdate = 0;
    const THROTTLE_MS = 500;

    // Initial message
    await ctx.api.sendMessageDraft(chatId, draftId, "🤔 Анализирую вашу цель...").catch(() => {
      // Fallback if sendMessageDraft not supported (e.g., Threaded Mode not enabled)
    });

    const validation = await conversation.external(async () => {
      return llmService.validateGoalStreaming(
        {
          track,
          currentWeight,
          currentWaist,
          height,
          targetWeight,
          targetWaist,
          durationMonths: challenge.durationMonths,
        },
        {
          onReasoningChunk: async (reasoning) => {
            const now = Date.now();
            if (now - lastDraftUpdate > THROTTLE_MS) {
              lastDraftUpdate = now;
              // Show last 800 characters of reasoning to stay within limits
              const displayText =
                reasoning.length > 800
                  ? `...${reasoning.slice(-800)}`
                  : reasoning;
              await ctx.api
                .sendMessageDraft(
                  chatId,
                  draftId,
                  `💭 *Анализирую...*\n\n_${displayText}_`,
                  { parse_mode: "Markdown" }
                )
                .catch(() => {
                  // Ignore errors (throttling, unsupported)
                });
            }
          },
        }
      );
    });

    // Create goal record
    await conversation.external(() =>
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

    // Build final message with reasoning summary
    let finalMessage = "";
    if (validation.reasoning) {
      // Show first 400 characters of reasoning as summary
      const shortReasoning = validation.reasoning.slice(0, 400);
      finalMessage += `💭 *Рассуждения AI:*\n_${shortReasoning}${validation.reasoning.length > 400 ? "..." : ""}_\n\n`;
    }
    finalMessage += `${validationEmoji} *Оценка цели:* ${validation.feedback}\n\n`;
    finalMessage += `Цель сохранена. Продолжаем настройку.`;

    await ctx.reply(finalMessage, { parse_mode: "Markdown" });
  }

  // === Check if commitments already exist ===
  const existingCommitments = await conversation.external(() =>
    commitmentService.getParticipantCommitments(participant.id)
  );

  if (existingCommitments.length > 0 && !shouldRestart) {
    const commitmentNames = existingCommitments.map((c) => c.name).join("\n• ");
    await ctx.reply(`✅ Ваши обязательства:\n• ${commitmentNames}`);
  } else {
    // === STEP 11: Commitments selection ===
    const templates = await conversation.external(() =>
      commitmentService.getAllTemplates()
    );

    if (templates.length > 0) {
      let commitmentsList = "*Выберите 2-3 обязательства:*\n\n";
      templates.forEach((t, i) => {
        commitmentsList += `${i + 1}. *${t.name}*\n   ${t.description}\n\n`;
      });
      commitmentsList += "Введите номера через запятую или пробел (например: 1, 3, 5)";

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
