import { describe, expect, it } from "vitest";
import { analyzeSignal, atr, ema, macd, rsi, sma, type Candle } from "../src";

const candles: Candle[] = Array.from({ length: 60 }, (_, index) => ({
  timestamp: index * 60_000,
  open: 100 + index,
  high: 101 + index,
  low: 99 + index,
  close: 100.5 + index,
  volume: 1_000 + index,
}));

describe("indicateurs purs", () => {
  it("garde les valeurs indisponibles tant que la période n'est pas complète", () => {
    expect(sma([1, 2, 3], 4)).toEqual([undefined, undefined, undefined]);
    expect(ema([1, 2, 3], 4)).toEqual([undefined, undefined, undefined]);
    expect(rsi([1, 2, 3], 14)).toEqual([undefined, undefined, undefined]);
    expect(atr(candles.slice(0, 3), 14)).toEqual([undefined, undefined, undefined]);
    expect(macd(candles.slice(0, 10).map((candle) => candle.close)).every((value) => value === undefined)).toBe(true);
  });

  it("ne modifie jamais les bougies d'entrée", () => {
    const before = structuredClone(candles);
    analyzeSignal(candles);
    expect(candles).toEqual(before);
  });

  it("refuse les périodes invalides", () => {
    expect(() => sma([1, 2], 0)).toThrow(RangeError);
    expect(() => macd([1, 2], 26, 12, 9)).toThrow(RangeError);
  });
});