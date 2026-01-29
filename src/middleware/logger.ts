import type { BotContext } from "../types";
import type { NextFunction } from "grammy";

export async function loggerMiddleware(ctx: BotContext, next: NextFunction) {
  const start = Date.now();

  const updateType = ctx.update ? Object.keys(ctx.update).filter(k => k !== "update_id")[0] : "unknown";
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const text = ctx.message?.text?.slice(0, 50);

  console.log(`[${new Date().toISOString()}] <- ${updateType} from user:${userId} chat:${chatId}${text ? ` "${text}"` : ""}`);

  await next();

  const ms = Date.now() - start;
  console.log(`[${new Date().toISOString()}] -> Processed in ${ms}ms`);
}
