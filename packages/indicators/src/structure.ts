import type { Candle } from "./types";

export function detectMarketStructure(
  candles: readonly Candle[],
  lookback = 3,
): "uptrend" | "downtrend" | "range" {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let index = lookback; index < candles.length - lookback; index++) {
    let isHigh = true;
    let isLow = true;
    for (let offset = 1; offset <= lookback; offset++) {
      if (candles[index].high < candles[index - offset].high || candles[index].high < candles[index + offset].high) {
        isHigh = false;
      }
      if (candles[index].low > candles[index - offset].low || candles[index].low > candles[index + offset].low) {
        isLow = false;
      }
    }
    if (isHigh) highs.push(candles[index].high);
    if (isLow) lows.push(candles[index].low);
  }

  const recentHighs = highs.slice(-2);
  const recentLows = lows.slice(-2);
  if (recentHighs.length < 2 || recentLows.length < 2) return "range";
  if (recentHighs[1] > recentHighs[0] && recentLows[1] > recentLows[0]) return "uptrend";
  if (recentHighs[1] < recentHighs[0] && recentLows[1] < recentLows[0]) return "downtrend";
  return "range";
}