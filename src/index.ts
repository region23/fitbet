import { config } from "./config";
import * as Sentry from "@sentry/bun";

// Initialize Sentry before other imports
if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.nodeEnv,
  });
}

import { createBot, registerCommands } from "./bot";
import { startScheduler, stopScheduler } from "./scheduler";
import { runMigrations } from "./db";
import { seedCommitments } from "./db/seed";

async function main() {
  console.log("Starting FitBet bot...");
  console.log(`Environment: ${config.nodeEnv}`);

  // Run database migrations
  try {
    await runMigrations();
  } catch (error) {
    console.error("Error running migrations:", error);
    process.exit(1);
  }

  // Seed default data
  try {
    await seedCommitments();
  } catch (error) {
    console.error("Error seeding database:", error);
  }

  // Create bot
  const bot = createBot();

  // Register commands with Telegram (for autocomplete hints)
  await registerCommands(bot);

  // Start scheduler
  startScheduler(bot);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down...");
    stopScheduler();
    await bot.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start bot
  console.log("Bot is starting...");
  await bot.start({
    onStart: (botInfo) => {
      console.log(`Bot @${botInfo.username} is running!`);
    },
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
