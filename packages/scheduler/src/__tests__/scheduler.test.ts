import { describe, expect, it } from "vitest";
import { isTradeable } from "../market-hours";
import { isStaleCandle, nextCandleClose } from "../alignment";

describe("scheduler", () => {
  const sunday = new Date("2025-01-05T03:00:00Z");
  it("keeps crypto tradeable 24/7 while equities remain closed", () => {
    expect(isTradeable("crypto", sunday)).toBe(true);
    expect(isTradeable("equity", sunday)).toBe(false);
  });
  it("aligns evaluations to timeframe boundaries and refuses stale candles", () => {
    const now = new Date("2025-01-05T03:07:00.000Z");
    expect(nextCandleClose(now, "5m").toISOString()).toBe("2025-01-05T03:10:00.000Z");
    expect(isStaleCandle({ timestamp: now.getTime() - 11 * 60_000 }, "5m", now)).toBe(true);
    expect(isStaleCandle({ timestamp: now.getTime() - 9 * 60_000 }, "5m", now)).toBe(false);
  });
});