import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdirSync } from "fs";
import { dirname } from "path";
import * as schema from "./schema";
import { config } from "../config";

// Ensure database directory exists
if (config.databaseUrl.startsWith("file:")) {
  const dbPath = config.databaseUrl.replace("file:", "");
  const dbDir = dirname(dbPath);
  mkdirSync(dbDir, { recursive: true });
}

const client = createClient({
  url: config.databaseUrl,
});

export const db = drizzle(client, { schema });

export { schema };

export async function runMigrations() {
  console.log("Running database migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations completed");
}
