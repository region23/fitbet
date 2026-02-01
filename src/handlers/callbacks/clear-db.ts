import type { BotContext } from "../../types";
import { config } from "../../config";
import { db, schema } from "../../db";
import { seedCommitments } from "../../db/seed";

async function clearDatabase() {
  await db.transaction(async (tx) => {
    await tx.delete(schema.checkinRecommendations);
    await tx.delete(schema.checkins);
    await tx.delete(schema.checkinWindows);
    await tx.delete(schema.participantCommitments);
    await tx.delete(schema.payments);
    await tx.delete(schema.bankHolderVotes);
    await tx.delete(schema.bankHolderElections);
    await tx.delete(schema.goals);
    await tx.delete(schema.participants);
    await tx.delete(schema.challenges);
    await tx.delete(schema.commitmentTemplates);
  });
}

export async function handleClearDbCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  const userId = ctx.from?.id;

  if (!data || !userId) {
    await ctx.answerCallbackQuery({ text: "Ошибка", show_alert: true });
    return;
  }

  if (!config.adminTelegramId || userId !== config.adminTelegramId) {
    await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    return;
  }

  if (data === "clear_db_no") {
    await ctx.answerCallbackQuery({ text: "Отменено" });
    await ctx.editMessageText("✅ Очистка базы отменена.");
    return;
  }

  if (data !== "clear_db_yes") {
    await ctx.answerCallbackQuery({ text: "Ошибка данных", show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Очищаю базу..." });
  await ctx.editMessageText("🧹 Очищаю базу данных...");

  await clearDatabase();
  await seedCommitments();

  await ctx.editMessageText("✅ База очищена. Можно начинать с чистого листа.");
}
