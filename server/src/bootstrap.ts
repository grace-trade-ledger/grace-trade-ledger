/**
 * Production start-up entrypoint (used as the deployed service's start command).
 * Applies pending migrations, seeds the demo dataset ONLY if the database is
 * genuinely empty (so a redeploy/restart never wipes real data once the system
 * is actually in use), then starts the API server.
 */
import "dotenv/config";
import { execSync } from "child_process";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import * as s from "./db/schema";

/** A product code that only exists once the real 2025–2026 historical data has been loaded. */
const REAL_DATA_MARKER_PRODUCT_CODE = "1509";

async function main() {
  console.log("Applying database migrations…");
  execSync("npx drizzle-kit migrate", { stdio: "inherit" });

  const existing = await db.select().from(s.companies).limit(1);
  const [realDataMarker] = existing.length
    ? await db.select().from(s.products).where(eq(s.products.productCode, REAL_DATA_MARKER_PRODUCT_CODE)).limit(1)
    : [];

  if (existing.length === 0) {
    // Brand-new database — load the real historical dataset directly (no demo data first).
    console.log("Database is empty — loading GRACE's real 2025–2026 import history…");
    const { runRealDataSeed } = await import("./db/seedReal");
    await runRealDataSeed();
  } else if (!realDataMarker) {
    // Already has data, but it's the placeholder demo dataset from before the real data was
    // available — upgrade it in place. seedReal.ts truncates every business table itself before
    // reloading, so this is safe to run on a database that's actually been used since the demo seed.
    console.log("Database has the demo dataset — replacing it with GRACE's real 2025–2026 import history…");
    const { runRealDataSeed } = await import("./db/seedReal");
    await runRealDataSeed();
  } else {
    console.log("Database already has the real historical dataset — skipping seed.");
  }

  await import("./server");
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
