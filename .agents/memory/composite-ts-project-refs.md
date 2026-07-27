---
name: Composite TS project references need dist rebuilds
description: Why a workspace package's schema/type change doesn't show up downstream even though the source file is correct.
---

In this monorepo, internal packages like `@workspace/db` and `@workspace/api-client-react`
use TS project references with `composite: true` + `emitDeclarationOnly` + `outDir: dist`.
Downstream `tsconfig.json` `references` point at these packages, so `tsc` type-checks
against the **compiled `dist/*.d.ts` declarations**, not the live `src/*.ts`.

**Why:** the package.json `exports` field may map `"."` straight to `src/index.ts` (so runtime
imports always see current source), but TS project references resolve through the referenced
project's build output — so a schema column or exported symbol added to `src/` is invisible to
`tsc --noEmit` in consumer packages until that package's `dist/` is rebuilt.

**How to apply:** after changing a schema (`lib/db`) or regenerating the API client
(`lib/api-client-react`, `lib/api-zod`), if downstream `tsc --noEmit` reports "property does not
exist" / "no exported member" errors that look wrong given the source, rebuild the referenced
package's declarations before debugging further: delete its `tsconfig.tsbuildinfo` and run
`npx tsc -b --force` inside that package directory (or the consuming package) rather than editing
source that already looks correct.
