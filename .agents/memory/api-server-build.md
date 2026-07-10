---
name: API server build-on-restart
description: The API server runs a compiled dist/index.mjs; source changes don't take effect until rebuilt.
---

The dev workflow runs `pnpm run build && pnpm run start`. If the server was started with a stale build, all API calls may silently return empty arrays even though the source code looks correct.

**Why:** Source TypeScript is compiled by esbuild into dist/index.mjs. If the workflow crashed before the build step or was started before code edits, the old binary runs indefinitely.

**How to apply:** When API returns empty arrays despite correct source code, restart the workflow to force a rebuild. Always verify with `curl localhost:8080/api/quotes?symbols=AAPL` after restart.
