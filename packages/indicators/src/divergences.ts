import { macd, rsi } from "./core";
import type { Candle, Divergence } from "./types";

export function detectDivergences(
  candles: readonly Candle[],
  lookback = 3,
  rsiPeriod = 14,
  macdFast = 12,
  macdSlow = 26,
  macdSignal = 9,
): Divergence[] {
  const closes = candles.map((candle) => candle.close);
  const rsiValues = rsi(closes, rsiPeriod);
  const macdValues = macd(closes, macdFast, macdSlow, macdSignal);
  const highs: number[] = [];
  const lows: number[] = [];

  for (let index = lookback; index < candles.length - lookback; index++) {
    let high = true;
    let low = true;
    for (let offset = 1; offset <= lookback; offset++) {
      if (closes[index - offset] > closes[index] || closes[index + offset] > closes[index]) high = false;
      if (closes[index - offset] < closes[index] || closes[index + offset] < closes[index]) low = false;
    }
    if (high) highs.push(index);
    if (low) lows.push(index);
  }

  const divergences: Divergence[] = [];
  const register = (
    indices: number[],
    direction: "long" | "short",
    priceConfirms: (first: number, second: number) => boolean,
    indicatorConfirms: (first: number, second: number) => boolean,
  ) => {
    if (indices.length < 2) return;
    const [first, second] = indices.slice(-2);
    if (!priceConfirms(closes[first], closes[second])) return;

    const firstRsi = rsiValues[first];
    const secondRsi = rsiValues[second];
    if (firstRsi !== undefined && secondRsi !== undefined && indicatorConfirms(firstRsi, secondRsi)) {
      divergences.push({ index: second, indicator: "rsi", direction });
    }

    const firstMacd = macdValues[first]?.line;
    const secondMacd = macdValues[second]?.line;
    if (firstMacd !== undefined && secondMacd !== undefined && indicatorConfirms(firstMacd, secondMacd)) {
      divergences.push({ index: second, indicator: "macd", direction });
    }
  };

  register(highs, "short", (first, second) => second > first, (first, second) => second < first);
  register(lows, "long", (first, second) => second < first, (first, second) => second > first);
  return divergences;
}