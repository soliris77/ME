---
name: isUp null semantics
description: isUp() in format.ts returns boolean|null; null means data is absent — never default to "up" direction.
---

`isUp(val: number | undefined | null): boolean | null`
- Returns `true` for val >= 0 (gain or flat)
- Returns `false` for val < 0 (loss)
- Returns `null` for null / undefined / non-finite (no data)

**Why:** Defaulting to `(val ?? 0) >= 0` rendered an "up" arrow while formatPercent() showed "—", giving contradictory UI signals on missing data.

**How to apply:** All consumers must handle three states:
```tsx
{up === true && <ArrowUpRight />}
{up === false && <ArrowDownRight />}
{/* nothing when up === null */}
```
changeClass() already returns "" for null/non-finite, so color is neutral too. Keep all three (isUp, changeClass, formatPercent) semantically aligned.
