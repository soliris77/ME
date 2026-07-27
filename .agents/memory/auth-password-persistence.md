---
name: Auth password persistence
description: How the password is stored and resolved across remixes/forks.
---

# Auth Password Persistence

## The Rule
Password hash is resolved in this priority order:
1. `app_settings.password_hash` (Postgres DB) — survives remix/fork
2. `AUTH_PASSWORD` env var (Replit secret) — fallback for legacy setup
3. Neither → `needsSetup: true` → frontend redirects to `/setup`

## DB Column
`app_settings.password_hash TEXT` — added with `ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS password_hash text`. Migration was run directly via SQL (drizzle-kit push needs TTY, so use raw SQL for non-interactive migrations).

## Key files
- `artifacts/api-server/src/lib/auth.ts` — `resolvePasswordHash()`, `needsSetup()`, `setPassword()`, `invalidatePasswordCache()`
- `artifacts/api-server/src/routes/auth.ts` — `GET /api/auth/needs-setup`, `POST /api/auth/setup`
- `artifacts/wealthsimple-tracker/src/pages/SetupPassword.tsx` — first-launch UI
- `artifacts/wealthsimple-tracker/src/hooks/use-auth.tsx` — `needsSetup` flag in AuthState
- `artifacts/wealthsimple-tracker/src/App.tsx` — `/setup` route + AuthGuard redirects to `/setup` when needsSetup

## First-launch flow
1. App loads → `GET /api/auth/needs-setup` returns `{ needsSetup: true }`
2. AuthGuard redirects to `/setup`
3. User sets password → `POST /api/auth/setup` → hash stored in DB → session opened
4. User lands on `/dashboard`
5. On future visits (even after remix), DB has the hash → normal login flow

**Why:** Replit secrets don't transfer on remix/fork. Storing the hash in the DB (which is provisioned per repl) means zero re-configuration after a fork.
