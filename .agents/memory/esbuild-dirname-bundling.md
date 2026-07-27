---
name: esbuild bundling breaks __dirname-reading packages
description: Packages that read sibling files relative to __dirname at runtime (e.g. connect-pg-simple's table.sql) fail after esbuild bundling because the build banner rewrites __dirname to the bundle output dir.
---

The api-server build (`build.mjs`) bundles everything into a single `dist/index.mjs` and injects a banner that sets `globalThis.__dirname` to the bundle's own output directory (needed to make CJS-style `require`/`__dirname` usage work in the ESM bundle). Any dependency that does `fs.readFile(path.join(__dirname, 'somefile'))` to load a non-JS sibling file (SQL, templates, etc.) will silently look in the wrong place at runtime and throw `ENOENT`, even though the package works fine unbundled.

**Why:** `connect-pg-simple` reads `table.sql` this way to create its session table; bundling it produced `ENOENT: .../dist/table.sql` errors on every session-creating request, with no build-time signal — only a runtime error on first use.

**How to apply:** When adding a new dependency that ships non-JS runtime assets (SQL files, templates, locale data, native bindings loaded by path), add it to the `external` array in `artifacts/api-server/build.mjs` rather than letting esbuild bundle it. The existing list already carries several examples with comments explaining why.
