import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import type { BotContext } from "./types";
import { createInitialSessionData } from "./types/session";
import { config } from "./config";
import { loggerMiddleware, errorHandler } from "./middleware";

// Import conversations
import { challengeSetupConversation } from "./conversations/challenge-setup";
import { onboardingConversation } from "./conversations/onboarding";
import { checkinConversation } from "./conversations/checkin";
import { bankHolderVotingConversation } from "./conversations/bankholder-voting";

// Import handlers
import { setupCommandHandlers } from "./handlers/commands";
import { setupCallbackHandlers } from "./handlers/callbacks";

// Commands for private chats
const privateCommands = [
  { command: "start", description: "Начать работу с ботом" },
  { command: "status", description: "Статус участия в челленджах" },
  { command: "help", description: "Справка по боту" },
];

// Commands for group chats
const groupCommands = [
  { command: "create", description: "Создать новый челлендж" },
  { command: "bankholder", description: "Запустить голосование за Bank Holder" },
  { command: "status", description: "Статус челленджа в этой группе" },
  { command: "help", description: "Справка по боту" },
];

export async function registerCommands(bot: Bot<BotContext>) {
  try {
    // Register commands for private chats
    await bot.api.setMyCommands(privateCommands, {
      scope: { type: "all_private_chats" },
    });

    // Register commands for group chats
    await bot.api.setMyCommands(groupCommands, {
      scope: { type: "all_group_chats" },
    });

    // Register commands for supergroups
    await bot.api.setMyCommands(groupCommands, {
      scope: { type: "all_chat_administrators" },
    });

    console.log("Bot commands registered successfully");
  } catch (error) {
    console.error("Failed to register commands:", error);
  }
}

export function createBot() {
  const bot = new Bot<BotContext>(config.botToken);

  // Error handling
  bot.catch(errorHandler);

  // Logging middleware
  bot.use(loggerMiddleware);

  // Session middleware
  bot.use(
    session({
      initial: createInitialSessionData,
    })
  );

  // Conversations plugin
  bot.use(conversations());

  // Register conversations
  bot.use(createConversation(challengeSetupConversation));
  bot.use(createConversation(onboardingConversation));
  bot.use(createConversation(checkinConversation));
  bot.use(createConversation(bankHolderVotingConversation));

  // Setup command handlers
  setupCommandHandlers(bot);

  // Setup callback query handlers
  setupCallbackHandlers(bot);

  return bot;
}
