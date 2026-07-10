---
name: Yahoo Finance batch queries
description: yahoo-finance2 supports array-based batch queries; use them instead of one-per-symbol for 10x speed improvement.
---

`yahooFinance.quote(['SYM1', 'SYM2', ...], {}, { skipValidation: true })` fetches multiple symbols in a single HTTP request.

**Why:** Individual requests (one per symbol) for 300+ symbols take 11-15 seconds. Batches of 50, 4 parallel, finish in ~1 second.

**How to apply:**
- Chunk symbols into groups of 50 (BATCH_SIZE)
- Run up to 4 batches in parallel (PARALLEL_BATCHES)
- Always pass `{ skipValidation: true }` — some symbols (CT=F with quoteType ALTSYMBOL) fail schema validation and throw without this flag
- Result may be a single object (1 symbol) or array; normalize with `Array.isArray(res) ? res : [res]`

**Node version note:** yahoo-finance2 v3 warns about Node < 22 but works fine on Node 20 in practice. Suppress with `suppressNotices: ['yahooSurvey']` and `validation: { logErrors: false }` in the constructor options.
