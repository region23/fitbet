import type { BotContext } from "../../types";
import { participantService } from "../../services";

export async function startCommand(ctx: BotContext) {
  const isPrivateChat = ctx.chat?.type === "private";
  const userId = ctx.from?.id;

  if (isPrivateChat && userId) {
    // Check if user has a pending check-in session
    if (ctx.session.checkin?.windowId) {
      await ctx.conversation.enter("checkinConversation");
      return;
    }

    // Check if user is in onboarding
    const onboardingParticipant = await participantService.getOnboardingParticipant(userId);
    if (onboardingParticipant) {
      await ctx.conversation.enter("onboardingConversation");
      return;
    }

    // Check if user has active participation - prevent re-onboarding
    const { challengeService } = await import("../../services");
    const activeParticipations = await participantService.findByUserId(userId);
    const activeNonOnboarding = activeParticipations.find(
      (p) =>
        p.status !== "onboarding" &&
        p.status !== "completed" &&
        p.status !== "dropped" &&
        p.status !== "disqualified"
    );

    if (activeNonOnboarding) {
      const challenge = await challengeService.findById(activeNonOnboarding.challengeId);
      if (challenge && (challenge.status === "active" || challenge.status === "pending_payments")) {
        await ctx.reply(
          `✅ *Вы уже участвуете в челлендже!*\n\n` +
            `Чат: ${challenge.chatTitle}\n` +
            `Статус челленджа: ${challenge.status === "active" ? "Активен" : "Ожидание оплат"}\n\n` +
            `Изменение анкеты после начала челленджа недоступно.\n` +
            `Используйте /status для просмотра информации.`,
          { parse_mode: "Markdown" }
        );
        return;
      }
    }

    // Default welcome message
    await ctx.reply(
      `👋 *Добро пожаловать в FitBet!*\n\n` +
        `FitBet — это Telegram-бот для фитнес-челленджей с друзьями.\n\n` +
        `*Как это работает:*\n` +
        `1. Создайте челлендж в групповом чате командой /create\n` +
        `2. Участники присоединяются и проходят онбординг\n` +
        `3. Каждые 2 недели сдаёте чек-ины (вес, талия, фото)\n` +
        `4. В конце — автоматический расчёт победителей\n\n` +
        `*Команды:*\n` +
        `/create — создать челлендж (в групповом чате)\n` +
        `/status — статус вашего участия\n` +
        `/help — справка\n\n` +
        `Добавьте бота в групповой чат и начните челлендж! 🏋️`,
      { parse_mode: "Markdown" }
    );
  } else {
    await ctx.reply(
      `👋 *FitBet активирован в этом чате!*\n\n` +
        `Используйте /create чтобы создать новый фитнес-челлендж.\n` +
        `/help — список всех команд`,
      { parse_mode: "Markdown" }
    );
  }
}
