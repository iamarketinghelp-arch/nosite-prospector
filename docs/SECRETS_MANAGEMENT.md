# NoSite Prospector — Secrets Management

This document defines how secrets (API keys, database credentials, tokens) are stored, accessed, rotated, and audited across all environments.

---

## Table of Contents

1. [Principles](#1-principles)
2. [Recommended Vault: Doppler](#2-recommended-vault-doppler)
3. [Alternatives Considered](#3-alternatives-considered)
4. [Project Setup in Doppler](#4-project-setup-in-doppler)
5. [Secrets Inventory](#5-secrets-inventory)
6. [Environment Configuration](#6-environment-configuration)
7. [Local Development Workflow](#7-local-development-workflow)
8. [CI/CD Integration (GitHub Actions)](#8-cicd-integration-github-actions)
9. [Vercel Integration](#9-vercel-integration)
10. [Key Rotation Procedures](#10-key-rotation-procedures)
11. [Access Control](#11-access-control)
12. [Audit & Compliance](#12-audit--compliance)

---

## 1. Principles

- **Never commit secrets.** All `.env` files are in `.gitignore`. Secrets live in the vault only.
- **Least privilege.** Each environment gets only the secrets it needs. Service keys are never exposed to frontend code.
- **Rotate proactively.** Keys are rotated on a schedule and immediately on any suspected compromise.
- **Audit trail.** Every secret read, write, and rotation is logged by the vault.
- **Single source of truth.** Doppler is the canonical store. `.env.local` files are developer convenience only, never authoritative.

---

## 2. Recommended Vault: Doppler

**Why Doppler:**

| Factor             | Doppler                                                 |
| ------------------ | ------------------------------------------------------- |
| Setup complexity   | 5-minute setup; CLI-driven                              |
| Free tier          | 5 team members, unlimited secrets, unlimited projects   |
| Vercel integration | Native integration (one-click sync)                     |
| GitHub Actions     | Official action (`dopplerhq/secrets-fetch-action`)      |
| Rotation support   | Version history + rollback on every secret change       |
| Audit log          | Full activity log with user attribution                 |
| Local dev          | `doppler run -- npm run dev` injects secrets at runtime |

Doppler eliminates the need to copy secrets between `.env` files, Vercel dashboard, and CI config. One update propagates everywhere.

---

## 3. Alternatives Considered

### AWS Secrets Manager

| Pros                          | Cons                                         |
| ----------------------------- | -------------------------------------------- |
| Deep AWS integration          | Requires AWS account and IAM setup           |
| Automatic rotation via Lambda | $0.40/secret/month + $0.05 per 10K API calls |
| Native in AWS-hosted stacks   | Overkill for Vercel-deployed Next.js         |

**Verdict:** Best choice if the project moves to AWS ECS/EKS. Not justified for a Vercel + Supabase stack.

### Infisical

| Pros                                   | Cons                                             |
| -------------------------------------- | ------------------------------------------------ |
| Open-source, self-hostable             | Smaller ecosystem than Doppler                   |
| Generous free tier (unlimited secrets) | Vercel integration requires manual webhook setup |
| E2E encrypted                          | Less mature CLI tooling                          |

**Verdict:** Strong alternative if self-hosting or open-source preference is a priority. Consider for v2 if vendor lock-in becomes a concern.

---

## 4. Project Setup in Doppler

### 4.1 Install the CLI

```bash
# macOS
brew install dopplerhq/cli/doppler

# Linux
curl -sLf https://cli.doppler.com/install.sh | sh

# Verify
doppler --version
```

### 4.2 Authenticate

```bash
doppler login
```

This opens a browser window for OAuth. After login, the CLI stores a token locally.

### 4.3 Create the Project

```bash
doppler projects create nosite-prospector
```

### 4.4 Create Environments

Doppler creates `dev`, `stg`, and `prd` configs by default under the project. Verify:

```bash
doppler configs list --project nosite-prospector
```

You should see:

| Config | Purpose                             |
| ------ | ----------------------------------- |
| `dev`  | Local development                   |
| `stg`  | Staging (preview deploys on Vercel) |
| `prd`  | Production                          |

If they don't exist, create them:

```bash
doppler configs create --project nosite-prospector --environment dev
doppler configs create --project nosite-prospector --environment stg
doppler configs create --project nosite-prospector --environment prd
```

### 4.5 Link the Local Repo

In the project root:

```bash
doppler setup --project nosite-prospector --config dev
```

This creates a `.doppler.yaml` (gitignored automatically by Doppler CLI).

---

## 5. Secrets Inventory

Add every secret below to each Doppler environment. Values differ per environment (e.g., test Stripe keys in `dev`, live keys in `prd`).

### Backend-Only Secrets (never prefix with `NEXT_PUBLIC_`)

| Secret Name             | Description                                      | Provider     |
| ----------------------- | ------------------------------------------------ | ------------ |
| `GOOGLE_PLACES_KEY`     | Google Places API key (IP-restricted)            | Google Cloud |
| `GOOGLE_GEOCODING_KEY`  | Google Geocoding API key (IP-restricted)         | Google Cloud |
| `YELP_API_KEY`          | Yelp Fusion API key                              | Yelp         |
| `DATABASE_URL`          | Pooled PostgreSQL connection string              | Supabase     |
| `DIRECT_URL`            | Direct PostgreSQL connection string (migrations) | Supabase     |
| `SUPABASE_SERVICE_KEY`  | Supabase service role key (bypasses RLS)         | Supabase     |
| `REDIS_URL`             | Upstash Redis REST URL                           | Upstash      |
| `REDIS_TOKEN`           | Upstash Redis REST token                         | Upstash      |
| `STRIPE_SECRET_KEY`     | Stripe secret key                                | Stripe       |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret                    | Stripe       |
| `SENTRY_DSN`            | Sentry project DSN                               | Sentry       |

### Frontend-Safe Secrets (prefixed with `NEXT_PUBLIC_`)

| Secret Name                          | Description              | Provider |
| ------------------------------------ | ------------------------ | -------- |
| `NEXT_PUBLIC_SUPABASE_URL`           | Supabase project URL     | Supabase |
| `SUPABASE_ANON_KEY`                  | Supabase anon/public key | Supabase |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key   | Stripe   |
| `NEXT_PUBLIC_SENTRY_DSN`             | Sentry DSN (client-side) | Sentry   |
| `NEXT_PUBLIC_APP_URL`                | App base URL             | Self     |

### Adding Secrets via CLI

```bash
# Add one secret at a time
doppler secrets set GOOGLE_PLACES_KEY "AIzaSy..." --project nosite-prospector --config dev

# Or upload from an existing .env.local (one-time migration)
doppler secrets upload .env.local --project nosite-prospector --config dev
```

---

## 6. Environment Configuration

| Environment | Doppler Config | Supabase Project | Stripe Mode            | Redis Instance                   |
| ----------- | -------------- | ---------------- | ---------------------- | -------------------------------- |
| Development | `dev`          | `nosite-dev`     | Test keys (`sk_test_`) | `nosite-dev` (Upstash free tier) |
| Staging     | `stg`          | `nosite-stg`     | Test keys (`sk_test_`) | `nosite-stg` (Upstash free tier) |
| Production  | `prd`          | `nosite-prod`    | Live keys (`sk_live_`) | `nosite-prod` (Upstash paid)     |

> Use separate Supabase projects for each environment to ensure complete data isolation.

---

## 7. Local Development Workflow

### Option A: Doppler CLI (Recommended)

Doppler injects secrets as environment variables at runtime. No `.env.local` file needed.

```bash
doppler run -- npm run dev
```

Add a convenience script to `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:doppler": "doppler run -- next dev"
  }
}
```

### Option B: `.env.local` Fallback

If a team member cannot install the Doppler CLI:

```bash
# Pull secrets into a local .env file (gitignored)
doppler secrets download --no-file --format env > .env.local
```

This file must never be committed. It is already listed in `.gitignore`.

---

## 8. CI/CD Integration (GitHub Actions)

### Install the Doppler GitHub Action

In `.github/workflows/ci.yml`:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Doppler CLI
        uses: dopplerhq/cli-action@v3

      - name: Fetch secrets
        run: doppler secrets download --no-file --format env > .env.test
        env:
          DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN_DEV }}

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
```

### Setting Up the Doppler Service Token

1. In the Doppler dashboard, go to **nosite-prospector → dev → Access**.
2. Click **Generate Service Token**.
3. Name it `github-actions-dev` and copy the token.
4. In GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**.
5. Name: `DOPPLER_TOKEN_DEV`, Value: the service token.

Repeat for `stg` and `prd` configs as needed.

---

## 9. Vercel Integration

### One-Time Setup

1. In the Doppler dashboard, go to **Integrations → Vercel**.
2. Click **Connect** and authorize Doppler to access your Vercel account.
3. Map configs to Vercel environments:
   - `dev` → Vercel **Development**
   - `stg` → Vercel **Preview**
   - `prd` → Vercel **Production**
4. Doppler automatically syncs secrets to Vercel environment variables.

After setup, any secret change in Doppler propagates to Vercel within seconds. No manual Vercel env var management required.

---

## 10. Key Rotation Procedures

### Google Cloud API Keys (Places + Geocoding)

| Step | Action                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------- |
| 1    | Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).      |
| 2    | Click **Create Credentials → API Key**. A new key is generated.                                     |
| 3    | Apply the same restrictions as the old key (IP restriction, API restriction to Places + Geocoding). |
| 4    | Update `GOOGLE_PLACES_KEY` and/or `GOOGLE_GEOCODING_KEY` in Doppler (`prd` config).                 |
| 5    | Verify the app works with the new key (search for a test location).                                 |
| 6    | Delete the old key in the Google Cloud Console.                                                     |
| 7    | Log the rotation in the team incident/ops channel.                                                  |

**Rotation cadence:** Every 90 days, or immediately on suspected compromise.

### Yelp Fusion API Key

| Step | Action                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------- |
| 1    | Go to [api.yelp.com/manage_api_keys](https://api.yelp.com/manage_api_keys).                       |
| 2    | Yelp does not support creating a second key on the same app. Create a new app to get a fresh key. |
| 3    | Update `YELP_API_KEY` in Doppler (`prd` config).                                                  |
| 4    | Verify the app returns Yelp results for a test search.                                            |
| 5    | Delete the old Yelp app.                                                                          |
| 6    | Log the rotation.                                                                                 |

**Rotation cadence:** Every 90 days, or immediately on suspected compromise.

> **Note:** Yelp's model ties the key to an app registration. Rotating requires creating a new app. Plan for ~5 minutes of downtime on the Yelp data source during switchover unless you use a zero-downtime approach (set new key, verify, then remove old app).

### Supabase Keys (Anon + Service Role)

Supabase anon and service role keys are derived from the project's JWT secret. To rotate:

| Step | Action                                                                    |
| ---- | ------------------------------------------------------------------------- |
| 1    | In the Supabase dashboard, go to **Project Settings → API**.              |
| 2    | Under **JWT Settings**, click **Generate new JWT secret**.                |
| 3    | This regenerates both `anon` and `service_role` keys. Copy both.          |
| 4    | Update `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_KEY` in Doppler (`prd`). |
| 5    | Redeploy the app (all active sessions will be invalidated).               |
| 6    | Log the rotation.                                                         |

**Rotation cadence:** Every 180 days, or immediately on suspected compromise.

> **Impact:** Rotating the JWT secret invalidates all existing user sessions. Users must log in again. Schedule during low-traffic windows.

### Supabase Database Password

| Step | Action                                                                                |
| ---- | ------------------------------------------------------------------------------------- |
| 1    | In the Supabase dashboard: **Project Settings → Database → Reset database password**. |
| 2    | Generate a new password.                                                              |
| 3    | Update `DATABASE_URL` and `DIRECT_URL` in Doppler (replace the password segment).     |
| 4    | Redeploy the app. Prisma will reconnect automatically.                                |
| 5    | Run `npx prisma migrate status` against the new URL to verify connectivity.           |
| 6    | Log the rotation.                                                                     |

**Rotation cadence:** Every 90 days, or immediately on suspected compromise.

### Upstash Redis Token

| Step | Action                                                                           |
| ---- | -------------------------------------------------------------------------------- |
| 1    | In the Upstash console, go to your database detail page.                         |
| 2    | Under **REST API**, click **Reset Token**.                                       |
| 3    | Copy the new `UPSTASH_REDIS_REST_TOKEN`.                                         |
| 4    | Update `REDIS_TOKEN` in Doppler (`prd`).                                         |
| 5    | Verify the app can read/write Redis (run a test search and check quota counter). |
| 6    | Log the rotation.                                                                |

**Rotation cadence:** Every 90 days, or immediately on suspected compromise.

### Stripe Keys

| Step | Action                                                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1    | In the Stripe dashboard: **Developers → API keys → Roll key**.                                                                     |
| 2    | Stripe generates a new key and gives you a grace period to migrate (72h for secret key).                                           |
| 3    | Update `STRIPE_SECRET_KEY` in Doppler (`prd`).                                                                                     |
| 4    | For the webhook secret: go to **Developers → Webhooks → Signing secret → Roll secret**. Update `STRIPE_WEBHOOK_SECRET` in Doppler. |
| 5    | Redeploy the app.                                                                                                                  |
| 6    | Verify by creating a test checkout session.                                                                                        |
| 7    | Log the rotation.                                                                                                                  |

**Rotation cadence:** Every 90 days, or immediately on suspected compromise.

---

## 11. Access Control

| Role                   | Doppler Access            | Secrets Visibility                   |
| ---------------------- | ------------------------- | ------------------------------------ |
| Founder / Lead         | Admin on all configs      | Full read/write                      |
| Backend Developer      | Member on `dev` and `stg` | Read on `dev`/`stg`, no `prd` access |
| Frontend Developer     | Member on `dev` only      | Read `NEXT_PUBLIC_*` vars only       |
| CI/CD (GitHub Actions) | Service token per config  | Read-only, scoped to specific config |
| Vercel (Deployment)    | Integration sync          | Automatic, read-only                 |

> Use Doppler's **Workplace Roles** to enforce these boundaries. Never share service tokens across environments.

---

## 12. Audit & Compliance

### Activity Log

Doppler's activity log records every event:

- Secret created, updated, or deleted
- User who made the change
- Timestamp and IP address
- Config (environment) affected

Access via: **Doppler Dashboard → Project → Activity**.

### Pre-Launch Checklist

- [ ] All `prd` secrets are set and verified in Doppler
- [ ] No `.env` files exist in the git history (`git log --all --full-history -- '*.env*'`)
- [ ] `SUPABASE_SERVICE_KEY` is not referenced in any `NEXT_PUBLIC_` variable
- [ ] Vercel integration is syncing `prd` config
- [ ] Budget alert set on Google Cloud at $50/month
- [ ] Stripe webhook endpoint configured for production URL
- [ ] All team members have appropriate Doppler access levels
- [ ] Rotation calendar is set (90-day cadence for all keys)

---

_Last updated: 2026-02-21_
