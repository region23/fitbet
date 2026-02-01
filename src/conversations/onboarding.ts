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
  photoService,
} from "../services";
import { InlineKeyboard } from "grammy";
import type { Track, Participant } from "../db/schema";
import { config } from "../config";
import { durationToMonths, formatDuration } from "../utils/duration";

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

function takePendingText(ctx: BotContext): string | undefined {
  const pending = ctx.session.onboarding?.pendingText;
  if (!pending) {
    return undefined;
  }

  ctx.session.onboarding!.pendingText = undefined;
  const trimmed = pending.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function onboardingConversation(
  conversation: OnboardingConversation,
  ctx: BotContext
) {
  const userId = ctx.from?.id;
  console.log(`[Onboarding] >>> CONVERSATION CALLED for user ${userId}, message:`, ctx.message?.text || ctx.callbackQuery?.data || "no-text");

  if (!userId) {
    await ctx.reply("Ошибка: не удалось определить пользователя.");
    return;
  }

  // Find participant in onboarding status
  console.log(`[Onboarding] User ${userId} fetching participant data...`);
  let participant = await conversation.external(() =>
    participantService.getOnboardingParticipant(userId)
  );
  console.log(`[Onboarding] User ${userId} participant found:`, !!participant);

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

  // IMPORTANT: conversations are replayed on every update. We must keep the early
  // branching deterministic within a single onboarding run.
  ctx.session.onboarding ??= {};
  if (ctx.session.onboarding.resumeParticipantId !== participant.id) {
    ctx.session.onboarding = {
      resumeParticipantId: participant.id,
      challengeId: participant.challengeId,
    };
  }

  if (ctx.session.onboarding.resumePromptEnabled === undefined) {
    const hasAnyProgress = progress.hasTrack || progress.hasMetrics || progress.hasPhotos;
    ctx.session.onboarding.resumePromptEnabled = hasAnyProgress;
    ctx.session.onboarding.resumePromptComplete = !hasAnyProgress;
  }

  // If some data exists, ask whether to continue or restart
  if (
    ctx.session.onboarding.resumePromptEnabled &&
    !ctx.session.onboarding.resumePromptComplete
  ) {
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

    let decided = false;
    while (!decided) {
      const choiceCtx = await conversation.wait();

      if (choiceCtx.callbackQuery?.data === "onboarding_restart") {
        await choiceCtx.answerCallbackQuery();
        ctx.session.onboarding.resumePromptComplete = true;
        shouldRestart = true;
        await choiceCtx.editMessageText("🔄 Начинаем заново...");
        decided = true;

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
        break;
      }

      if (choiceCtx.callbackQuery?.data === "onboarding_continue") {
        await choiceCtx.answerCallbackQuery();
        ctx.session.onboarding.resumePromptComplete = true;
        await choiceCtx.editMessageText("▶️ Продолжаем с того места, где остановились...");
        decided = true;
        break;
      }

      if (choiceCtx.message?.text) {
        ctx.session.onboarding.resumePromptComplete = true;
        const pendingText = choiceCtx.message.text.trim();
        if (pendingText.length > 0 && !pendingText.startsWith("/")) {
          ctx.session.onboarding.pendingText = pendingText;
        }
        await choiceCtx.reply(
          "▶️ Продолжаем с того места, где остановились.\n" +
            "Сообщение принято; если это значение нужно для следующего шага, я использую его."
        );
        decided = true;
        break;
      }
    }
  }

  // Welcome message (only if starting fresh)
  if (!progress.hasTrack || shouldRestart) {
    await ctx.reply(
      `🎯 *Добро пожаловать в челлендж!*\n\n` +
        `Чат: ${challenge.chatTitle}\n` +
        `Длительность: ${formatDuration(
          challenge.durationMonths,
          config.challengeDurationUnit
        )}\n` +
        `Ставка: ${challenge.stakeAmount}₽\n\n` +
        `⏳ На завершение онбординга есть 48 часов.\n\n` +
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
      const pendingText = takePendingText(ctx);
      const weightCtx = pendingText ? null : await conversation.wait();
      const text = pendingText ?? weightCtx?.message?.text;
      const replyCtx = weightCtx ?? ctx;

      if (!text) {
        await replyCtx.reply("Пожалуйста, введите число.");
        continue;
      }

      const parsed = parseFloat(text.replace(",", "."));
      if (isNaN(parsed) || parsed < 30 || parsed > 300) {
        await replyCtx.reply("Введите корректный вес (30-300 кг).");
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
      const pendingText = takePendingText(ctx);
      const waistCtx = pendingText ? null : await conversation.wait();
      const text = pendingText ?? waistCtx?.message?.text;
      const replyCtx = waistCtx ?? ctx;

      if (!text) {
        await replyCtx.reply("Пожалуйста, введите число.");
        continue;
      }

      const parsed = parseFloat(text.replace(",", "."));
      if (isNaN(parsed) || parsed < 40 || parsed > 200) {
        await replyCtx.reply("Введите корректный обхват (40-200 см).");
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
      const pendingText = takePendingText(ctx);
      const heightCtx = pendingText ? null : await conversation.wait();
      const text = pendingText ?? heightCtx?.message?.text;
      const replyCtx = heightCtx ?? ctx;

      if (!text) {
        await replyCtx.reply("Пожалуйста, введите число.");
        continue;
      }

      const parsed = parseFloat(text.replace(",", "."));
      if (isNaN(parsed) || parsed < 100 || parsed > 250) {
        await replyCtx.reply("Введите корректный рост (100-250 см).");
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
        await photoCtx.reply("Пожалуйста, отправьте фотографию.");
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
        await photoCtx.reply("Пожалуйста, отправьте фотографию.");
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
        await photoCtx.reply("Пожалуйста, отправьте фотографию.");
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
        await photoCtx.reply("Пожалуйста, отправьте фотографию.");
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

    // Also save photos locally for future LLM analysis
    try {
      await conversation.external(() =>
        photoService.downloadAndSavePhotos(
          ctx.api,
          {
            front: photoFrontId,
            left: photoLeftId,
            right: photoRightId,
            back: photoBackId,
          },
          participant.id,
          "start"
        )
      );
      console.log(`[Onboarding] User ${userId} saved start photos locally`);
    } catch (error) {
      console.error(`[Onboarding] User ${userId} error saving start photos locally:`, error);
      // Don't break onboarding flow if local save fails
    }
  }

  // === Check if goal already exists ===
  console.log(`[Onboarding] User ${userId} checking for existing goal...`);
  const existingGoal = await conversation.external(() =>
    goalService.findByParticipantId(participant.id)
  );
  console.log(`[Onboarding] User ${userId} existing goal found:`, !!existingGoal);

  let targetWeight = 0;
  let targetWaist = 0;

  if (existingGoal && !shouldRestart) {
    targetWeight = existingGoal.targetWeight!;
    targetWaist = existingGoal.targetWaist!;
    await ctx.reply(
      `✅ Цель уже установлена: ${targetWeight} кг / ${targetWaist} см`
    );
  } else {
    // Goal setting with revision loop
    let goalAccepted = false;
    let savedGoalId: number | null = null;
    let revisionAttempts = 0;
    const MAX_REVISIONS = 3;

    while (!goalAccepted) {
      // Calculate recommended goals
      const durationMonthsForPlans = Math.max(
        0.25,
        durationToMonths(challenge.durationMonths, config.challengeDurationUnit)
      );

      const recommendedGoals = metricsService.calculateRecommendedGoals({
        track,
        currentWeight,
        currentWaist,
        height,
        durationMonths: durationMonthsForPlans,
      });
      console.log(`[Onboarding] User ${userId} calculated recommended goals:`, recommendedGoals);

      // === STEP 9: Target weight ===
      console.log(`[Onboarding] User ${userId} creating weight keyboard...`);
      const weightKeyboard = new InlineKeyboard().text(
        `✨ Использовать ${recommendedGoals.targetWeight} кг`,
        `use_weight_${recommendedGoals.targetWeight}`
      );
      console.log(`[Onboarding] User ${userId} sending weight prompt message...`);

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
      console.log(`[Onboarding] User ${userId} weight prompt sent, entering wait loop...`);

      while (true) {
        console.log(`[Onboarding] User ${userId} waiting for weight input...`);
        const pendingText = takePendingText(ctx);
        const targetCtx = pendingText ? null : await conversation.wait();
        const callbackData = targetCtx?.callbackQuery?.data;
        const text = pendingText ?? targetCtx?.message?.text;
        const replyCtx = targetCtx ?? ctx;
        console.log(
          `[Onboarding] User ${userId} received weight input:`,
          text || callbackData
        );

        if (callbackData?.startsWith("use_weight_")) {
          console.log(`[Onboarding] User ${userId} callback query for weight button detected`);
          targetWeight = parseFloat(callbackData.replace("use_weight_", ""));
          console.log(`[Onboarding] User ${userId} answering callback query...`);
          await targetCtx!.answerCallbackQuery();
          console.log(`[Onboarding] User ${userId} callback answered, editing message...`);
          await targetCtx!.editMessageText(`✅ Целевой вес: ${targetWeight} кг`);
          console.log(`[Onboarding] User ${userId} message edited, breaking from weight loop`);
          break;
        }

        if (!text) {
          console.log(`[Onboarding] User ${userId} no text in message, asking again...`);
          await replyCtx.reply("Пожалуйста, введите число или нажмите кнопку.");
          continue;
        }

        const parsed = parseFloat(text.replace(",", "."));
        if (isNaN(parsed) || parsed < 30 || parsed > 300) {
          console.log(`[Onboarding] User ${userId} invalid weight: ${parsed}`);
          await replyCtx.reply("Введите корректный вес (30-300 кг).");
          continue;
        }

        if (track === "cut" && parsed >= currentWeight) {
          console.log(`[Onboarding] User ${userId} weight too high for cut: ${parsed} >= ${currentWeight}`);
          await replyCtx.reply("Для Cut целевой вес должен быть меньше текущего.");
          continue;
        }

        if (track === "bulk" && parsed <= currentWeight) {
          console.log(`[Onboarding] User ${userId} weight too low for bulk: ${parsed} <= ${currentWeight}`);
          await replyCtx.reply("Для Bulk целевой вес должен быть больше текущего.");
          continue;
        }

        targetWeight = parsed;
        console.log(`[Onboarding] User ${userId} valid weight accepted: ${targetWeight}`);
        console.log(`[Onboarding] User ${userId} sending weight confirmation message...`);
        await replyCtx.reply(`✅ Целевой вес: ${targetWeight} кг`);
        console.log(`[Onboarding] User ${userId} weight confirmation sent, breaking from loop`);
        break;
      }

      console.log(`[Onboarding] User ${userId} exited weight loop, moving to waist step`);
      console.log(`[Onboarding] User ${userId} recommendedGoals.targetWaist:`, recommendedGoals.targetWaist);
      console.log(`[Onboarding] User ${userId} recommendedGoals.waistReason:`, recommendedGoals.waistReason);

      // === STEP 10: Target waist ===
      const waistKeyboard = new InlineKeyboard().text(
        `✨ Использовать ${recommendedGoals.targetWaist} см`,
        `use_waist_${recommendedGoals.targetWaist}`
      );
      console.log(`[Onboarding] User ${userId} created waist keyboard`);

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
      console.log(`[Onboarding] User ${userId} sent waist prompt, waiting for input`);

      while (true) {
        console.log(`[Onboarding] User ${userId} waiting for waist input...`);
        const pendingText = takePendingText(ctx);
        const targetCtx = pendingText ? null : await conversation.wait();
        const callbackData = targetCtx?.callbackQuery?.data;
        const text = pendingText ?? targetCtx?.message?.text;
        const replyCtx = targetCtx ?? ctx;
        console.log(
          `[Onboarding] User ${userId} received waist input:`,
          text || callbackData
        );

        if (callbackData?.startsWith("use_waist_")) {
          console.log(`[Onboarding] User ${userId} callback query for waist button detected`);
          targetWaist = parseFloat(callbackData.replace("use_waist_", ""));
          console.log(`[Onboarding] User ${userId} answering waist callback query...`);
          await targetCtx!.answerCallbackQuery();
          console.log(`[Onboarding] User ${userId} waist callback answered, editing message...`);
          await targetCtx!.editMessageText(`✅ Целевой обхват талии: ${targetWaist} см`);
          console.log(`[Onboarding] User ${userId} waist message edited, breaking from waist loop`);
          break;
        }

        if (!text) {
          console.log(`[Onboarding] User ${userId} no text in waist message, asking again...`);
          await replyCtx.reply("Пожалуйста, введите число или нажмите кнопку.");
          continue;
        }

        const parsed = parseFloat(text.replace(",", "."));
        if (isNaN(parsed) || parsed < 40 || parsed > 200) {
          console.log(`[Onboarding] User ${userId} invalid waist: ${parsed}`);
          await replyCtx.reply("Введите корректный обхват (40-200 см).");
          continue;
        }

        if (track === "cut" && parsed >= currentWaist) {
          console.log(`[Onboarding] User ${userId} waist too high for cut: ${parsed} >= ${currentWaist}`);
          await replyCtx.reply("Для Cut целевой обхват должен быть меньше текущего.");
          continue;
        }

        targetWaist = parsed;
        console.log(`[Onboarding] User ${userId} valid waist accepted: ${targetWaist}`);
        console.log(`[Onboarding] User ${userId} sending waist confirmation message...`);
        await replyCtx.reply(`✅ Целевой обхват талии: ${targetWaist} см`);
        console.log(`[Onboarding] User ${userId} waist confirmation sent, breaking from loop`);
        break;
      }

      // === LLM Validation ===
      let validation;
      try {
        console.log(`[Onboarding] User ${userId} starting LLM goal validation...`);
        await ctx.reply("🤖 Проверяю реалистичность цели...");

        validation = await conversation.external(() =>
          llmService.validateGoal({
            track,
            currentWeight,
            currentWaist,
            height,
            targetWeight,
            targetWaist,
            durationMonths: durationMonthsForPlans,
          })
        );

        console.log(`[Onboarding] User ${userId} LLM validation result: ${validation.result}`);
      } catch (error) {
        console.error(`[Onboarding] User ${userId} LLM validation failed:`, error);
        await ctx.reply(
          "⚠️ Не удалось проверить цель через LLM. Цель будет принята автоматически."
        );
        validation = {
          isRealistic: true,
          result: "realistic" as const,
          feedback: "Цель принята (LLM недоступен)",
        };
      }

      // === Save or update goal ===
      try {
        if (savedGoalId) {
          // Update existing goal on revision
          await conversation.external(() =>
            goalService.updateTargets(savedGoalId!, {
              targetWeight,
              targetWaist,
            })
          );
          await conversation.external(() =>
            goalService.updateValidation(savedGoalId!, {
              isValidated: true,
              validationResult: validation.result,
              validationFeedback: validation.feedback,
            })
          );
        } else {
          // Create new goal
          const newGoal = await conversation.external(() =>
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
          savedGoalId = newGoal.id;
        }
      } catch (error) {
        console.error("Goal save error:", error);
        await ctx.reply(
          "❌ Ошибка при сохранении цели. Попробуйте снова или обратитесь к администратору."
        );
        continue; // Retry without counting as revision attempt
      }

      // === Determine if revision is needed ===
      const needsReview = validation.result !== "realistic";

      if (needsReview) {
        revisionAttempts++;

        // Force acceptance after MAX_REVISIONS
        if (revisionAttempts >= MAX_REVISIONS) {
          const emoji = validation.result === "too_aggressive" ? "⚠️" : "💡";
          await ctx.reply(
            `${emoji} *Оценка цели:* ${validation.feedback}\n\n` +
            `Вы пересматривали цель ${MAX_REVISIONS} раза. Принимаю текущие параметры.\n` +
            `Цель сохранена. Продолжаем настройку.`,
            { parse_mode: "Markdown" }
          );
          goalAccepted = true;
          break;
        }

        // Show warning with revision option
        const validationEmoji = validation.result === "too_aggressive" ? "⚠️" : "💡";
        const revisionKeyboard = new InlineKeyboard()
          .text("🔄 Пересмотреть цель", `goal_revise_${participant.id}`)
          .text("✅ Продолжить с этими параметрами", `goal_accept_${participant.id}`);

        const warningText = validation.result === "too_aggressive"
          ? "⚠️ Ваша цель может быть слишком агрессивной и привести к проблемам со здоровьем. Рекомендуем пересмотреть параметры для безопасного прогресса."
          : "💡 Ваша цель кажется довольно скромной. Возможно, стоит поставить более амбициозную задачу для лучших результатов.";

        await ctx.reply(
          `${validationEmoji} *Оценка цели*\n\n` +
          `${validation.feedback}\n\n` +
          `${warningText}\n\n` +
          `Что вы хотите сделать?`,
          {
            reply_markup: revisionKeyboard,
            parse_mode: "Markdown",
          }
        );

        // Wait for user decision
        const decisionCtx = await conversation.waitForCallbackQuery(/^goal_(revise|accept)_\d+$/);
        await decisionCtx.answerCallbackQuery();

        if (decisionCtx.callbackQuery.data.startsWith("goal_revise_")) {
          await decisionCtx.editMessageText("🔄 Давайте пересмотрим вашу цель...");
          goalAccepted = false; // Continue loop
        } else {
          await decisionCtx.editMessageText(
            `✅ Цель сохранена: ${targetWeight} кг / ${targetWaist} см\n\n` +
            `Продолжаем настройку.`
          );
          goalAccepted = true; // Exit loop
        }
      } else {
        // Realistic goal - automatic acceptance
        await ctx.reply(
          `✅ *Оценка цели:* ${validation.feedback}\n\n` +
          `Цель сохранена. Продолжаем настройку.`,
          { parse_mode: "Markdown" }
        );
        goalAccepted = true; // Exit loop
      }
    }
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
        const pendingText = takePendingText(ctx);
        const commitCtx = pendingText ? null : await conversation.wait();
        const text = pendingText ?? commitCtx?.message?.text;
        const replyCtx = commitCtx ?? ctx;

        if (!text) {
          await replyCtx.reply("Пожалуйста, введите номера обязательств.");
          continue;
        }

        const numbers = text
          .split(/[\s,]+/)
          .map((n) => parseInt(n))
          .filter((n) => !isNaN(n) && n >= 1 && n <= templates.length);

        if (numbers.length < 2 || numbers.length > 3) {
          await replyCtx.reply("Выберите от 2 до 3 обязательств.");
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
