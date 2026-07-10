---
name: Yahoo Finance batch queries
description: yahoo-finance2 supports array-based batch queries; use them instead of one-per-symbol for 10x speed improvement. Futures and currencies return null in batch and need individual retry.
---

`yahooFinance.quote(['SYM1', 'SYM2', ...], {}, { skipValidation: true })` fetches multiple symbols in a single HTTP request.

**Why:** Individual requests (one per symbol) for 300+ symbols take 11-15 seconds. Batches of 50, 4 parallel, finish in ~1 second.

**How to apply:**
- Chunk symbols into groups of 50 (BATCH_SIZE)
- Run up to 4 batches in parallel (PARALLEL_BATCHES)
- Always pass `{ skipValidation: true }` — some symbols fail schema validation and throw without this flag
- Result may be a single object (1 symbol) or array; normalize with `Array.isArray(res) ? res : [res]`
- **Override returned symbol with the requested symbol** — Yahoo batch sometimes returns contract-specific symbols (e.g. "GCQ26.CMX" for "GC=F"): `arr.map((q, idx) => q ? { ...q, symbol: batch[idx] ?? q.symbol } : null)`
- **Futures (GC=F, CL=F, SI=F) and currencies (EURUSD=X) return null in batch mode.** Retry them individually after batch — they work fine with `yahooFinance.quote(sym, {}, { skipValidation: true })` (single symbol)
- `getQuotes()` in `artifacts/api-server/src/lib/yahoo.ts` handles all of this automatically including the individual retry pass

**Broken symbols to avoid:**
- `^GSPTSX` (S&P/TSX Composite) — returns "Symbol not found" even individually. Use `^RUT` (Russell 2000) as a North American small-cap alternative.

**Node version note:** yahoo-finance2 v3 warns about Node < 22 but works fine on Node 20 in practice. Suppress with `suppressNotices: ['yahooSurvey']` and `validation: { logErrors: false }` in the constructor options.
