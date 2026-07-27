---
name: SnapTrade broker integration
description: DB schema, server wrapper, and REST routes for SnapTrade/Wealthsimple broker connection
---

## Rule
SnapTrade client is lazy-init in snaptrade.ts — server starts cleanly without credentials (paper mode). Two SDK method names that differ from what docs might suggest:
- `placeForceOrder` (not `placeOrder`) for immediate order submission without pre-check
- `loginSnapTradeUser` (not `getUserJWT`) for Connection Portal URL

**Why:** `placeOrder` requires a `tradeId` from `getOrderImpact`; `placeForceOrder` submits directly. `getUserJWT` does not exist on `AuthenticationApi`.

**How to apply:** When adding new SnapTrade calls, always check `dist/index.d.ts` method names — they diverge from documentation.

## DB tables added
- `broker_connections` — single row for mono-user app; SnapTrade userId/userSecret + cached accounts JSON
- `orders` — `signalId` has a unique index; `mode` column snapshots TRADING_MODE at submission time; 24h idempotency window
- `rejected_signals` — risk-check rejections before ever reaching the broker

## Routes
- `POST /api/broker/orders` — idempotent (signalId dedup within 24h); paper → simulated record only; live → `placeForceOrder`
- `GET /api/broker/orders` — last 50 orders
