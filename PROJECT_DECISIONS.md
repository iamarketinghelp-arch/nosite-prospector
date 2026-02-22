# NoSite Prospector — Architectural Decision Record

This document captures the key architectural decisions made at project inception, with rationale and downstream impact on the system design.

---

## Decision 1: Pricing Model

**Decision:** Monthly seat fee with result-count tiers (Free / Pro)

**Options Considered:**

| Option             | Description                                                           |
| ------------------ | --------------------------------------------------------------------- |
| Per-search credits | Users buy credit packs; each search costs N credits                   |
| Monthly seat fee   | Flat monthly subscription with generous limits                        |
| Result-count tiers | Subscription tiers differentiated by results/search and search volume |

**Chosen Option:** Monthly subscription with result-count tiers (Free and Pro), enforced at the API layer.

**Rationale:**

- Per-search credits create friction and anxiety ("am I wasting a credit?"), which reduces activation and daily usage — bad for a discovery tool that benefits from frequent use.
- Flat seat fee without differentiation makes upsell paths opaque and allows free-tier abuse.
- Result-count tiers (Free: 50 results/search, 5 searches/day; Pro: 200 results, unlimited searches) provide a natural, self-evident upgrade trigger: users who find value hit the cap and convert. This is proven in comparable prospecting tools (Hunter.io, Apollo).
- Monthly billing reduces churn risk compared to credit burn-down and simplifies Stripe integration (subscriptions, not one-off charges).

**Impact on Architecture:**

- `plan_type` field on the `users` table drives quota enforcement.
- A `QuotaService` is called at the start of every `/api/v1/search` request; it reads plan limits from a `plan_config` table (not hardcoded) so limits can be tuned without deploys.
- Stripe webhook handler updates `plan_type` on subscription events (`customer.subscription.updated`, `customer.subscription.deleted`).
- Free-tier daily search count resets at UTC midnight; a Redis counter keyed by `user_id:date` tracks intraday usage.

---

## Decision 2: Auth Provider

**Decision:** Supabase Auth

**Options Considered:**

| Option        | Notes                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| Supabase Auth | Included with Supabase; covers email/password + OAuth; row-level security integrates natively          |
| Clerk         | Excellent DX, polished hosted UI, but adds a paid third-party dependency and a separate identity layer |
| Auth0         | Enterprise-grade, but significant configuration overhead and cost at scale                             |

**Chosen Option:** Supabase Auth (email/password + Google OAuth)

**Rationale:**

- Supabase Auth is bundled with the Supabase plan already required for the database. Using it avoids a separate vendor, separate JWT issuer, and separate pricing tier.
- Row-Level Security (RLS) policies in Postgres can reference `auth.uid()` directly, eliminating the need for a middleware ownership check on every query.
- For a solo/small-team SaaS MVP, Clerk's better-polished UI isn't worth the added dependency surface or the migration cost if requirements change.
- Auth0's complexity is disproportionate to the MVP's needs.

**Impact on Architecture:**

- All Next.js API routes authenticate via `getServerSession()` (using the Supabase session cookie). No custom JWT parsing.
- The Prisma `users` table stores `supabase_user_id` as a foreign key anchor, synced via a Supabase `auth.users` trigger on first sign-in.
- Protected routes use a shared `requireAuth()` middleware that returns a 401 envelope if the session is absent.
- Google OAuth callback is handled by Supabase's built-in OAuth flow; no custom callback route is needed beyond setting the redirect URL in the Supabase dashboard.

---

## Decision 3: Map Library

**Decision:** Leaflet + OpenStreetMap (React-Leaflet)

**Options Considered:**

| Option                     | Cost                       | Notes                                                                  |
| -------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| Leaflet + OpenStreetMap    | Free                       | No per-load cost; large ecosystem; OSM tiles free for moderate traffic |
| Google Maps JavaScript API | ~$7/1,000 loads            | Best geocoding quality; familiar UX; adds cost from day 1              |
| Mapbox GL JS               | Free up to 50K loads/month | More polished styling options; requires Mapbox account/token           |

**Chosen Option:** Leaflet + OpenStreetMap via `react-leaflet`

**Rationale:**

- The MVP map view is a simple pin display — no turn-by-turn routing, no custom vector tiles, no Street View. Leaflet covers this fully for zero cost.
- OpenStreetMap tiles have no per-load cost under normal usage, eliminating a variable cost line from the MVP budget.
- Swapping in Google Maps or Mapbox later requires only a tile provider change and a minor component refactor — the data model is not affected.
- Avoiding Google Maps API at MVP stage also avoids a second Google Cloud billing dependency alongside the Places API.

**Impact on Architecture:**

- `MapView` component is isolated in `/src/components/results/MapView.tsx` behind a named export, making provider swaps surgical.
- Coordinates come from the Places/Yelp API responses and are stored on the `businesses` table as `latitude` and `longitude` (float columns). No geocoding library is needed at render time.
- The `react-leaflet` package requires a client-side render guard (`dynamic(() => import(...), { ssr: false })`) due to the `window` dependency — this is documented in the component file.

---

## Decision 4: Website HEAD-Check Approach

**Decision:** Async background HEAD checks — show preliminary results immediately, update `website_evidence` live

**Options Considered:**

| Option                                                     | UX                   | Complexity                                                            |
| ---------------------------------------------------------- | -------------------- | --------------------------------------------------------------------- |
| Synchronous — block response until all checks complete     | Simple backend logic | Poor UX; 10–50 businesses × up to 2s per HEAD check = 20–100s latency |
| Async — return results immediately, poll or stream updates | Excellent UX         | Moderate complexity; requires polling endpoint or SSE                 |
| Async with server-sent events (SSE)                        | Best real-time feel  | Higher complexity; stateful connection management                     |

**Chosen Option:** Async HEAD checks with polling. Results are returned immediately; `website_evidence` is `null` on first load and populated in the background. The client polls `/api/v1/searches/:id/status` at a 2-second interval until all checks are complete.

**Rationale:**

- Blocking a search on 50+ HEAD checks would make the product feel broken. Leading prospecting tools (Apollo, Hunter) all return results first and enrich asynchronously.
- Polling is simpler to implement and debug than SSE or WebSockets, with no persistent connection management. For a tool used in desktop sessions (not mobile real-time), 2-second polling intervals are imperceptible.
- SSE deferred to v1.1 if user feedback indicates polling latency is noticeable.

**Impact on Architecture:**

- `QualificationService.enqueueChecks(searchId)` is called after search results are persisted. It pushes job payloads to a Redis queue (BullMQ).
- A background worker (Next.js Route Handler or a standalone Node worker, depending on deployment) processes HEAD check jobs and writes results to `business_website_evidence` table rows.
- The `businesses` row includes a `qualification_status` enum: `pending | checking | complete | failed`.
- Client-side `useSearch` hook polls the status endpoint and merges incoming `website_evidence` updates into the Zustand store, triggering a re-render of the `ResultsTable` score column.

---

## Decision 5: Thin-Site Heuristics Scope

**Decision:** Thin-site detection deferred to v1.1

**Options Considered:**

| Option                                                                                                  | Scope                                                     |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| MVP: detect thin sites (Linktree, GoDaddy Website Builder, Carrd, etc.) and flag them as "no real site" | Increases lead quality; complex to maintain               |
| MVP: only check for presence/absence of any HTTP response                                               | Simpler; occasionally flags thin sites as "has a website" |
| v1.1: add thin-site heuristics layer after validating core product                                      | Balanced approach                                         |

**Chosen Option:** Thin-site detection deferred to v1.1. MVP only performs an HTTP HEAD check against the business URL and classifies any 2xx/3xx response as "has a website."

**Rationale:**

- The directory allowlist (27 known directory domains: Yelp, Google Maps, Facebook, etc.) already filters the most common false positives. Businesses with only a Yelp page will not be filtered out.
- Thin-site patterns (Linktree, GoDaddy Websites Now, Carrd, About.me) are a second-order problem. Most local businesses with no real web presence either have nothing or are on one of the known directories.
- Maintaining a thin-site heuristic list requires ongoing updates as new site builders emerge. This maintenance burden is inappropriate for MVP.
- Users can manually flag thin sites via the UI; this signal will inform the v1.1 heuristic ruleset.

**Impact on Architecture:**

- `QualificationService` checks URL against the `directory_domains` table (27 entries, seeded) before performing a HEAD check. If the URL matches, the business is classified `NO_SITE (directory only)`.
- `website_evidence` schema includes a `detection_method` field (`head_check | directory_match | thin_site`) so future thin-site detection can be added without a schema migration.
- A `user_flags` table captures manual thin-site flags from the UI, linked to `business_id` and `user_id`. This data is collected in MVP but not acted on until v1.1.

---

## Decision 6: Contact Enrichment Partner

**Decision:** Contact enrichment deferred to v1.1

**Options Considered:**

| Option                          | API Cost               | Notes                                                            |
| ------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| Hunter.io                       | ~$49/mo (500 searches) | Best for domain-to-email lookup; strong deliverability data      |
| Apollo.io                       | ~$49/mo                | Broader B2B data; better for named contacts at SMBs              |
| Clearbit                        | Usage-based; $99+/mo   | Most comprehensive; best for tech companies, less for local SMBs |
| Deferred — no enrichment in MVP | $0                     | Validate core product before adding data costs                   |

**Chosen Option:** No contact enrichment in MVP. Deferred to v1.1.

**Rationale:**

- The core value proposition — finding businesses without websites — is independent of contact data. MVP validates this before layering on enrichment cost.
- Local SMBs (the target segment) have lower Apollo/Clearbit coverage than the tech companies those tools are optimized for. The ROI on enrichment APIs is uncertain until we know which business categories our users target most.
- Adding an enrichment API in MVP would require: a new API key/secret, per-lookup billing, rate-limit handling, and a data storage model for enriched contacts. These are non-trivial additions that could delay the MVP launch.
- Hunter.io is the preferred choice for v1.1 due to its domain-to-email model (we have the domain from the HEAD check), its transparent deliverability scoring, and its affordable entry tier.

**Impact on Architecture:**

- The `businesses` table includes `owner_name`, `owner_email`, `owner_phone` columns (nullable) as stubs, so v1.1 enrichment results can be written without a schema migration.
- `EnrichmentService` interface is defined in `/src/services/enrichment.ts` (stub, not implemented in MVP) with a `enrich(businessId: string): Promise<EnrichmentResult>` signature. This allows v1.1 to implement Hunter.io without changing call sites.
- CSV export includes the enrichment stub columns with empty values in MVP, so the export schema is stable across the v1.0→v1.1 upgrade.

---

_Last updated: 2026-02-21_
_Maintained by: Project Architect_
