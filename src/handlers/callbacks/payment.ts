import type { BotContext } from "../../types";
import {
  participantService,
  challengeService,
  paymentService,
} from "../../services";
import { InlineKeyboard } from "grammy";

export async function handlePaidCallback(ctx: BotContext) {
  const callbackData = ctx.callbackQuery?.data;
  const userId = ctx.from?.id;

  if (!callbackData || !userId) {
    await ctx.answerCallbackQuery({ text: "Ошибка", show_alert: true });
    return;
  }

  const participantId = parseInt(callbackData.replace("paid_", ""));
  if (isNaN(participantId)) {
    await ctx.answerCallbackQuery({ text: "Ошибка данных", show_alert: true });
    return;
  }

  const participant = await participantService.findById(participantId);
  if (!participant || participant.userId !== userId) {
    await ctx.answerCallbackQuery({ text: "Ошибка доступа", show_alert: true });
    return;
  }

  if (participant.status !== "pending_payment") {
    await ctx.answerCallbackQuery({
      text: "Оплата уже отмечена или не требуется",
      show_alert: true,
    });
    return;
  }

  // Mark payment as paid
  await paymentService.markPaid(participantId);
  await participantService.updateStatus(participantId, "payment_marked");

  await ctx.answerCallbackQuery({ text: "Оплата отмечена!" });

  await ctx.editMessageText(
    `✅ *Оплата отмечена*\n\n` +
      `Ожидайте подтверждения от Bank Holder.\n` +
      `Мы уведомим вас, когда челлендж начнётся.`,
    { parse_mode: "Markdown" }
  );

  // Notify the group chat
  const challenge = await challengeService.findById(participant.challengeId);
  if (challenge) {
    const name = participant.firstName || participant.username || `User ${userId}`;

    await ctx.api.sendMessage(
      challenge.chatId,
      `💳 ${name} отметил оплату. Ожидается подтверждение Bank Holder.`
    );

    // Check if we need to select Bank Holder
    // If this is the first payment_marked, offer to select Bank Holder
    const allParticipants = await participantService.findByChallengeId(challenge.id);
    const needsBankHolder = !challenge.bankHolderId;
    const hasCompletedOnboarding = allParticipants.filter(
      (p) => p.status !== "onboarding"
    );

    if (needsBankHolder && hasCompletedOnboarding.length >= 2) {
      // Offer Bank Holder selection
      const keyboard = new InlineKeyboard();
      for (const p of hasCompletedOnboarding) {
        const pName = p.firstName || p.username || `User ${p.userId}`;
        keyboard.text(pName, `bankholder_${challenge.id}_${p.userId}`).row();
      }

      await ctx.api.sendMessage(
        challenge.chatId,
        `🏦 *Выберите Bank Holder*\n\n` +
          `Bank Holder будет получать оплаты и подтверждать их. ` +
          `Выберите одного из участников:`,
        {
          reply_markup: keyboard,
          parse_mode: "Markdown",
        }
      );
    }
  }
}

export async function handleBankHolderCallback(ctx: BotContext) {
  const callbackData = ctx.callbackQuery?.data;

  if (!callbackData) {
    await ctx.answerCallbackQuery({ text: "Ошибка", show_alert: true });
    return;
  }

  const match = callbackData.match(/^bankholder_(\d+)_(\d+)$/);
  if (!match) {
    await ctx.answerCallbackQuery({ text: "Ошибка данных", show_alert: true });
    return;
  }

  const challengeId = parseInt(match[1]);
  const bankHolderUserId = parseInt(match[2]);

  const challenge = await challengeService.findById(challengeId);
  if (!challenge) {
    await ctx.answerCallbackQuery({ text: "Челлендж не найден", show_alert: true });
    return;
  }

  if (challenge.bankHolderId) {
    await ctx.answerCallbackQuery({
      text: "Bank Holder уже выбран",
      show_alert: true,
    });
    return;
  }

  const bankHolder = await participantService.findByUserAndChallenge(
    bankHolderUserId,
    challengeId
  );

  if (!bankHolder) {
    await ctx.answerCallbackQuery({
      text: "Участник не найден",
      show_alert: true,
    });
    return;
  }

  // Set Bank Holder
  await challengeService.setBankHolder(
    challengeId,
    bankHolderUserId,
    bankHolder.username || undefined
  );

  // Update challenge status
  await challengeService.updateStatus(challengeId, "pending_payments");

  await ctx.answerCallbackQuery({ text: "Bank Holder назначен!" });

  const name = bankHolder.firstName || bankHolder.username || `User ${bankHolderUserId}`;
  await ctx.editMessageText(
    `🏦 *Bank Holder назначен: ${name}*\n\n` +
      `${name}, вы будете получать оплаты и подтверждать их.\n` +
      `Реквизиты для оплаты можете отправить участникам лично.`,
    { parse_mode: "Markdown" }
  );

  // Notify Bank Holder
  try {
    await ctx.api.sendMessage(
      bankHolderUserId,
      `🏦 *Вы назначены Bank Holder!*\n\n` +
        `Вы будете получать оплаты от участников челленджа "${challenge.chatTitle}".\n\n` +
        `Когда участник отметит оплату, вы получите уведомление для подтверждения.`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    // User may have blocked the bot
  }

  // Check for pending confirmations and send them to Bank Holder
  const pendingPayments = await paymentService.getPendingConfirmations(challengeId);
  if (pendingPayments.length > 0) {
    for (const { participant } of pendingPayments) {
      const pName = participant.firstName || participant.username || `User ${participant.userId}`;
      const confirmKeyboard = new InlineKeyboard().text(
        "✅ Подтвердить оплату",
        `confirm_${participant.id}`
      );

      try {
        await ctx.api.sendMessage(
          bankHolderUserId,
          `💳 *Ожидает подтверждения:*\n\n` +
            `Участник: ${pName}\n` +
            `Сумма: ${challenge.stakeAmount}₽`,
          {
            reply_markup: confirmKeyboard,
            parse_mode: "Markdown",
          }
        );
      } catch (e) {
        // User may have blocked the bot
      }
    }
  }
}

export async function handleConfirmPaymentCallback(ctx: BotContext) {
  const callbackData = ctx.callbackQuery?.data;
  const userId = ctx.from?.id;

  if (!callbackData || !userId) {
    await ctx.answerCallbackQuery({ text: "Ошибка", show_alert: true });
    return;
  }

  const participantId = parseInt(callbackData.replace("confirm_", ""));
  if (isNaN(participantId)) {
    await ctx.answerCallbackQuery({ text: "Ошибка данных", show_alert: true });
    return;
  }

  const participant = await participantService.findById(participantId);
  if (!participant) {
    await ctx.answerCallbackQuery({ text: "Участник не найден", show_alert: true });
    return;
  }

  const challenge = await challengeService.findById(participant.challengeId);
  if (!challenge) {
    await ctx.answerCallbackQuery({ text: "Челлендж не найден", show_alert: true });
    return;
  }

  // Verify that the confirmer is the Bank Holder
  if (challenge.bankHolderId !== userId) {
    await ctx.answerCallbackQuery({
      text: "Только Bank Holder может подтверждать оплаты",
      show_alert: true,
    });
    return;
  }

  if (participant.status !== "payment_marked") {
    await ctx.answerCallbackQuery({
      text: "Оплата уже подтверждена или не отмечена",
      show_alert: true,
    });
    return;
  }

  // Confirm payment
  await paymentService.confirm(participantId, userId);
  await participantService.updateStatus(participantId, "active");

  await ctx.answerCallbackQuery({ text: "Оплата подтверждена!" });

  const name = participant.firstName || participant.username || `User ${participant.userId}`;
  await ctx.editMessageText(`✅ Оплата от ${name} подтверждена`);

  // Notify participant
  try {
    await ctx.api.sendMessage(
      participant.userId,
      `✅ *Ваша оплата подтверждена!*\n\n` +
        `Добро пожаловать в челлендж! Ожидайте начала.\n` +
        `Мы уведомим вас о первом чек-ине.`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    // User may have blocked the bot
  }

  // Notify group
  await ctx.api.sendMessage(
    challenge.chatId,
    `✅ Оплата от ${name} подтверждена Bank Holder'ом.`
  );

  // Check if all payments confirmed - activate challenge
  const allConfirmed = await paymentService.areAllPaymentsConfirmed(challenge.id);
  if (allConfirmed) {
    const { checkinService } = await import("../../services");

    // Activate challenge
    const activated = await challengeService.activate(challenge.id);
    if (!activated) return;

    // Schedule check-in windows
    await checkinService.scheduleWindowsForChallenge(
      challenge.id,
      activated.startedAt!,
      activated.durationMonths
    );

    await ctx.api.sendMessage(
      challenge.chatId,
      `🎉 *Челлендж начался!*\n\n` +
        `Все оплаты подтверждены. Челлендж официально стартовал!\n\n` +
        `📅 Длительность: ${activated.durationMonths} месяцев\n` +
        `🏁 Окончание: ${activated.endsAt?.toLocaleDateString("ru-RU")}\n\n` +
        `Первое окно чек-ина откроется через 2 недели. Удачи! 💪`,
      { parse_mode: "Markdown" }
    );
  }
}
