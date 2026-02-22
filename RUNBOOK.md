# NoSite Prospector — Operations Runbook

Quick-reference procedures for routine operations and incident response.

For detailed secrets vault setup, see [docs/SECRETS_MANAGEMENT.md](./docs/SECRETS_MANAGEMENT.md).

---

## Table of Contents

1. [Key Rotation](#1-key-rotation)
2. [Redis Cache Operations](#2-redis-cache-operations)
3. [Manual Recheck Batch](#3-manual-recheck-batch)
4. [Deployment](#4-deployment)
5. [Incident Response Quick Reference](#5-incident-response-quick-reference)

---

## 1. Key Rotation

All key rotations follow the same pattern: create new key → update Doppler → verify → delete old key → log.

### 1.1 Google Cloud API Keys (Places + Geocoding)

**When:** Every 90 days, or immediately on suspected compromise.

```bash
# 1. Create new key in Google Cloud Console
#    → console.cloud.google.com → APIs & Services → Credentials → Create Credentials → API Key
#    Apply same restrictions: IP restriction + API restriction (Places, Geocoding)

# 2. Update in Doppler
doppler secrets set GOOGLE_PLACES_KEY "AIzaSy_NEW_KEY" --project nosite-prospector --config prd
doppler secrets set GOOGLE_GEOCODING_KEY "AIzaSy_NEW_KEY" --project nosite-prospector --config prd

# 3. Vercel auto-syncs via Doppler integration. Trigger a redeploy:
vercel --prod

# 4. Verify — run a test search and confirm Google results appear
curl -s https://yourapp.com/api/v1/health | jq .services.google

# 5. Delete old key in Google Cloud Console

# 6. Log the rotation
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | GOOGLE_PLACES_KEY + GOOGLE_GEOCODING_KEY rotated | operator: $(whoami)" >> ops.log
```

### 1.2 Yelp Fusion API Key

**When:** Every 90 days, or immediately on suspected compromise.

```bash
# 1. Create a new app at api.yelp.com (Yelp ties keys to app registrations)
#    → api.yelp.com → Create App → copy new API key

# 2. Update in Doppler
doppler secrets set YELP_API_KEY "NEW_YELP_KEY" --project nosite-prospector --config prd

# 3. Redeploy
vercel --prod

# 4. Verify — search and confirm Yelp results appear
curl -s https://yourapp.com/api/v1/health | jq .services.yelp

# 5. Delete old Yelp app at api.yelp.com

# 6. Log
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | YELP_API_KEY rotated | operator: $(whoami)" >> ops.log
```

### 1.3 Supabase Keys (JWT Secret Rotation)

**When:** Every 180 days, or immediately on suspected compromise.

**Impact:** All active user sessions are invalidated. Users must log in again. Schedule during low-traffic windows.

```bash
# 1. In Supabase dashboard: Project Settings → API → JWT Settings → Generate new JWT secret
#    Copy the new anon key and service role key

# 2. Update in Doppler
doppler secrets set SUPABASE_ANON_KEY "NEW_ANON_KEY" --project nosite-prospector --config prd
doppler secrets set SUPABASE_SERVICE_KEY "NEW_SERVICE_KEY" --project nosite-prospector --config prd

# 3. Redeploy
vercel --prod

# 4. Verify — confirm auth flow works (log in with a test account)

# 5. Log
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | Supabase JWT secret rotated | operator: $(whoami)" >> ops.log
```

### 1.4 Supabase Database Password

**When:** Every 90 days, or immediately on suspected compromise.

```bash
# 1. In Supabase dashboard: Project Settings → Database → Reset database password
#    Generate and copy the new password

# 2. Update the password segment in both connection strings in Doppler
doppler secrets set DATABASE_URL "postgresql://postgres.ref:NEW_PASS@..." --project nosite-prospector --config prd
doppler secrets set DIRECT_URL "postgresql://postgres:NEW_PASS@..." --project nosite-prospector --config prd

# 3. Redeploy
vercel --prod

# 4. Verify — confirm database connectivity
doppler run --config prd -- npx prisma migrate status

# 5. Log
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | DATABASE_URL password rotated | operator: $(whoami)" >> ops.log
```

### 1.5 Upstash Redis Token

**When:** Every 90 days, or immediately on suspected compromise.

```bash
# 1. In Upstash console: database detail → REST API → Reset Token
#    Copy the new token

# 2. Update in Doppler
doppler secrets set REDIS_TOKEN "NEW_TOKEN" --project nosite-prospector --config prd

# 3. Redeploy
vercel --prod

# 4. Verify — run a test search and confirm quota counter increments
curl -s https://yourapp.com/api/v1/health | jq .services.redis

# 5. Log
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | REDIS_TOKEN rotated | operator: $(whoami)" >> ops.log
```

### 1.6 Stripe Keys

**When:** Every 90 days, or immediately on suspected compromise.

```bash
# 1. In Stripe dashboard: Developers → API keys → Roll key
#    Stripe provides a 72h grace period for the old secret key

# 2. Update in Doppler
doppler secrets set STRIPE_SECRET_KEY "sk_live_NEW" --project nosite-prospector --config prd

# 3. Roll webhook secret: Developers → Webhooks → endpoint → Roll secret
doppler secrets set STRIPE_WEBHOOK_SECRET "whsec_NEW" --project nosite-prospector --config prd

# 4. Redeploy
vercel --prod

# 5. Verify — create a test checkout or trigger a test webhook event
stripe trigger checkout.session.completed

# 6. Log
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | STRIPE keys rotated | operator: $(whoami)" >> ops.log
```

---

## 2. Redis Cache Operations

### 2.1 Flush All Redis Cache

**When:** After a schema change, corrupted cache data, or as part of a data migration.

**Impact:** All cached data is lost. Quota counters reset (users get fresh daily limits). BullMQ job queue is cleared.

```bash
# Option A: Via Upstash Console
# Go to Upstash console → database → CLI tab → type FLUSHDB

# Option B: Via CLI (requires redis-cli or upstash REST)
# Using Upstash REST API:
curl -X POST "$REDIS_URL/FLUSHDB" \
  -H "Authorization: Bearer $REDIS_TOKEN"

# Option C: Via Doppler-injected env
doppler run --config prd -- node -e "
  const { Redis } = require('@upstash/redis');
  const redis = new Redis({ url: process.env.REDIS_URL, token: process.env.REDIS_TOKEN });
  redis.flushdb().then(r => console.log('FLUSHDB result:', r));
"
```

### 2.2 Flush Quota Counters Only

**When:** To reset a specific user's daily search limit without clearing the full cache.

```bash
# Delete all quota keys for a specific user
doppler run --config prd -- node -e "
  const { Redis } = require('@upstash/redis');
  const redis = new Redis({ url: process.env.REDIS_URL, token: process.env.REDIS_TOKEN });
  const userId = 'USER_ID_HERE';
  const today = new Date().toISOString().split('T')[0];
  redis.del('quota:' + userId + ':' + today).then(r => console.log('Deleted:', r));
"
```

### 2.3 Flush All Quota Counters

**When:** System-wide quota reset (e.g., after a billing change or plan migration).

```bash
doppler run --config prd -- node -e "
  const { Redis } = require('@upstash/redis');
  const redis = new Redis({ url: process.env.REDIS_URL, token: process.env.REDIS_TOKEN });
  // Scan for all quota keys and delete
  async function flushQuotas() {
    let cursor = 0;
    let deleted = 0;
    do {
      const [next, keys] = await redis.scan(cursor, { match: 'quota:*', count: 100 });
      cursor = next;
      if (keys.length > 0) {
        await Promise.all(keys.map(k => redis.del(k)));
        deleted += keys.length;
      }
    } while (cursor !== 0);
    console.log('Deleted', deleted, 'quota keys');
  }
  flushQuotas();
"
```

### 2.4 Inspect BullMQ Job Queue

**When:** Debugging stuck or failed HEAD-check jobs.

```bash
doppler run --config prd -- node -e "
  const { Queue } = require('bullmq');
  const queue = new Queue('head-checks', { connection: { host: process.env.REDIS_HOST, port: 6379 } });
  async function inspect() {
    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    const failed = await queue.getFailedCount();
    const completed = await queue.getCompletedCount();
    console.log({ waiting, active, failed, completed });
  }
  inspect();
"
```

---

## 3. Manual Recheck Batch

### 3.1 Re-Run HEAD Checks for a Specific Search

**When:** HEAD checks failed due to a transient network issue, or you need to re-qualify after fixing a bug.

```bash
# Via API (requires valid auth session)
curl -X POST "https://yourapp.com/api/v1/searches/SEARCH_ID/recheck" \
  -H "Authorization: Bearer SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

### 3.2 Re-Run HEAD Checks for All Pending Businesses

**When:** After a system outage or deployment that interrupted the HEAD-check worker.

```bash
doppler run --config prd -- npx ts-node scripts/recheck-pending.ts
```

The script should:

1. Query `businesses` where `qualification_status = 'pending'` or `qualification_status = 'failed'`.
2. Re-enqueue each business ID into the BullMQ `head-checks` queue.
3. Log the count of re-enqueued jobs.

Example script outline (`scripts/recheck-pending.ts`):

```typescript
import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";

const prisma = new PrismaClient();
const queue = new Queue("head-checks");

async function recheckPending() {
  const businesses = await prisma.business.findMany({
    where: {
      qualification_status: { in: ["pending", "failed"] },
    },
    select: { id: true, website_url: true },
  });

  console.log(`Found ${businesses.length} businesses to recheck`);

  for (const biz of businesses) {
    await queue.add("head-check", {
      businessId: biz.id,
      url: biz.website_url,
    });
  }

  console.log(`Enqueued ${businesses.length} recheck jobs`);
  await prisma.$disconnect();
  process.exit(0);
}

recheckPending();
```

### 3.3 Re-Run HEAD Checks for a Date Range

**When:** Targeted recheck for searches created in a specific window (e.g., during a known outage).

```bash
doppler run --config prd -- npx ts-node scripts/recheck-pending.ts \
  --from "2026-02-20T00:00:00Z" \
  --to "2026-02-21T00:00:00Z"
```

---

## 4. Deployment

### 4.1 Standard Deployment (Vercel)

Every push to `main` triggers an automatic Vercel production deployment.

```bash
# 1. Ensure all tests pass
npm test

# 2. Push to main (triggers Vercel deploy)
git push origin main

# 3. Monitor deployment
vercel ls --prod

# 4. Verify health endpoint
curl -s https://yourapp.com/api/v1/health | jq .
```

### 4.2 Preview Deployment (Staging)

Every push to a non-`main` branch creates a Vercel preview deployment. Doppler syncs `stg` secrets to Vercel preview environments.

```bash
# Push feature branch
git push origin feature/my-feature

# Vercel assigns a preview URL automatically
# Check Vercel dashboard or GitHub PR for the URL
```

### 4.3 Database Migration Deployment

**When:** A Prisma schema change is included in the release.

```bash
# 1. Run migrations against production (uses DIRECT_URL)
doppler run --config prd -- npx prisma migrate deploy

# 2. Verify migration status
doppler run --config prd -- npx prisma migrate status

# 3. Deploy the app
git push origin main

# 4. Verify — check that the app starts and serves requests
curl -s https://yourapp.com/api/v1/health | jq .
```

> **Order matters:** Always run `prisma migrate deploy` before deploying new app code that depends on the schema change. The migration adds columns/tables; the code uses them. If reversed, the code will fail on missing columns.

### 4.4 Rollback

```bash
# 1. Identify the last good deployment
vercel ls --prod

# 2. Promote the previous deployment
vercel promote DEPLOYMENT_URL

# 3. If a database migration must be rolled back, use a revert migration:
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-migrations prisma/migrations --script > rollback.sql
# Review the SQL manually, then execute against the database
doppler run --config prd -- psql "$DIRECT_URL" -f rollback.sql
```

> **Warning:** Database rollbacks can cause data loss. Always back up the affected tables before running rollback SQL.

### 4.5 Emergency Hotfix

```bash
# 1. Create hotfix branch from main
git checkout -b hotfix/fix-description main

# 2. Make the fix, commit
git add -A && git commit -m "fix: description of the fix"

# 3. Push (creates preview deploy for verification)
git push origin hotfix/fix-description

# 4. After verifying the preview deploy, merge to main
gh pr create --title "fix: description" --base main
gh pr merge --squash

# 5. Monitor production deployment
vercel ls --prod
```

---

## 5. Incident Response Quick Reference

### API Key Compromised

1. **Immediately rotate** the compromised key using the procedures in [Section 1](#1-key-rotation).
2. Check the provider's usage dashboard for unauthorized usage.
3. If Google Cloud: check billing for unexpected charges.
4. Notify the team in the ops channel.
5. Review access logs to determine how the key was exposed.
6. File a post-incident report.

### Database Connection Issues

```bash
# Check connection from your machine
doppler run --config prd -- npx prisma migrate status

# Check Supabase status page
# https://status.supabase.com

# If pooler is down, try direct connection temporarily
doppler run --config prd -- psql "$DIRECT_URL" -c "SELECT 1"
```

### Redis Connection Issues

```bash
# Check Upstash status
# https://status.upstash.com

# Test connectivity
curl -s "$REDIS_URL/PING" -H "Authorization: Bearer $REDIS_TOKEN"
# Expected: "PONG"
```

### High API Costs Alert

1. Check Google Cloud billing dashboard for the source of charges.
2. If Places API: verify no runaway loops in search logic.
3. Temporarily disable the affected API route if necessary:
   ```bash
   # Set a kill switch in Redis
   curl -X POST "$REDIS_URL/SET/kill:google_places/1" -H "Authorization: Bearer $REDIS_TOKEN"
   ```
4. Investigate and fix the root cause before re-enabling.

---

_Last updated: 2026-02-21_
