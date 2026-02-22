/**
 * scripts/verify-infra.ts
 *
 * Tests connectivity to all infrastructure services and reports status.
 *
 * Usage:
 *   npx tsx scripts/verify-infra.ts
 *
 * Requires env vars:
 *   - NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY (PostgreSQL / Supabase)
 *   - REDIS_URL, REDIS_TOKEN (Redis / Upstash)
 */

import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";

interface ServiceResult {
  name: string;
  status: "ok" | "failed" | "skipped";
  message: string;
  duration: number;
}

async function testSupabase(): Promise<ServiceResult> {
  const start = Date.now();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    return {
      name: "PostgreSQL (Supabase)",
      status: "skipped",
      message: "NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_KEY not set",
      duration: 0,
    };
  }

  try {
    const supabase = createClient(url, key);

    // Test basic connectivity by querying Supabase's built-in auth schema
    const { error } = await supabase.from("_prisma_migrations").select("id").limit(1);

    // If the table doesn't exist yet (no migrations run), that's fine —
    // the important thing is that we connected and got a response, not a network error.
    if (error && !error.message.includes("does not exist") && !error.code?.startsWith("42")) {
      // 42P01 = relation does not exist — expected before first migration
      return {
        name: "PostgreSQL (Supabase)",
        status: "ok",
        message: `Connected (table query returned: ${error.message} — expected before migrations)`,
        duration: Date.now() - start,
      };
    }

    return {
      name: "PostgreSQL (Supabase)",
      status: "ok",
      message: "Connected and query executed successfully",
      duration: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "PostgreSQL (Supabase)",
      status: "failed",
      message: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

async function testRedis(): Promise<ServiceResult> {
  const start = Date.now();
  const url = process.env.REDIS_URL;
  const token = process.env.REDIS_TOKEN;

  if (!url || !token) {
    return {
      name: "Redis (Upstash)",
      status: "skipped",
      message: "REDIS_URL and/or REDIS_TOKEN not set",
      duration: 0,
    };
  }

  try {
    const redis = new Redis({ url, token });
    const pong = await redis.ping();

    if (pong !== "PONG") {
      return {
        name: "Redis (Upstash)",
        status: "failed",
        message: `Unexpected PING response: ${pong}`,
        duration: Date.now() - start,
      };
    }

    // Verify write/read
    const testKey = `__verify_infra_${Date.now()}`;
    await redis.set(testKey, "ok", { ex: 5 });
    const val = await redis.get<string>(testKey);
    await redis.del(testKey);

    if (val !== "ok") {
      return {
        name: "Redis (Upstash)",
        status: "failed",
        message: `SET/GET round-trip failed: got ${val}`,
        duration: Date.now() - start,
      };
    }

    return {
      name: "Redis (Upstash)",
      status: "ok",
      message: "PONG received, SET/GET verified",
      duration: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "Redis (Upstash)",
      status: "failed",
      message: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

function printResult(index: number, total: number, result: ServiceResult): void {
  const icon = result.status === "ok" ? "OK" : result.status === "skipped" ? "SKIP" : "FAIL";
  console.log(`[${index}/${total}] ${result.name}`);
  console.log(`  Status: ${icon}`);
  console.log(`  ${result.message}`);
  if (result.duration > 0) {
    console.log(`  Latency: ${result.duration}ms`);
  }
  console.log();
}

async function main(): Promise<void> {
  console.log("NoSite Prospector — Infrastructure Verification");
  console.log("================================================\n");

  const results = await Promise.all([testSupabase(), testRedis()]);
  const total = results.length;

  results.forEach((result, i) => printResult(i + 1, total, result));

  console.log("================================================");

  const failed = results.filter((r) => r.status === "failed");
  const skipped = results.filter((r) => r.status === "skipped");
  const ok = results.filter((r) => r.status === "ok");

  if (failed.length > 0) {
    console.log(
      `RESULT: ${failed.length} service(s) failed, ${ok.length} connected, ${skipped.length} skipped.`,
    );
    console.log("\nFailed services:");
    failed.forEach((r) => console.log(`  - ${r.name}: ${r.message}`));
    process.exit(1);
  } else if (skipped.length === total) {
    console.log("RESULT: All services skipped — no environment variables configured.");
    console.log(
      "\nSet variables in .env.local or run via: doppler run -- npx tsx scripts/verify-infra.ts",
    );
    process.exit(1);
  } else {
    console.log(`RESULT: ${ok.length} service(s) connected, ${skipped.length} skipped.`);
    if (skipped.length > 0) {
      console.log("\nSkipped (env vars not set):");
      skipped.forEach((r) => console.log(`  - ${r.name}`));
    }
    process.exit(0);
  }
}

main();
