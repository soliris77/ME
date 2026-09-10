import { describe, expect, it } from "vitest";
import { CcxtFeed } from "../ccxt-feed";

describe("CcxtFeed", () => {
  it("normalizes the internal symbol and sorts/deduplicates REST candles", async () => {
    let requested = "";
    const feed = new CcxtFeed({ exchange: {
      fetchOHLCV: async (symbol) => {
        requested = symbol;
        return [[2000, 2, 3, 1, 2.5, 4], [1000, 1, 2, 0, 1.5, 2],
          [2000, 9, 9, 9, 9, 9]];
      },
    } });
    expect(await feed.getCandles("btc-usd", "1m", 10)).toEqual([
      { timestamp: 1000, open: 1, high: 2, low: 0, close: 1.5, volume: 2 },
      { timestamp: 2000, open: 9, high: 9, low: 9, close: 9, volume: 9 },
    ]);
    expect(requested).toBe("BTC/USD");
  });
  it("passes a configured 5m timeframe through to REST", async () => {
    let requestedTimeframe = "";
    const feed = new CcxtFeed({ exchange: {
      fetchOHLCV: async (_symbol, timeframe) => { requestedTimeframe = timeframe; return []; },
    } });
    await feed.getCandles("BTC-USD", "5m", 10);
    expect(requestedTimeframe).toBe("5m");
  });

  it("falls back from a rejected websocket without duplicate candles", async () => {
    const emitted: number[] = [];
    let polls = 0;
    const exchange = {
      watchOHLCV: async () => { throw new Error("socket rejected"); },
      fetchOHLCV: async () => {
        polls++;
        return [
          [1000, 1, 1, 1, 1, 1] as [number, number, number, number, number, number],
          [2000, 2, 2, 2, 2, 2] as [number, number, number, number, number, number],
        ];
      },
    };
    const stop = new CcxtFeed({ exchange, pollMs: 1 }).subscribe("BTC-USD", "1m", c => emitted.push(c.timestamp));
    await new Promise(resolve => setTimeout(resolve, 10));
    stop();
    expect(emitted).toEqual([1000, 2000]);
    expect(polls).toBeGreaterThan(0);
  });
});