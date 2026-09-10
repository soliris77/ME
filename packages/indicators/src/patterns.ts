import type { Candle, CandlestickPattern } from "./types";

export function detectCandlestickPatterns(candles: readonly Candle[]): CandlestickPattern[] {
  const patterns: CandlestickPattern[] = [];
  for (let index = 0; index < candles.length; index++) {
    const candle = candles[index];
    const range = candle.high - candle.low;
    if (range <= 0) continue;

    const body = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const bodyPct = body / range;
    const bullish = candle.close > candle.open;

    if (bodyPct < 0.1) {
      patterns.push({ index, name: "Doji", direction: "neutral" });
    }
    if (lowerWick > body * 2 && upperWick < body * 0.5 && lowerWick > range * 0.55) {
      patterns.push({ index, name: bullish ? "Hammer" : "Hanging Man", direction: bullish ? "long" : "short" });
    }
    if (upperWick > body * 2 && lowerWick < body * 0.5 && upperWick > range * 0.55) {
      patterns.push({ index, name: bullish ? "Inverted Hammer" : "Shooting Star", direction: bullish ? "long" : "short" });
    }

    const previous = candles[index - 1];
    if (!previous) continue;
    const previousBullish = previous.close > previous.open;
    if (
      !previousBullish &&
      bullish &&
      candle.open <= previous.close &&
      candle.close >= previous.open
    ) {
      patterns.push({ index, name: "Bullish Engulfing", direction: "long" });
    }
    if (
      previousBullish &&
      !bullish &&
      candle.open >= previous.close &&
      candle.close <= previous.open
    ) {
      patterns.push({ index, name: "Bearish Engulfing", direction: "short" });
    }
  }
  return patterns;
}