# NoSite Prospector — API Setup Guide

This guide walks through creating and configuring every external account and API key required to run NoSite Prospector. Complete these steps before running `npm run dev` for the first time.

All values collected here go into your `.env.local` file. Copy `.env.example` to get started:

```bash
cp .env.example .env.local
```

---

## Table of Contents

1. [Google Cloud (Places + Geocoding APIs)](#1-google-cloud-places--geocoding-apis)
2. [Yelp Fusion API](#2-yelp-fusion-api)
3. [Mapbox / OSM Nominatim (Map Geocoding Fallback)](#3-mapbox--osm-nominatim)
4. [Supabase (Database + Auth)](#4-supabase-database--auth)
5. [Redis — Upstash (Cache + Job Queue)](#5-redis--upstash)
6. [Quick Reference: Environment Variables](#6-quick-reference-environment-variables)

---

## 1. Google Cloud (Places + Geocoding APIs)

### 1.1 Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Click the project selector at the top → **New Project**.
3. Name it `nosite-prospector` (or similar).
4. Click **Create** and wait for the project to initialize.
5. Make sure the new project is selected in the top bar.

### 1.2 Enable Billing

Google Places API requires a billing account. The free tier is generous ($200/month credit), but a card is required.

1. In the left sidebar: **Billing** → **Link a billing account**.
2. Create or link an existing billing account.

### 1.3 Enable Required APIs

1. Go to **APIs & Services** → **Library**.
2. Search for and enable each of the following:
   - **Places API** (not "Places API (New)" — use the legacy v1 for maximum SDK compatibility)
   - **Geocoding API**
   - **Maps JavaScript API** (needed if you later switch to Google Maps embed)
3. After enabling, confirm each appears under **APIs & Services → Enabled APIs**.

### 1.4 Create API Keys

You need **two restricted keys**: one for backend (server-to-server, IP-restricted) and one for future frontend use (HTTP-referrer-restricted). For MVP, you can use a single backend key for both Places and Geocoding if you prefer.

#### Backend key (IP-restricted)

1. Go to **APIs & Services → Credentials** → **Create Credentials → API key**.
2. Click **Edit API key** on the new key.
3. Under **Application restrictions**, select **IP addresses**.
4. Add the IP address(es) of your Vercel deployment or your local server. For local dev, you can temporarily set this to **None** and tighten before production.
5. Under **API restrictions**, select **Restrict key** and choose:
   - Places API
   - Geocoding API
6. Name the key `nosite-backend` and click **Save**.
7. Copy the key value → set as `GOOGLE_PLACES_KEY` and `GOOGLE_GEOCODING_KEY` in `.env.local`.

> **Note:** If you create separate keys for Places and Geocoding, restrict each key to its respective API only.

#### Frontend key (HTTP-referrer-restricted) — optional at MVP

1. Repeat the key creation steps above.
2. Under **Application restrictions**, select **HTTP referrers (websites)**.
3. Add your domains: `localhost:3000/*` and `https://yourapp.com/*`.
4. Under **API restrictions**, restrict to **Maps JavaScript API** only.
5. Name the key `nosite-frontend`. This key will be used as `NEXT_PUBLIC_GOOGLE_MAPS_KEY` if/when Google Maps embed is enabled.

### 1.5 Default Quotas

| API                        | Default Quota       |
| -------------------------- | ------------------- |
| Places API (Nearby Search) | 5,000 requests/day  |
| Geocoding API              | 40,000 requests/day |

These quotas can be raised via a quota increase request in the console if needed.

### 1.6 Set a Budget Alert

Prevents runaway API costs.

1. In the left sidebar, go to **Billing → Budgets & alerts**.
2. Click **Create Budget**.
3. Scope: select the `nosite-prospector` project.
4. Set the budget amount to **$50/month**.
5. Set alert thresholds at 50%, 90%, and 100%.
6. Add your email as a notification recipient.
7. Click **Save**.

> The $200/month free credit means you are unlikely to be charged during development, but the alert is good practice before any production traffic.

---

## 2. Yelp Fusion API

### 2.1 Create a Developer Account

1. Go to [api.yelp.com](https://api.yelp.com).
2. Click **Create App** (or sign up if you don't have a Yelp account).
3. Fill in the app registration form:
   - **App Name:** `NoSite Prospector`
   - **Industry:** `Software & Technology`
   - **Contact Email:** your email
   - **Description:** `Lead generation tool for finding local businesses without websites`
4. Accept the Yelp API Terms of Use.
5. Click **Create New App**.

### 2.2 Obtain the API Key

1. After creation, you will be redirected to your app's detail page.
2. Copy the **API Key** value.
3. Set it as `YELP_API_KEY` in `.env.local`.

### 2.3 Rate Limits

| Limit                                 | Value           |
| ------------------------------------- | --------------- |
| Daily request quota                   | 5,000 calls/day |
| Per-second rate limit                 | 5 calls/second  |
| Results per request (Business Search) | Max 50          |
| Total results accessible via offset   | Max 1,000       |

The Yelp API does not require billing setup — the key works immediately on the free tier. There is no paid tier upgrade for higher quotas; if you need more, contact Yelp's partner team.

> **Implementation note:** The `YelpService` must enforce a 200ms minimum delay between calls (5 calls/second = 1 call per 200ms) using a rate-limiter backed by Redis to prevent 429 errors under concurrent search load.

---

## 3. Mapbox / OSM Nominatim

The app uses **Leaflet + OpenStreetMap** for the map display. Geocoding (converting a user-typed address into lat/lng coordinates) uses OSM Nominatim by default.

### OSM Nominatim (Default — Free)

No account or key required. Nominatim is called via a public endpoint:

```
https://nominatim.openstreetmap.org/search?q=...&format=json
```

**Usage policy constraints:**

| Constraint      | Value                                        |
| --------------- | -------------------------------------------- |
| Rate limit      | 1 request/second (hard limit)                |
| Bulk geocoding  | Not permitted                                |
| Required header | `User-Agent: NoSite Prospector <your-email>` |

Set the `User-Agent` header on every Nominatim request in `GeocodingService`. No env var needed.

**Suitable for:** MVP and low-to-medium traffic. Nominatim is sufficient as long as geocoding is only called once per user search (not per result row).

### Mapbox (Upgrade Path — Optional)

Use Mapbox if Nominatim's 1 req/sec limit becomes a bottleneck.

1. Go to [account.mapbox.com](https://account.mapbox.com) and create a free account.
2. Under **Tokens**, click **Create a token**.
3. Name it `nosite-prospector-geocoding`.
4. Under **Token scopes**, enable: `styles:read`, `geocoding:read`.
5. Copy the token (starts with `pk.`).
6. Uncomment `MAPBOX_PUBLIC_TOKEN` in `.env.local` and paste the value.

**Mapbox free tier:** 100,000 geocoding requests/month. Paid plans start at $0.75 per 1,000 additional requests.

> **Architecture note:** The `GeocodingService` (`/src/services/geocoding.ts`) checks for the presence of `MAPBOX_PUBLIC_TOKEN` at startup. If present, it uses the Mapbox Geocoding API. If absent, it falls back to OSM Nominatim.

---

## 4. Supabase (Database + Auth)

### 4.1 Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (GitHub login recommended).
2. Click **New Project**.
3. Choose your organization.
4. Fill in:
   - **Project name:** `nosite-prospector`
   - **Database password:** Generate a strong password and save it in your password manager.
   - **Region:** Choose the region closest to your users (e.g., `us-east-1`).
5. Click **Create new project** and wait ~2 minutes for provisioning.

### 4.2 Collect Project Credentials

1. In the Supabase dashboard, go to **Project Settings → API**.
2. Copy the following values to `.env.local`:

| Setting               | Env Var                    |
| --------------------- | -------------------------- |
| Project URL           | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` / `public` key | `SUPABASE_ANON_KEY`        |
| `service_role` key    | `SUPABASE_SERVICE_KEY`     |

> **Security:** The `service_role` key bypasses Row Level Security. Never expose it in client-side code or `NEXT_PUBLIC_` variables.

### 4.3 Collect Database Connection Strings

1. Go to **Project Settings → Database**.
2. Under **Connection string**, select **URI** format.
3. Copy two connection strings:

**Pooled (for runtime queries via Prisma):**

```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

Set as `DATABASE_URL` in `.env.local`. Append `?pgbouncer=true&connection_limit=1` if you see connection exhaustion errors on Vercel's serverless functions.

**Direct (for Prisma migrations only):**

```
postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
```

Set as `DIRECT_URL` in `.env.local`. Add to `prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

### 4.4 Configure Auth Providers

**Email/Password:**

- Enabled by default. No configuration needed.

**Google OAuth:**

1. Go to **Authentication → Providers → Google**.
2. Toggle **Enable Google provider** on.
3. You will need a Google OAuth 2.0 client ID and secret:
   - In Google Cloud Console: **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**.
   - Application type: **Web application**.
   - Authorized redirect URIs: `https://[your-project-ref].supabase.co/auth/v1/callback`
   - Copy the **Client ID** and **Client Secret** into the Supabase Google provider form.
4. In Supabase **Authentication → URL Configuration**, set:
   - **Site URL:** `http://localhost:3000` (update to production URL before launch)
   - **Redirect URLs:** `http://localhost:3000/auth/callback`

### 4.5 Run Migrations

After setting `DATABASE_URL` and `DIRECT_URL`:

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

---

## 5. Redis — Upstash

Upstash provides serverless Redis with a generous free tier, compatible with Vercel's serverless deployment model.

### 5.1 Create an Upstash Account

1. Go to [upstash.com](https://upstash.com) and sign up (GitHub login available).

### 5.2 Create a Redis Database

1. In the Upstash console, click **Create Database**.
2. Fill in:
   - **Name:** `nosite-prospector`
   - **Type:** Regional
   - **Region:** Choose the region closest to your Vercel deployment (e.g., `us-east-1`)
   - **Eviction:** Enabled (allows Redis to evict LRU keys if memory is full — safe for cache/quota use)
3. Click **Create**.

### 5.3 Collect Connection Details

1. On the database detail page, find the **REST API** section.
2. Copy:

| Value                        | Env Var       |
| ---------------------------- | ------------- |
| **UPSTASH_REDIS_REST_URL**   | `REDIS_URL`   |
| **UPSTASH_REDIS_REST_TOKEN** | `REDIS_TOKEN` |

Paste both into `.env.local`.

### 5.4 Free Tier Limits

| Limit                      | Value  |
| -------------------------- | ------ |
| Max commands/day           | 10,000 |
| Max data size              | 256 MB |
| Max concurrent connections | 100    |
| Price                      | Free   |

The free tier is sufficient for development and early-stage production. Upgrade to the Pay-as-you-go plan if daily command usage consistently exceeds 10,000.

### 5.5 Usage in the App

Redis is used for two purposes:

| Purpose                        | Key Pattern                   | TTL                             |
| ------------------------------ | ----------------------------- | ------------------------------- |
| Daily search quota counters    | `quota:{userId}:{YYYY-MM-DD}` | 86400s (resets at midnight UTC) |
| BullMQ job queue (HEAD checks) | Managed by BullMQ library     | N/A                             |

---

## 6. Quick Reference: Environment Variables

| Variable                             | Description                                           | Where to find                            |
| ------------------------------------ | ----------------------------------------------------- | ---------------------------------------- |
| `GOOGLE_PLACES_KEY`                  | Google Places API key (IP-restricted, backend)        | Google Cloud Console → Credentials       |
| `GOOGLE_GEOCODING_KEY`               | Google Geocoding API key (IP-restricted, backend)     | Google Cloud Console → Credentials       |
| `YELP_API_KEY`                       | Yelp Fusion API key                                   | api.yelp.com → My App                    |
| `NEXT_PUBLIC_SUPABASE_URL`           | Supabase project URL                                  | Supabase → Project Settings → API        |
| `SUPABASE_ANON_KEY`                  | Supabase public/anon key                              | Supabase → Project Settings → API        |
| `SUPABASE_SERVICE_KEY`               | Supabase service role key (backend only)              | Supabase → Project Settings → API        |
| `DATABASE_URL`                       | Pooled PostgreSQL connection string                   | Supabase → Project Settings → Database   |
| `DIRECT_URL`                         | Direct PostgreSQL connection string (migrations only) | Supabase → Project Settings → Database   |
| `REDIS_URL`                          | Upstash Redis REST URL                                | Upstash console → Database detail        |
| `REDIS_TOKEN`                        | Upstash Redis REST token                              | Upstash console → Database detail        |
| `STRIPE_SECRET_KEY`                  | Stripe secret key (backend only)                      | Stripe Dashboard → Developers → API keys |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key                                | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET`              | Stripe webhook signing secret                         | Stripe Dashboard → Webhooks              |
| `SENTRY_DSN`                         | Sentry DSN for error tracking                         | Sentry → Project Settings → Client Keys  |

See `.env.example` for the full list with placeholder values.

---

_Last updated: 2026-02-21_
