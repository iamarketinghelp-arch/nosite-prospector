# Contributing to NoSite Prospector

## Getting Started

```bash
git clone https://github.com/your-org/nosite-prospector.git
cd nosite-prospector
npm install
cp .env.example .env.local
# Fill in your API keys (see docs/API_SETUP_GUIDE.md)
npm run dev
```

## Branch Naming

All branches must follow these conventions:

| Prefix      | Purpose                 | Example                    |
| ----------- | ----------------------- | -------------------------- |
| `feature/*` | New functionality       | `feature/search-form`      |
| `bugfix/*`  | Bug fixes               | `bugfix/duplicate-results` |
| `hotfix/*`  | Urgent production fixes | `hotfix/api-key-leak`      |

Create your branch from `main`:

```bash
git checkout -b feature/my-feature main
```

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must follow this format:

```
<type>: <short description>

[optional body]
```

### Types

| Type       | When to use                                |
| ---------- | ------------------------------------------ |
| `feat`     | A new feature                              |
| `fix`      | A bug fix                                  |
| `docs`     | Documentation changes only                 |
| `chore`    | Build process, tooling, dependency updates |
| `test`     | Adding or updating tests                   |
| `refactor` | Code restructuring with no behavior change |

### Examples

```
feat: add search form with location autocomplete
fix: prevent duplicate results when Yelp and Google return same business
docs: update API setup guide with Mapbox instructions
chore: upgrade Next.js to 14.2
test: add integration tests for qualification service
refactor: extract dedup logic into shared utility
```

## Pull Requests

1. Push your branch and open a PR against `main`.
2. Fill out the PR template completely.
3. Ensure all CI checks pass (typecheck, lint, format, tests, build).
4. Request a review from at least one team member.
5. Squash-merge after approval.

## Branch Protection (main)

The `main` branch has the following protections:

- Require at least 1 approving review before merge
- Require status checks to pass (CI workflow: lint, typecheck, test, build)
- Require branches to be up to date before merging
- No direct pushes — all changes via PR

To configure these rules in GitHub:

1. Go to **Settings > Branches > Branch protection rules > Add rule**.
2. Branch name pattern: `main`.
3. Enable:
   - "Require a pull request before merging" (1 approval)
   - "Require status checks to pass before merging" (select the CI jobs)
   - "Require branches to be up to date before merging"

## Code Style

- **TypeScript:** Strict mode. No `any` unless absolutely necessary (with a comment explaining why).
- **Formatting:** Prettier handles all formatting. Run `npm run format` before committing, or let Husky's pre-commit hook catch issues.
- **Linting:** ESLint with Next.js and Prettier configs. Run `npm run lint:fix` to auto-fix.
- **Imports:** Use `@/` path aliases (e.g., `import { foo } from "@/lib/utils"`).

## Pre-Commit Hooks

Husky runs `lint-staged` on every commit, which:

- Runs ESLint on staged `.ts` and `.tsx` files
- Runs Prettier check on staged files

If the hook fails, fix the issues before committing. Do not bypass with `--no-verify`.

## Running Tests

```bash
npm test                  # Run all tests
npm run test:coverage     # Run with coverage report
npx playwright test       # Run E2E tests (requires Playwright browsers)
```
