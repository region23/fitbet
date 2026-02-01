import path from "node:path";
import { normalizeDurationUnit } from "./utils/duration";

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getNumberEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const config = {
  botToken: getEnvOrThrow("BOT_TOKEN"),
  databaseUrl: getEnvOrDefault("DATABASE_URL", "file:./data/fitbet.db"),
  openRouterApiKey: getEnvOrDefault("OPENROUTER_API_KEY", ""),
  sentryDsn: getEnvOrDefault("SENTRY_DSN", ""),
  nodeEnv: getEnvOrDefault("NODE_ENV", "development"),
  adminTelegramId: getNumberEnv("ADMIN_TELEGRAM_ID", 0) || null,
  challengeDurationUnit: normalizeDurationUnit(
    getEnvOrDefault("CHALLENGE_DURATION_UNIT", "months")
  ),

  // Storage paths
  photosDirectory: path.join(process.cwd(), "data/photos"),

  // Check-in settings
  checkinWindowHours: 48,
  reminderHoursBeforeClose: 12,
  checkinPeriodDays: getNumberEnv("CHECKIN_PERIOD_DAYS", 14),
  checkinPeriodMinutes: getNumberEnv("CHECKIN_PERIOD_MINUTES", 0),

  // Default challenge settings
  defaultDisciplineThreshold: 0.8,
  defaultMaxSkips: 2,
} as const;
