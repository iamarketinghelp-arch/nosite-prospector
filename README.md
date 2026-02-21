# NoSite Prospector

**Find local businesses without websites — and turn them into leads.**

NoSite Prospector queries Google Places and Yelp for local businesses, deduplicates results across sources, verifies whether each business has a real first-party website, scores them by lead quality, and surfaces them in a filterable table and map view with CSV and Google Sheets export.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Database | Supabase (PostgreSQL) + Prisma ORM |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand |
| Cache / Queues | Redis (Upstash + BullMQ) |
| Data APIs | Google Places API, Yelp Fusion API |
| Maps | Leaflet + OpenStreetMap (React-Leaflet) |
| Payments | Stripe |
| Testing | Jest (unit/integration), Playwright (E2E) |
| Logging | Pino (structured JSON) |
| Error Tracking | Sentry |
| CI/CD | GitHub Actions → Vercel |

---

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Fill in required values (see Environment Variables section in CLAUDE.md)

# Run database migrations
npx prisma migrate dev

# Seed the database (directory allowlist, scoring config, plan config)
npx prisma db seed

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Common Commands

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm test                 # Run Jest tests
npx jest --coverage      # Tests with coverage report
npx playwright test      # Run E2E tests
npx prisma migrate dev   # Run database migrations
npx prisma generate      # Regenerate Prisma client
npx prisma db seed       # Seed the database
npx eslint . --fix       # Lint and auto-fix
```

---

## Plans

| Feature | Free | Pro |
|---|---|---|
| Results per search | 50 | 200 |
| Searches per day | 5 | Unlimited |
| CSV export | Yes | Yes |
| Google Sheets export | — | Yes |
| Contact enrichment (v1.1) | — | Yes |

---

## Architecture & Decisions

Key architectural decisions — pricing model, auth provider, map library, website qualification approach, thin-site detection scope, and contact enrichment — are documented with rationale and impact analysis in:

**[PROJECT_DECISIONS.md](./PROJECT_DECISIONS.md)**

---

## Project Structure

```
/src
  /app              → Pages and API routes (Next.js App Router)
    /api/v1/        → All API routes, versioned
    /(auth)/        → Login, signup, callback
    /(dashboard)/   → Authenticated app pages
    /(marketing)/   → Public landing/pricing pages
  /components       → Reusable UI components
  /lib              → Utility functions and shared logic
  /services         → External API service classes
  /types            → TypeScript type definitions
  /hooks            → Custom React hooks
  /store            → Zustand stores
/prisma             → Schema, migrations, seeds
/docs               → Project documentation
/tests              → Integration and E2E tests
```

---

## License

Private — all rights reserved.
