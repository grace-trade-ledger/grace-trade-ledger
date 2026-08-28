/**
 * Production start-up entrypoint (used as the deployed service's start command).
 * Applies pending migrations, seeds the demo dataset ONLY if the database is
 * genuinely empty (so a redeploy/restart never wipes real data once the system
 * is actually in use), then starts the API server.
 */
import "dotenv/config";
import { execSync } from "child_process";
import { db } from "./db/client";
import * as s from "./db/schema";

async function main() {
  console.log("Applying database migrations…");
  execSync("npx drizzle-kit migrate", { stdio: "inherit" });

  const existing = await db.select().from(s.companies).limit(1);
  if (existing.length === 0) {
    console.log("Database is empty — running one-time demo seed…");
    const { runSeed } = await import("./db/seed");
    await runSeed();
  } else {
    console.log("Database already has data — skipping seed.");
  }

  await import("./server");
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
