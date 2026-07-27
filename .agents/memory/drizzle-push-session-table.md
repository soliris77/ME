---
name: drizzle-kit push hazard with unmanaged tables
description: Why running drizzle-kit push non-interactively is risky when a table (e.g. connect-pg-simple's session table) exists in the DB but isn't in the Drizzle schema.
---

`drizzle-kit push` prompts interactively (TTY-only) when it detects a DB table that isn't
declared in the Drizzle schema — it treats it as something to potentially drop/rename.
In an app using `connect-pg-simple` for sessions, the `session` table is managed by that
library directly via raw SQL, not by Drizzle, so it never appears in `schema/*.ts`.

**Why:** running `push` non-interactively (or accepting default prompts blindly) risks having
Drizzle drop the `session` table, logging out every active session and potentially breaking
the session store on next request.

**How to apply:** don't run a plain `drizzle-kit push` when the schema diff might touch tables
outside Drizzle's knowledge. For a single new table, it's safer to write the `CREATE TABLE`
manually via `psql "$DATABASE_URL"` with the exact column types/constraints Drizzle's schema
declares — this keeps the DB and schema in sync without invoking push's interactive/destructive
diffing at all. Reserve `push` for schema-only databases or run it interactively so you can review
every prompt.
