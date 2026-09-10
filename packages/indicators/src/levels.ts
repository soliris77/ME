import type { Candle, SupportResistanceResult } from "./types";

export function detectSupportResistance(
  candles: readonly Candle[],
  lookback = 3,
  tolerancePct = 0.8,
  maxLevels = 4,
): SupportResistanceResult {
  const currentPrice = candles.at(-1)?.close;
  if (!currentPrice || candles.length < lookback * 2 + 1) {
    return { supports: [], resistances: [] };
  }

  const pivots: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let pivotHigh = true;
    let pivotLow = true;
    for (let offset = 1; offset <= lookback; offset++) {
      if (candles[i].high < candles[i - offset].high || candles[i].high < candles[i + offset].high) {
        pivotHigh = false;
      }
      if (candles[i].low > candles[i - offset].low || candles[i].low > candles[i + offset].low) {
        pivotLow = false;
      }
    }
    if (pivotHigh) pivots.push(candles[i].high);
    if (pivotLow) pivots.push(candles[i].low);
  }

  const clusters: number[][] = [];
  for (const price of [...pivots].sort((a, b) => a - b)) {
    const cluster = clusters.at(-1);
    if (cluster && Math.abs(price - cluster.at(-1)!) / price * 100 <= tolerancePct) {
      cluster.push(price);
    } else {
      clusters.push([price]);
    }
  }

  const levels = clusters
    .filter((cluster) => cluster.length >= 2)
    .map((cluster) => ({
      price: cluster.reduce((sum, price) => sum + price, 0) / cluster.length,
      touches: cluster.length,
    }))
    .sort((a, b) => b.touches - a.touches)
    .slice(0, maxLevels * 2);

  return {
    supports: levels
      .filter((level) => level.price < currentPrice)
      .sort((a, b) => b.price - a.price)
      .slice(0, maxLevels)
      .map((level) => level.price),
    resistances: levels
      .filter((level) => level.price >= currentPrice)
      .sort((a, b) => a.price - b.price)
      .slice(0, maxLevels)
      .map((level) => level.price),
  };
}

export function fibonacciLevels(
  candles: readonly Candle[],
  lookback = 90,
): Record<string, number> | undefined {
  const range = candles.slice(-lookback);
  if (range.length < 10) return undefined;

  let high = -Infinity;
  let low = Infinity;
  let highIndex = -1;
  let lowIndex = -1;
  range.forEach((candle, index) => {
    if (candle.high > high) {
      high = candle.high;
      highIndex = index;
    }
    if (candle.low < low) {
      low = candle.low;
      lowIndex = index;
    }
  });
  if (!Number.isFinite(high) || !Number.isFinite(low) || high <= low) return undefined;

  const bullishMove = lowIndex < highIndex;
  return Object.fromEntries(
    [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((ratio) => [
      `${(ratio * 100).toFixed(1)}%`,
      bullishMove ? high - (high - low) * ratio : low + (high - low) * ratio,
    ]),
  );
}