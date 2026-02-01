import { CronJob } from "cron";
import type { Bot } from "grammy";
import type { BotContext } from "../types";
import { runOpenCheckinJob } from "./jobs/open-checkin";
import { runReminderJob } from "./jobs/reminder";
import { runCloseCheckinJob } from "./jobs/close-checkin";
import { runFinaleJob } from "./jobs/finale";
import { runBankHolderElectionTimeoutJob } from "./jobs/bankholder-election";
import { runOnboardingTimeoutJob } from "./jobs/onboarding-timeout";
import { config } from "../config";

let cronJob: CronJob | null = null;

export function startScheduler(bot: Bot<BotContext>) {
  const cronSpec =
    config.checkinPeriodMinutes > 0 && config.checkinPeriodMinutes < 60
      ? "* * * * *"
      : "0 * * * *";

  // Run jobs on schedule (minute-level when testing short periods)
  cronJob = new CronJob(
    cronSpec, // Every minute if needed, otherwise hourly
    async () => {
      console.log(`[${new Date().toISOString()}] Running scheduled jobs...`);

      try {
        // Order matters: open first, then reminder, then close
        await runOpenCheckinJob(bot);
        await runReminderJob(bot);
        await runCloseCheckinJob(bot);
        await runFinaleJob(bot);
        await runBankHolderElectionTimeoutJob(bot);
        await runOnboardingTimeoutJob(bot);

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
      await runBankHolderElectionTimeoutJob(bot);
      await runOnboardingTimeoutJob(bot);
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
