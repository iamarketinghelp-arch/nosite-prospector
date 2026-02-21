# CLAUDE.md — NoSite Prospector

## Project Overview

NoSite Prospector is a SaaS tool that finds local businesses WITHOUT websites. Users search by location, and the app queries Google Places and Yelp, deduplicates results across sources, qualifies businesses by verifying they have no first-party website, scores them by lead quality, and presents them in a filterable table + map view with CSV and Google Sheets export.

## Tech Stack

- **Framework:** Next.js 14 (App Router, /src directory structure)
- **Language:** TypeScript (strict mode)
- **Database:** Supabase (managed PostgreSQL)
- **ORM:** Prisma
- **Auth:** Supabase Auth (email/password + Google OAuth)
- **Styling:** Tailwind CSS + shadcn/ui
- **State Management:** Zustand
- **Cache:** Redis (Upstash)
- **Data APIs:** Google Places API, Google Geocoding API, Yelp Fusion API
- **Maps:** Leaflet + OpenStreetMap (React-Leaflet)
- **Payments:** Stripe
- **Validation:** Zod
- **Tables:** @tanstack/react-table + @tanstack/react-virtual
- **Testing:** Jest (unit/integration), Playwright (E2E)
- **Logging:** Pino (structured JSON)
- **Error Tracking:** Sentry
- **CI/CD:** GitHub Actions → Vercel

## Directory Structure

```
/src
  /app              → Pages and API routes (Next.js App Router)
    /api/v1/        → All API routes, versioned
    /(auth)/        → Login, signup, callback
    /(dashboard)/   → Authenticated app pages
    /(marketing)/   → Public landing/pricing pages
    /(legal)/       → Terms, privacy
  /components       → Reusable UI components
    /ui/            → Base components (LoadingSpinner, ScoreBadge, SourceIcon)
    /layouts/       → DashboardLayout, AuthLayout
    /search/        → SearchForm and related
    /results/       → ResultsTable, MapView, FilterPanel, DetailDrawer
  /lib              → Utility functions and shared logic
  /services         → External API service classes (googlePlaces, yelp, qualifier, scorer, etc.)
  /types            → TypeScript type definitions
  /hooks            → Custom React hooks (useSearch, useFilters, useUser)
  /store            → Zustand stores (searchStore, uiStore, authStore)
/prisma             → Schema, migrations, seeds
/docs               → Project documentation
/scripts            → Utility and verification scripts
/tests              → Integration and E2E tests
```

## Coding Conventions

- **Imports:** Use path aliases — `@/` maps to `./src/`
- **Components:** Functional components with TypeScript props interfaces. Default exports for pages, named exports for reusable components.
- **API Routes:** Always use the `apiResponse` helper for consistent `{data, error, meta}` envelope. Always validate input with Zod. Always authenticate with `getServerSession()`.
- **Error Handling:** Wrap route handlers with `errorHandler` middleware. Use structured logging via `@/lib/logger`. Never expose internal errors to clients.
- **Database:** All queries through Prisma. Never use raw SQL string interpolation. Always use parameterized queries.
- **State:** Zustand for global state. React useState for local component state. No Redux.
- **Styling:** Tailwind utility classes. shadcn/ui for complex components. No CSS modules or styled-components.
- **Lists/Bullets in code comments:** Use standard markdown, not unicode bullets.
- **Environment variables:** Never hardcode secrets. All secrets come from env vars. Frontend-safe vars use `NEXT_PUBLIC_` prefix.

## Git Conventions

- **Branch naming:** `feature/*`, `bugfix/*`, `hotfix/*`
- **Commits:** Conventional commits — `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`
- **PRs:** Require review + passing CI before merge to main

## Key Architecture Decisions

- **Async HEAD checks:** Search results return immediately; website qualification runs in the background and updates results live.
- **Multi-source dedup:** Google and Yelp results are merged using a 2-of-4 matching rule (name similarity, phone match, geo proximity, category overlap).
- **Directory allowlist:** 27 known directory domains (yelp.com, google.com, facebook.com, etc.) are stored in the DB. URLs matching these domains do NOT count as a "real website."
- **Scoring:** 0–6.0 scale based on configurable weights stored in the `scoring_config` table. Not hardcoded.
- **Plan enforcement:** Free = 50 results/search, 5 searches/day. Pro = 200 results, unlimited. Enforced at the API layer.

## Testing

- **Unit tests:** Jest. Run with `npm test`.
- **Integration tests:** Jest with mocked external APIs. Target ≥ 80% coverage on `/src/services/`.
- **E2E tests:** Playwright against Chromium, Firefox, WebKit. Run with `npx playwright test`.
- **Coverage:** `npx jest --coverage`

## Common Commands

```bash
npm run dev              # Start dev server on localhost:3000
npm run build            # Production build
npm test                 # Run Jest tests
npx jest --coverage      # Run tests with coverage report
npx playwright test      # Run E2E tests
npx prisma migrate dev   # Run database migrations
npx prisma generate      # Regenerate Prisma client
npx prisma db seed       # Seed the database
npx eslint . --fix       # Lint and auto-fix
```

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key (frontend) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (backend only) |
| `DATABASE_URL` | PostgreSQL connection string |
| `GOOGLE_PLACES_KEY` | Google Places + Geocoding API key |
| `YELP_API_KEY` | Yelp Fusion API key |
| `REDIS_URL` | Upstash Redis connection URL |
| `STRIPE_SECRET_KEY` | Stripe secret key (backend only) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (frontend) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `SENTRY_DSN` | Sentry error tracking DSN |

## Build Playbook

This project is being built sequentially using the NoSite Prospector Prompt Playbook. Each prompt produces complete, runnable code — no placeholders or TODOs. Prompts are executed in order, one at a time, with a git commit after each successful prompt.

Current progress: **Starting build — Prompt 0.4 (Repo Init)**
