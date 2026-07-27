---
name: OpenAPI YAML quoting gotcha with orval codegen
description: A YAML syntax bug pattern when adding tag/schema descriptions with accented or punctuated French text to an openapi.yaml consumed by orval.
---

When adding a new tag or field `description:` to `openapi.yaml` that contains a quoted phrase
followed by trailing unquoted text on the same line (e.g. mixing a quoted sub-phrase with plain
words after it), YAML parses it as a syntax error rather than a single scalar string.

**Why:** YAML string scalars must be either fully quoted or fully unquoted — a value that starts
with a quote character is parsed as a quoted string ending at the next quote, so any text after
that closing quote on the same line breaks parsing. This is easy to trigger when writing French
descriptions that use guillemets/quotes stylistically inside prose.

**How to apply:** when writing `description:` (or any YAML scalar) with an inner quoted phrase,
either remove the inner quotes entirely or wrap the whole value in one consistent quote style
(single quotes if the content contains double quotes, or vice versa). Re-run
`pnpm --filter @workspace/api-spec run codegen` after any openapi.yaml edit to catch this
immediately — orval/its YAML parser fails loudly on it.
