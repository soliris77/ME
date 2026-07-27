---
name: Soliris Market — orphan pages
description: Pages/components can exist fully built in src/pages but never be reachable because they're missing from App.tsx's route table and Nav links.
---

Found while implementing points 3-9 of the "reste à ajouter" spec (2026-07-12): `Settings.tsx`, `AuditLog.tsx`, and `Reconciliation.tsx` were complete, backend-wired components sitting in `src/pages/` with zero references in `App.tsx`'s `<Switch>` or the sidebar `links` array — so a prior agent's "fully implemented" self-report was true for the component but false for the actual product (nothing let a user open the page).

**Why:** wouter routes are declared centrally in one `<Switch>` in `App.tsx`; a page file existing on disk says nothing about whether it's linked into the app. An explorer subagent that only ran `find`/`grep` for the component file reported these as "done" without checking the router.

**How to apply:** when auditing "is feature X built", always grep the router file (`App.tsx` here) for the component name in addition to confirming the page/API code exists. Treat "component exists but unrouted" as a distinct, common failure mode — wire the route, add the nav entry, and re-verify.

Also found in the same pass: `AUTH_PASSWORD` existed as a secret key but with an **empty string value** — `process.env.AUTH_PASSWORD` was `typeof "string"` yet falsy, silently blocking all login with a 500. `viewEnvVars` reports secret *existence*, not whether the value is non-empty; if login/auth suddenly 500s with "must be defined" despite the secret showing as set, ask the user to re-enter it via `requestSecrets`.
