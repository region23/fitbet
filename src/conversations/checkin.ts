import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../types";
import {
  participantService,
  challengeService,
  checkinService,
} from "../services";

type CheckinConversation = Conversation<BotContext>;

export async function checkinConversation(
  conversation: CheckinConversation,
  ctx: BotContext
) {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Ошибка: не удалось определить пользователя.");
    return;
  }

  // Get session data for window ID
  const windowId = ctx.session.checkin?.windowId;
  if (!windowId) {
    await ctx.reply(
      "Ошибка: не найдено активное окно чек-ина. " +
        "Возможно, окно уже закрыто или вы уже сдали чек-ин."
    );
    return;
  }

  const window = await conversation.external(() =>
    checkinService.findWindowById(windowId)
  );

  if (!window || window.status !== "open") {
    await ctx.reply("Окно чек-ина закрыто или не найдено.");
    ctx.session.checkin = undefined;
    return;
  }

  const challenge = await conversation.external(() =>
    challengeService.findById(window.challengeId)
  );

  if (!challenge) {
    await ctx.reply("Ошибка: челлендж не найден.");
    return;
  }

  const participant = await conversation.external(() =>
    participantService.findByUserAndChallenge(userId, challenge.id)
  );

  if (!participant || participant.status !== "active") {
    await ctx.reply("Вы не являетесь активным участником этого челленджа.");
    return;
  }

  // Check if already submitted
  const existingCheckin = await conversation.external(() =>
    checkinService.findCheckinByParticipantAndWindow(participant.id, windowId)
  );

  if (existingCheckin) {
    await ctx.reply("Вы уже сдали чек-ин для этого окна.");
    ctx.session.checkin = undefined;
    return;
  }

  await ctx.reply(
    `📋 *Чек-ин #${window.windowNumber}*\n\n` +
      `Давайте зафиксируем ваш прогресс!`,
    { parse_mode: "Markdown" }
  );

  // Step 1: Weight
  await ctx.reply("⚖️ *Введите текущий вес в кг:*", {
    parse_mode: "Markdown",
  });

  let weight: number;
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

    weight = parsed;
    break;
  }

  await ctx.reply(`✅ Вес: ${weight} кг`);

  // Step 2: Waist
  await ctx.reply("📏 *Введите обхват талии в см:*", {
    parse_mode: "Markdown",
  });

  let waist: number;
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

    waist = parsed;
    break;
  }

  await ctx.reply(`✅ Талия: ${waist} см`);

  // Step 3: Front photo (анфас)
  await ctx.reply("📸 *Фото 1/4 — Анфас (спереди):*", {
    parse_mode: "Markdown",
  });

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

  // Step 4: Left profile photo (профиль слева)
  await ctx.reply("📸 *Фото 2/4 — Профиль слева:*", {
    parse_mode: "Markdown",
  });

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

  // Step 5: Right profile photo (профиль справа)
  await ctx.reply("📸 *Фото 3/4 — Профиль справа:*", {
    parse_mode: "Markdown",
  });

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

  // Step 6: Back photo (со спины)
  await ctx.reply("📸 *Фото 4/4 — Со спины:*", {
    parse_mode: "Markdown",
  });

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

  // Save check-in
  await conversation.external(() =>
    checkinService.createCheckin({
      participantId: participant.id,
      windowId,
      weight,
      waist,
      photoFrontId,
      photoLeftId,
      photoRightId,
      photoBackId,
    })
  );

  // Update participant's check-in stats
  await conversation.external(() =>
    participantService.incrementCheckins(participant.id, true)
  );

  // Calculate progress
  const startWeight = participant.startWeight || weight;
  const startWaist = participant.startWaist || waist;
  const weightChange = weight - startWeight;
  const waistChange = waist - startWaist;

  const weightChangeStr =
    weightChange > 0 ? `+${weightChange.toFixed(1)}` : weightChange.toFixed(1);
  const waistChangeStr =
    waistChange > 0 ? `+${waistChange.toFixed(1)}` : waistChange.toFixed(1);

  await ctx.reply(
    `🎉 *Чек-ин #${window.windowNumber} принят!*\n\n` +
      `*Текущие показатели:*\n` +
      `• Вес: ${weight} кг (${weightChangeStr} кг от старта)\n` +
      `• Талия: ${waist} см (${waistChangeStr} см от старта)\n\n` +
      `Дисциплина: ${participant.completedCheckins + 1}/${participant.totalCheckins + 1} чек-инов\n\n` +
      `Продолжайте в том же духе! 💪`,
    { parse_mode: "Markdown" }
  );

  // Clear session
  ctx.session.checkin = undefined;
}
