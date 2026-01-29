import path from "node:path";

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

export const config = {
  botToken: getEnvOrThrow("BOT_TOKEN"),
  databaseUrl: getEnvOrDefault("DATABASE_URL", "file:./data/fitbet.db"),
  openRouterApiKey: getEnvOrDefault("OPENROUTER_API_KEY", ""),
  sentryDsn: getEnvOrDefault("SENTRY_DSN", ""),
  nodeEnv: getEnvOrDefault("NODE_ENV", "development"),

  // Storage paths
  photosDirectory: path.join(process.cwd(), "data/photos"),

  // Check-in settings
  checkinWindowHours: 48,
  reminderHoursBeforeClose: 12,

  // Default challenge settings
  defaultDisciplineThreshold: 0.8,
  defaultMaxSkips: 2,
} as const;
