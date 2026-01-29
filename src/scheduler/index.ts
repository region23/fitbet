import { CronJob } from "cron";
import type { Bot } from "grammy";
import type { BotContext } from "../types";
import { runOpenCheckinJob } from "./jobs/open-checkin";
import { runReminderJob } from "./jobs/reminder";
import { runCloseCheckinJob } from "./jobs/close-checkin";
import { runFinaleJob } from "./jobs/finale";

let cronJob: CronJob | null = null;

export function startScheduler(bot: Bot<BotContext>) {
  // Run all jobs every hour
  cronJob = new CronJob(
    "0 * * * *", // Every hour at minute 0
    async () => {
      console.log(`[${new Date().toISOString()}] Running scheduled jobs...`);

      try {
        // Order matters: open first, then reminder, then close
        await runOpenCheckinJob(bot);
        await runReminderJob(bot);
        await runCloseCheckinJob(bot);
        await runFinaleJob(bot);

        console.log(`[${new Date().toISOString()}] Scheduled jobs completed`);
      } catch (error) {
        console.error("Error in scheduled jobs:", error);
      }
    },
    null, // onComplete
    true, // start immediately
    "Europe/Moscow" // timezone
  );

  console.log("Scheduler started (hourly jobs)");

  // Run once on startup to catch up on any missed jobs
  setTimeout(async () => {
    console.log("Running initial job check on startup...");
    try {
      await runOpenCheckinJob(bot);
      await runReminderJob(bot);
      await runCloseCheckinJob(bot);
      await runFinaleJob(bot);
    } catch (error) {
      console.error("Error in startup job check:", error);
    }
  }, 5000); // Wait 5 seconds for bot to be fully ready
}

export function stopScheduler() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log("Scheduler stopped");
  }
}
