import type { Candle } from "@workspace/indicators";
import { toBrokerSymbol } from "@workspace/broker";
import type { MarketDataFeed, Timeframe } from "./types";
import { timeframeMs } from "./types";

export interface CcxtExchangeLike {
  fetchOHLCV(symbol: string, timeframe: string, since?: number, limit?: number): Promise<Array<[number, number, number, number, number, number?]>>;
  watchOHLCV?: (symbol: string, timeframe: string, since?: number, limit?: number) => Promise<Array<[number, number, number, number, number, number?]>>;
}
export interface CcxtFeedOptions { exchange: CcxtExchangeLike; pollMs?: number; }

function normalize(rows: Array<[number, number, number, number, number, number?]>, limit: number): Candle[] {
  const byTimestamp = new Map<number, Candle>();
  for (const [timestamp, open, high, low, close, volume = 0] of rows) {
    if (!Number.isFinite(timestamp)) continue;
    byTimestamp.set(timestamp, { timestamp, open, high, low, close, volume });
  }
  return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-limit);
}

export class CcxtFeed implements MarketDataFeed {
  readonly assetClass = "crypto" as const;
  private readonly exchange: CcxtExchangeLike;
  private readonly pollMs: number;
  constructor(options: CcxtFeedOptions) { this.exchange = options.exchange; this.pollMs = options.pollMs ?? 15_000; }
  async getCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const rows = await this.exchange.fetchOHLCV(toBrokerSymbol(symbol, "ccxt"), timeframe, undefined, limit);
    return normalize(rows, limit);
  }
  subscribe(symbol: string, timeframe: Timeframe, onCandle: (candle: Candle) => void): () => void {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastTimestamp = -1;
    const emit = (rows: Array<[number, number, number, number, number, number?]>) => {
      for (const candle of normalize(rows, rows.length)) {
        if (candle.timestamp > lastTimestamp) { lastTimestamp = candle.timestamp; onCandle(candle); }
      }
    };
    const poll = async () => {
      if (stopped) return;
      try { emit(await this.exchange.fetchOHLCV(toBrokerSymbol(symbol, "ccxt"), timeframe, undefined, 2)); }
      catch { /* retry below; consumers retain the last confirmed candle */ }
      if (!stopped) timer = setTimeout(poll, this.pollMs);
    };
    const watch = async () => {
      if (!this.exchange.watchOHLCV) return poll();
      try {
        while (!stopped) emit(await this.exchange.watchOHLCV(toBrokerSymbol(symbol, "ccxt"), timeframe, undefined, 2));
      } catch { if (!stopped) await poll(); }
    };
    void watch();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }
}