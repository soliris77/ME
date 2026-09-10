import type { Candle } from "@workspace/indicators";

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
export type MarketAssetClass = "equity" | "crypto";

export interface MarketDataFeed {
  readonly assetClass: MarketAssetClass;
  getCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]>;
  subscribe(symbol: string, timeframe: Timeframe, onCandle: (candle: Candle) => void): () => void;
}

export const timeframeMs: Record<Timeframe, number> = {
  "1m": 60_000, "5m": 300_000, "15m": 900_000,
  "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
};