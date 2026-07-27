---
name: Workflow secret injection
description: Replit workflow processes may need a restart after Secrets are added or confirmed.
---

Secrets can be present in Replit's secret store while an already-running workflow process still has them missing from `process.env`.

**Why:** Environment variables are captured by the running process at startup; checking the secret store alone does not prove the API process can use them.

**How to apply:** After adding or confirming integration secrets, restart the relevant workflow, then verify only boolean presence flags in startup logs or a protected status endpoint. Never print secret values.