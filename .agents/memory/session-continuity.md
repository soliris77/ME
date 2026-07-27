---
name: Session continuity
description: How to save and resume in-progress work across session limits or AI API resets.
---

# Session Continuity Pattern

When work is interrupted mid-task (daily API limit, session timeout, user closing chat), write a continuation note to `.agents/memory/in-progress.md`. At the start of the next session, if the user says "continue" or "reprends", read that file and resume.

## Rules
- **Write** the in-progress file at the START of any multi-step task longer than ~5 turns.
- **Update** it after each major step completes (overwrite, don't append).
- **Delete or clear** it when the task is fully done.
- The file must be self-contained: someone with no prior context must be able to pick up the work from it alone.

## Required fields in in-progress.md

```markdown
## Task
One-sentence description of what was being worked on.

## Done
- Bullet list of completed steps (with file names where relevant).

## Next step
Exactly what to do first in the next session (be specific — file, function, what to change).

## Remaining steps
- Ordered list of remaining work after the next step.

## Context
Any non-obvious constraints, decisions made, or gotchas discovered during the task.
```

## How the user triggers resumption
The user says something like:
- "continue"
- "reprends"
- "continue the update"
- "pick up where you left off"

On receiving such a message, read `.agents/memory/in-progress.md` first, then proceed without asking for clarification unless the file is missing or ambiguous.

**Why:** AI sessions can be cut off mid-task by daily usage limits. Without a continuation file, the next session has no way to know what was done and what remains, forcing the user to re-explain everything.
