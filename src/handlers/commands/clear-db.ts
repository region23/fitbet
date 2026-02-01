import type { BotContext } from "../../types";
import { InlineKeyboard } from "grammy";
import { config } from "../../config";

export async function clearDbCommand(ctx: BotContext) {
  const isPrivateChat = ctx.chat?.type === "private";
  const userId = ctx.from?.id;

  if (!isPrivateChat) {
    await ctx.reply("Команда /clear_db доступна только в личке с ботом.");
    return;
  }

  if (!userId || !config.adminTelegramId || userId !== config.adminTelegramId) {
    await ctx.reply("Нет доступа к этой команде.");
    return;
  }

  const confirmKeyboard = new InlineKeyboard()
    .text("Да", "clear_db_yes")
    .text("Нет", "clear_db_no");

  await ctx.reply(
    "⚠️ *Очистить базу данных?*\n\n" +
      "Это удалит все данные и сбросит челленджи.\n" +
      "Подтвердите действие.",
    { parse_mode: "Markdown", reply_markup: confirmKeyboard }
  );
}
