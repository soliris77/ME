---
name: Single-password session auth (mono-user app)
description: Pattern used to protect a single-user trading app with one password — session middleware placement, password storage, and where auth is enforced.
---

Soliris Market is single-user, so full multi-account auth was overkill. Pattern used:

- The plaintext password lives only as a Replit secret (`AUTH_PASSWORD`), never written to disk or a DB row. At server boot, it's hashed once with bcrypt and kept **in memory only** (`getPasswordHash()` in `api-server/src/lib/auth.ts`); every login compares via `bcrypt.compare`, never a raw string comparison.
- Session cookie is httpOnly + secure (prod) + signed with the existing `SESSION_SECRET`, stored server-side in Postgres via `connect-pg-simple` (no new infra like Redis).
- `requireAuth` middleware is mounted in `routes/index.ts` **after** the public routes (`/api/health`, `/api/auth/*`) and **before** every data/broker router — so any new route added below that line is protected by default rather than needing to opt in.
- Frontend: a single `AuthProvider`/`useAuth` context backed by `GET /api/auth/me`; an `AuthGuard` wrapper (used by the page `wrap()` helper in `App.tsx`) redirects to `/login?next=...` while auth state is loading or false, and never renders protected children until `authenticated === true`.

**Why:** avoids inventing new dependencies (no Redis, no third-party auth provider) while still giving real 401s at the API layer instead of just hiding UI elements — the actual security requirement for a repo that can place real brokerage orders.

**How to apply:** any new protected API route just needs to be mounted after `router.use(requireAuth)` in `routes/index.ts`. Any new protected frontend page should go through the existing `wrap()` helper so it's automatically wrapped in `AuthGuard`.
