---
name: Hyperliquid public market feed
description: Scanner and external-signal confluence use a public-only Hyperliquid adapter, separate from private account/order access.
---

The scanner and signal-confluence paths must use Hyperliquid's public perpetual-market data only. They must not receive the private venue adapter or any wallet credentials. The auto-trader's crypto feed remains a separate broker/feed decision until account selection is migrated deliberately.

**Why:** Market discovery, tickers, and candles are sufficient for observation and measurement; sharing the private venue surface would make an observation worker unnecessarily capable of submitting orders.

**How to apply:** Keep public market methods limited to metadata, tickers, and OHLCV. Keep balances, positions, leverage, and order methods in the private venue module behind the existing live-trading guardrails.