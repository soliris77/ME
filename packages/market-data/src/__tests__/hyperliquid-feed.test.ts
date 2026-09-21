import { describe, expect, it } from "vitest";
import {
  HyperliquidFeed,
  fromHyperliquidSymbol,
  toHyperliquidSymbol,
  type HyperliquidExchangeLike,
} from "../hyperliquid-feed";

function fakeExchange(): HyperliquidExchangeLike {
  return {
    markets: {
      "BTC/USDC:USDC": {
        symbol: "BTC/USDC:USDC", base: "BTC", quote: "USDC", settle: "USDC",
        type: "swap", contract: true, swap: true, active: true,
        limits: { leverage: { max: 40 } },
      },
      "BTC/USDC": { symbol: "BTC/USDC", base: "BTC", quote: "USDC" },
    },
    async loadMarkets() {},
    async fetchTickers() {
      return {
        "BTC/USDC:USDC": { symbol: "BTC/USDC:USDC", last: 100, quoteVolume: 2_000_000 },
      };
    },
    async fetchOHLCV(symbol) {
      expect(symbol).toBe("BTC/USDC:USDC");
      return [[1, 90, 110, 80, 100, 5]];
    },
  };
}

describe("Hyperliquid public feed", () => {
  it("translates app and CCXT symbols without using credentials", () => {
    expect(toHyperliquidSymbol("btc-usd")).toBe("BTC/USDC:USDC");
    expect(toHyperliquidSymbol("BTC/USD")).toBe("BTC/USDC:USDC");
    expect(fromHyperliquidSymbol("BTC/USDC:USDC")).toBe("BTC-USD");
  });

  it("lists only perpetual markets and maps ticker data", async () => {
    const feed = new HyperliquidFeed({ exchange: fakeExchange() });
    await expect(feed.listMarkets()).resolves.toEqual([expect.objectContaining({
      symbol: "BTC-USD",
      exchangeSymbol: "BTC/USDC:USDC",
      maxLeverage: 40,
      last: 100,
      quoteVolume24h: 2_000_000,
    })]);
  });

  it("fetches candles through the USDC-settled contract", async () => {
    const feed = new HyperliquidFeed({ exchange: fakeExchange() });
    await expect(feed.getCandles("BTC-USD", "15m", 10)).resolves.toEqual([
      { timestamp: 1, open: 90, high: 110, low: 80, close: 100, volume: 5 },
    ]);
  });
});