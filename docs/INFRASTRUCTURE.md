# NoSite Prospector — Infrastructure Provisioning Guide

Step-by-step instructions for provisioning and configuring all infrastructure services required to run NoSite Prospector.

---

## Table of Contents

1. [PostgreSQL Database (Supabase)](#1-postgresql-database-supabase)
2. [Redis (Upstash)](#2-redis-upstash)
3. [Deployment — Vercel (Frontend + API)](#3-deployment--vercel-frontend--api)
4. [Deployment — Railway (Background Workers)](#4-deployment--railway-background-workers)
5. [Environment Variables in Vercel](#5-environment-variables-in-vercel)
6. [Verification](#6-verification)

---

## 1. PostgreSQL Database (Supabase)

### Why Supabase

Supabase is the recommended provider because it bundles managed PostgreSQL, authentication, real-time subscriptions, and storage in a single dashboard. This eliminates the need for a separate auth provider and reduces the number of vendor accounts from day one.

### Alternatives Considered

| Provider    | Pros                                                  | Cons                                                                           |
| ----------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Neon**    | Serverless PG, branching, generous free tier (0.5 GB) | No built-in auth — requires adding Clerk/Auth0 separately                      |
| **Railway** | Simple PG provisioning, good DX                       | Smaller free tier (500 hrs/month shared across all services), no built-in auth |

### Provisioning Steps

1. Go to [supabase.com](https://supabase.com) and sign in (GitHub login recommended).

2. Click **New Project**.

3. Configure the project:
   - **Name:** `nosite-prospector`
   - **Database password:** Generate a strong password (save it in your password manager)
   - **Region:** Select the region closest to your users (e.g., `us-east-1` for US)
   - **Plan:** Free tier (500 MB database, 50K monthly active users)

4. Wait ~2 minutes for provisioning to complete.

5. Collect credentials from **Project Settings → API**:

   | Dashboard Field    | Env Var                    | Notes                       |
   | ------------------ | -------------------------- | --------------------------- |
   | Project URL        | `NEXT_PUBLIC_SUPABASE_URL` | Safe for browser            |
   | `anon` public key  | `SUPABASE_ANON_KEY`        | Safe for browser            |
   | `service_role` key | `SUPABASE_SERVICE_KEY`     | Backend only — never expose |

6. Collect database connection strings from **Project Settings → Database**:

   **Pooled connection (for Prisma runtime queries):**

   ```
   postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```

   Set as `DATABASE_URL` in `.env.local`.

   **Direct connection (for Prisma migrations):**

   ```
   postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
   ```

   Set as `DIRECT_URL` in `.env.local`.

7. Verify the connection:

   ```bash
   npx tsx scripts/verify-infra.ts
   ```

### Supabase Free Tier Limits

| Resource                  | Limit      |
| ------------------------- | ---------- |
| Database size             | 500 MB     |
| Monthly active users      | 50,000     |
| Edge function invocations | 500K/month |
| Storage                   | 1 GB       |
| Bandwidth                 | 2 GB       |

---

## 2. Redis (Upstash)

### Why Upstash

Upstash provides serverless Redis with a REST API, making it compatible with Vercel's edge runtime and serverless functions. No persistent connections needed — each request is a stateless HTTP call.

### Alternatives Considered

| Provider          | Pros                                      | Cons                                                           |
| ----------------- | ----------------------------------------- | -------------------------------------------------------------- |
| **Redis Cloud**   | Managed Redis, generous free tier (30 MB) | Requires persistent connections — incompatible with serverless |
| **Railway Redis** | Simple setup, same dashboard as app       | Shared resource hours with app, requires connection pooling    |

### Provisioning Steps

1. Go to [upstash.com](https://upstash.com) and sign in.

2. Click **Create Database**.

3. Configure:
   - **Name:** `nosite-prospector`
   - **Type:** Regional
   - **Region:** Match your Vercel deployment region (e.g., `us-east-1`)
   - **Eviction:** Enabled (safe for cache/quota use cases)

4. Click **Create**.

5. Collect credentials from the **REST API** section:

   | Dashboard Field            | Env Var       |
   | -------------------------- | ------------- |
   | `UPSTASH_REDIS_REST_URL`   | `REDIS_URL`   |
   | `UPSTASH_REDIS_REST_TOKEN` | `REDIS_TOKEN` |

6. Test the connection:

   ```bash
   npx tsx scripts/test-redis.ts
   ```

### Upstash Free Tier Limits

| Resource               | Limit  |
| ---------------------- | ------ |
| Commands/day           | 10,000 |
| Data size              | 256 MB |
| Concurrent connections | 100    |

### Usage in the App

| Purpose                        | Key Pattern                   | TTL           |
| ------------------------------ | ----------------------------- | ------------- |
| Daily search quota counters    | `quota:{userId}:{YYYY-MM-DD}` | 86,400s (24h) |
| BullMQ job queue (HEAD checks) | Managed by BullMQ             | N/A           |
| API response cache             | `cache:{endpoint}:{hash}`     | 300s (5 min)  |

---

## 3. Deployment — Vercel (Frontend + API)

### Why Vercel

Vercel is the native deployment target for Next.js. It handles builds, CDN, serverless functions, and preview deploys with zero configuration. Every PR gets a preview URL automatically.

### Setup Steps

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.

2. Click **Add New → Project**.

3. Import the `nosite-prospector` repository from GitHub.

4. Configure the project:
   - **Framework Preset:** Next.js (auto-detected)
   - **Root Directory:** `.` (repository root)
   - **Build Command:** `npm run build` (default)
   - **Output Directory:** `.next` (default)
   - **Install Command:** `npm ci` (default)

5. Add environment variables (see [Section 5](#5-environment-variables-in-vercel)).

6. Click **Deploy**.

7. After deployment completes, note your production URL (e.g., `nosite-prospector.vercel.app`).

### Vercel Configuration

The project includes a `vercel.json` at the repository root with the following settings:

- Function timeout: 30 seconds (Pro plan allows up to 60s)
- Function memory: 1024 MB
- Region: `iad1` (US East, matching Supabase and Upstash regions)
- Security headers on all routes
- Cache headers for static assets

### Preview Deployments

Every push to a non-`main` branch creates a preview deployment automatically. Preview deploys:

- Use the **Preview** environment variables in Vercel (map these to your `stg` Doppler config)
- Get a unique URL: `nosite-prospector-<hash>.vercel.app`
- Are linked in the GitHub PR as a status check

### Vercel Free Tier Limits (Hobby)

| Resource                      | Limit              |
| ----------------------------- | ------------------ |
| Bandwidth                     | 100 GB/month       |
| Serverless function execution | 100 GB-hours/month |
| Builds                        | 6,000 min/month    |
| Deployments                   | Unlimited          |

---

## 4. Deployment — Railway (Background Workers)

### Why Railway for Workers

Vercel serverless functions have a maximum execution time of 10–60 seconds — too short for long-running HEAD check jobs. Railway provides persistent Node.js processes suitable for BullMQ workers that process background jobs for minutes at a time.

### Setup Steps

1. Go to [railway.app](https://railway.app) and sign in with GitHub.

2. Click **New Project → Deploy from GitHub repo**.

3. Select the `nosite-prospector` repository.

4. Configure the service:
   - **Service name:** `head-check-worker`
   - **Start command:** `npx tsx src/workers/headCheckWorker.ts`
   - **Watch paths:** `src/workers/**`, `src/services/qualifier/**`

5. Add environment variables (same secrets as the Vercel deployment):
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `REDIS_URL`
   - `REDIS_TOKEN`
   - `SUPABASE_SERVICE_KEY`

6. Deploy.

### Railway Free Tier Limits (Trial)

| Resource        | Limit                                  |
| --------------- | -------------------------------------- |
| Execution hours | 500 hrs/month (shared across services) |
| Memory          | 512 MB per service                     |
| vCPU            | 0.5 vCPU                               |

> **Upgrade path:** The Developer plan ($5/month + usage) removes the 500-hour limit and increases memory to 8 GB.

### Health Check

Railway supports health check endpoints. Configure in the Railway dashboard:

- **Health check path:** `/health` (if the worker exposes an HTTP server)
- **Restart policy:** On failure, with exponential backoff

---

## 5. Environment Variables in Vercel

### Adding Variables

1. In the Vercel dashboard, go to **Project → Settings → Environment Variables**.

2. Add each variable with the appropriate environment scope:

   | Variable                             | Production | Preview | Development |
   | ------------------------------------ | ---------- | ------- | ----------- |
   | `NEXT_PUBLIC_SUPABASE_URL`           | Yes        | Yes     | Yes         |
   | `SUPABASE_ANON_KEY`                  | Yes        | Yes     | Yes         |
   | `SUPABASE_SERVICE_KEY`               | Yes        | Yes     | No          |
   | `DATABASE_URL`                       | Yes        | Yes     | No          |
   | `DIRECT_URL`                         | Yes        | No      | No          |
   | `GOOGLE_PLACES_KEY`                  | Yes        | Yes     | No          |
   | `GOOGLE_GEOCODING_KEY`               | Yes        | Yes     | No          |
   | `YELP_API_KEY`                       | Yes        | Yes     | No          |
   | `REDIS_URL`                          | Yes        | Yes     | Yes         |
   | `REDIS_TOKEN`                        | Yes        | Yes     | Yes         |
   | `STRIPE_SECRET_KEY`                  | Yes        | No      | No          |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes        | Yes     | Yes         |
   | `STRIPE_WEBHOOK_SECRET`              | Yes        | No      | No          |
   | `SENTRY_DSN`                         | Yes        | Yes     | No          |
   | `NEXT_PUBLIC_APP_URL`                | Yes        | Yes     | Yes         |

3. For each variable, select the environments it applies to (Production, Preview, Development).

### Using Doppler Sync (Recommended)

If you configured Doppler (see [docs/SECRETS_MANAGEMENT.md](./SECRETS_MANAGEMENT.md)), the Vercel integration syncs automatically:

- Doppler `prd` config → Vercel **Production**
- Doppler `stg` config → Vercel **Preview**
- Doppler `dev` config → Vercel **Development**

No manual entry needed after initial Doppler-Vercel connection.

### Verifying Variables Are Set

After adding variables, trigger a redeploy and check the build logs for any missing variable warnings. You can also verify via the Vercel CLI:

```bash
vercel env ls
```

---

## 6. Verification

### Run the Infrastructure Verification Script

This script tests connectivity to all infrastructure services and reports their status:

```bash
npx tsx scripts/verify-infra.ts
```

Expected output (when all services are connected):

```
NoSite Prospector — Infrastructure Verification
================================================

[1/2] PostgreSQL (Supabase)
  Connecting... OK
  Tables accessible: yes

[2/2] Redis (Upstash)
  Connecting... OK
  PING response: PONG

================================================
All services connected successfully.
```

### Test Redis Only

```bash
npx tsx scripts/test-redis.ts
```

### Troubleshooting

| Symptom                           | Likely Cause                       | Fix                                                         |
| --------------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| `SUPABASE_SERVICE_KEY is not set` | Missing env var                    | Add to `.env.local` or Doppler                              |
| `Redis: WRONGPASS`                | Token mismatch                     | Re-copy `UPSTASH_REDIS_REST_TOKEN` from Upstash console     |
| `DATABASE_URL connection refused` | IP not allowlisted or wrong region | Check Supabase network settings                             |
| `fetch failed` on Redis           | `REDIS_URL` is wrong format        | Ensure it starts with `https://` (REST URL, not `redis://`) |

---

_Last updated: 2026-02-21_
