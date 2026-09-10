import YahooFinance from "yahoo-finance2";
import type { Candle } from "@workspace/indicators";
import type { MarketDataFeed, Timeframe } from "./types";

type Chart = (symbol: string, options: { period1: Date; interval: string }) => Promise<{ quotes?: Array<Record<string, unknown>> }>;

export interface YahooFeedOptions {
  chart?: Chart;
}

const intervals: Record<Timeframe, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "1h", "1d": "1d",
};

/** Equity feed over the same Yahoo chart endpoint used by the API. */
export class YahooFeed implements MarketDataFeed {
  readonly assetClass = "equity" as const;
  private readonly chart: Chart;
  constructor(options: YahooFeedOptions = {}) {
    const yahoo = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] });
    this.chart = options.chart ?? ((symbol, opts) => yahoo.chart(symbol, opts));
  }
  async getCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const result = await this.chart(symbol, {
      period1: new Date(Date.now() - limit * (timeframeMs(timeframe))),
      interval: intervals[timeframe],
    });
    return (result.quotes ?? []).map((p) => ({
      timestamp: new Date(p.date as string | number | Date).getTime(),
      open: Number(p.open ?? 0), high: Number(p.high ?? 0), low: Number(p.low ?? 0),
      close: Number(p.close ?? 0), volume: Number(p.volume ?? 0),
    })).filter((c) => Number.isFinite(c.timestamp)).sort((a, b) => a.timestamp - b.timestamp).slice(-limit);
  }
  subscribe(symbol: string, timeframe: Timeframe, onCandle: (candle: Candle) => void): () => void {
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      const candles = await this.getCandles(symbol, timeframe, 1).catch(() => []);
      if (!stopped && candles[0]) onCandle(candles[0]);
    };
    void poll();
    const handle = setInterval(poll, timeframeMs(timeframe));
    return () => { stopped = true; clearInterval(handle); };
  }
}
function timeframeMs(timeframe: Timeframe): number {
  return ({ "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 })[timeframe];
}