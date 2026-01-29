import type { Bot } from "grammy";
import type { BotContext } from "../../types";
import { handleJoinCallback } from "./join";
import {
  handlePaidCallback,
  handleBankHolderCallback,
  handleConfirmPaymentCallback,
} from "./payment";
import { handleCheckinCallback } from "./checkin";

export function setupCallbackHandlers(bot: Bot<BotContext>) {
  // Join challenge
  bot.callbackQuery(/^join_\d+$/, handleJoinCallback);

  // Payment flow
  bot.callbackQuery(/^paid_\d+$/, handlePaidCallback);
  bot.callbackQuery(/^bankholder_\d+_\d+$/, handleBankHolderCallback);
  bot.callbackQuery(/^confirm_\d+$/, handleConfirmPaymentCallback);

  // Check-in
  bot.callbackQuery(/^checkin_\d+$/, handleCheckinCallback);
}
