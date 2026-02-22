/**
 * scripts/test-redis.ts
 *
 * Tests connectivity to the Upstash Redis instance.
 * Verifies PING, SET/GET, and TTL operations.
 *
 * Usage:
 *   npx tsx scripts/test-redis.ts
 *
 * Requires env vars: REDIS_URL, REDIS_TOKEN
 */

import { Redis } from "@upstash/redis";

const REDIS_URL = process.env.REDIS_URL;
const REDIS_TOKEN = process.env.REDIS_TOKEN;

async function testRedis(): Promise<boolean> {
  console.log("Redis Connection Test");
  console.log("=====================\n");

  if (!REDIS_URL || !REDIS_TOKEN) {
    console.error("ERROR: REDIS_URL and REDIS_TOKEN must be set in environment.");
    console.error(
      "  Set them in .env.local or run via: doppler run -- npx tsx scripts/test-redis.ts",
    );
    return false;
  }

  console.log(`  URL: ${REDIS_URL.substring(0, 30)}...`);

  const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });

  // Test 1: PING
  console.log("\n[1/3] PING");
  try {
    const pong = await redis.ping();
    if (pong === "PONG") {
      console.log("  Result: PONG — connection successful");
    } else {
      console.error(`  Unexpected response: ${pong}`);
      return false;
    }
  } catch (err) {
    console.error(`  PING failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }

  // Test 2: SET/GET
  const testKey = `__verify_infra_test_${Date.now()}`;
  const testValue = "nosite-prospector-ok";

  console.log("\n[2/3] SET/GET");
  try {
    await redis.set(testKey, testValue, { ex: 10 });
    const retrieved = await redis.get<string>(testKey);
    if (retrieved === testValue) {
      console.log("  SET/GET: value round-tripped successfully");
    } else {
      console.error(`  GET returned unexpected value: ${retrieved}`);
      return false;
    }
  } catch (err) {
    console.error(`  SET/GET failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }

  // Test 3: TTL
  console.log("\n[3/3] TTL");
  try {
    const ttl = await redis.ttl(testKey);
    if (ttl > 0 && ttl <= 10) {
      console.log(`  TTL: ${ttl}s remaining (expected ≤10s) — TTL working`);
    } else {
      console.error(`  Unexpected TTL: ${ttl}`);
      return false;
    }
  } catch (err) {
    console.error(`  TTL check failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }

  // Cleanup
  await redis.del(testKey);

  console.log("\n=====================");
  console.log("All Redis tests passed.\n");
  return true;
}

testRedis().then((success) => {
  process.exit(success ? 0 : 1);
});
