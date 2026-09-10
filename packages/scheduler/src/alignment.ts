import type { Timeframe } from "@workspace/market-data";
import { timeframeMs } from "@workspace/market-data";
import type { Candle } from "@workspace/indicators";

export function nextCandleClose(now: Date, timeframe: Timeframe): Date {
  const period = timeframeMs[timeframe];
  return new Date((Math.floor(now.getTime() / period) + 1) * period);
}

export function scheduleAtCandleClose(now: Date, timeframe: Timeframe, callback: () => void): () => void {
  const delay = Math.max(0, nextCandleClose(now, timeframe).getTime() - now.getTime());
  const timer = setTimeout(callback, delay);
  return () => clearTimeout(timer);
}

/** A candle is stale once it is older than two complete periods. */
export function isStaleCandle(candle: Pick<Candle, "timestamp">, timeframe: Timeframe, now: Date = new Date()): boolean {
  return now.getTime() - candle.timestamp > timeframeMs[timeframe] * 2;
}