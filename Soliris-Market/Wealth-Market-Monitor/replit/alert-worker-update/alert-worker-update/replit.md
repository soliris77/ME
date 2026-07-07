# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Alert notifications (optional but recommended): `RESEND_API_KEY`, `RESEND_FROM` (verified sender, e.g. `WS Marchés <alerts@yourdomain.com>`), `ALERT_NOTIFY_EMAIL` (default destination). Without these the alert worker still marks alerts as triggered in the DB, it just skips sending email.
- `ALERT_CHECK_INTERVAL_MS` (optional, default `90000`) — how often the alert worker polls Yahoo Finance for active alerts.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After pulling the `notifyEmail` column on `alerts`, run `pnpm --filter @workspace/db run push` before starting the server, or inserts/selects on that table will fail.
- After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` to regenerate `lib/api-zod` and `lib/api-client-react` — the frontend imports generated types/hooks from those packages, so skipping this leaves the UI out of sync (typecheck will fail on the new `notifyEmail` field).
- The alert worker (`artifacts/api-server/src/workers/alertWorker.ts`) polls all active alerts' symbols every `ALERT_CHECK_INTERVAL_MS` (default 90s). It's in-process — if you ever move to multiple API server instances, this needs to become a single scheduled job (e.g. a leader-elected cron), otherwise every instance will double-fire notifications.
- Without `RESEND_API_KEY`/`RESEND_FROM` set, alerts still get marked triggered in the DB (so the UI reflects it) but no email goes out — check server logs for a warning if emails seem to be missing.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
