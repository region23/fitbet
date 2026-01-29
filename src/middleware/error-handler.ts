import type { BotError } from "grammy";
import type { BotContext } from "../types";

export function errorHandler(err: BotError<BotContext>) {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  console.error(err.error);

  // Try to notify the user about the error
  const chatId = ctx.chat?.id;
  if (chatId) {
    ctx.api
      .sendMessage(chatId, "Произошла ошибка. Попробуйте позже или начните заново с /start")
      .catch((e) => console.error("Failed to send error message:", e));
  }
}
