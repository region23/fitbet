import type { Bot } from "grammy";
import type { BotContext } from "../../types";
import { startCommand } from "./start";
import { createCommand } from "./create";
import { bankholderCommand } from "./bankholder";
import { statusCommand } from "./status";
import { helpCommand } from "./help";

export function setupCommandHandlers(bot: Bot<BotContext>) {
  bot.command("start", startCommand);
  bot.command("create", createCommand);
  bot.command("bankholder", bankholderCommand);
  bot.command("status", statusCommand);
  bot.command("help", helpCommand);
}
