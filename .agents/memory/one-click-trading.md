---
name: One-click trading from Technical Analysis
description: How trade buttons are wired from TA signals to TradeModal
---

## Rule
`TechnicalAnalysis` accepts an optional `onTrade?: (side: "BUY"|"SELL", source: string) => void` prop. When omitted, zero trade UI renders — component stays purely informational.

**Why:** Allows reuse in read-only contexts (alerts page, portfolio) without importing trading logic.

**How to apply:** Pass `onTrade` from any page that wants 1-click trading; omit for read-only views.

## Touch points (three places where buttons appear)
1. **QuoteDetail header** — static Acheter / Vendre buttons always visible (source = "Manuel")
2. **TechnicalAnalysis global signal card** — BUY when overall = FORT ACHAT / ACHAT; SELL when FORTE VENTE / VENTE
3. **PredictionRow** — inline Acheter/Vendre button next to action badge for each prediction whose action ≠ "Attendre"

## TradeModal behaviour
- Fetches `/api/broker/status` + `/api/broker/accounts` on open
- Generates a random `signalId` per modal open (idempotency: retries won't double-submit)
- Paper: amber banner, order stored as `status = "simulated"`, no SnapTrade call
- Live: red banner, POST `/api/broker/orders` → `placeForceOrder`
