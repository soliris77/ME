---
name: Agent Task Continuity System
description: How the agent task persistence system works — table, API, and frontend for cross-remix continuation.
---

# Agent Task Continuity System

## What it is
A system that lets an agent save its progress mid-task so the next agent (in a remix) can continue exactly where it left off.

## Database table
`agent_tasks` (created directly via `psql "$DATABASE_URL" -c "CREATE TABLE ..."` since drizzle-kit push requires TTY):
- `id`, `title`, `description`, `status` (in_progress|paused|completed|cancelled)
- `steps_completed` (TEXT, JSON array of strings)
- `next_steps` (TEXT, JSON array of strings)  
- `checkpoint_notes` (TEXT, free-form technical context)
- `started_at`, `paused_at`, `completed_at`, `updated_at`

## Schema file
`lib/db/src/schema/agentTasks.ts` — exported from `lib/db/src/schema/index.ts`

## API routes
`artifacts/api-server/src/routes/agentTasks.ts` — registered in `routes/index.ts`:
- GET /api/agent-tasks
- GET /api/agent-tasks/:id
- POST /api/agent-tasks
- PATCH /api/agent-tasks/:id
- DELETE /api/agent-tasks/:id

## Lib helper
`artifacts/api-server/src/lib/agentTasks.ts`

## Frontend page
`artifacts/wealthsimple-tracker/src/pages/AgentTasks.tsx` — route `/agent-tasks`, nav link "Tâches d'agent" with Bot icon.

## How agents should use it
1. On start: `GET /api/agent-tasks` — check for any `paused` tasks
2. If paused task found: read `nextSteps` and `checkpointNotes`, continue from there
3. While working: `PATCH /api/agent-tasks/:id` to add completed steps and update next steps
4. On completion: `PATCH` with `status: "completed"`

**Why:** User requested this system so tasks interrupted by usage limits can be resumed in remixes.

**How to apply:** Always check agent-tasks before starting a new feature. If a paused task exists, resume it rather than starting fresh.
