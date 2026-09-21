import type { Candle } from "@workspace/indicators";
import type { MarketDataFeed, Timeframe } from "./types";
import { timeframeMs } from "./types";

export interface HyperliquidTicker {
  symbol?: string;
  last?: number;
  close?: number;
  bid?: number;
  ask?: number;
  quoteVolume?: number;
}

export interface HyperliquidRawMarket {
  symbol?: string;
  base?: string;
  quote?: string;
  settle?: string;
  type?: string;
  contract?: boolean;
  swap?: boolean;
  active?: boolean;
  status?: string;
  info?: Record<string, unknown>;
  limits?: { leverage?: { max?: number } };
}

export interface HyperliquidExchangeLike {
  loadMarkets(reload?: boolean): Promise<unknown>;
  markets?: Record<string, HyperliquidRawMarket>;
  fetchTickers(symbols?: string[]): Promise<Record<string, HyperliquidTicker>>;
  fetchOHLCV(
    symbol: string,
    timeframe?: string,
    since?: number,
    limit?: number,
  ): Promise<number[][]>;
  watchOHLCV?: (
    symbol: string,
    timeframe?: string,
    since?: number,
    limit?: number,
  ) => Promise<number[][]>;
}

export interface HyperliquidMarketSummary {
  /** The symbol used by the application, for example BTC-USD. */
  symbol: string;
  /** The exact CCXT/Hyperliquid contract symbol. */
  exchangeSymbol: string;
  base: string;
  quoteCurrency: "USD";
  settlementCurrency: string;
  active: boolean;
  status: string;
  maxLeverage: number | null;
  last: number | null;
  bid: number | null;
  ask: number | null;
  quoteVolume24h: number | null;
}

function finiteOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCandles(
    rows: number[][],
  limit: number,
): Candle[] {
  const byTimestamp = new Map<number, Candle>();
  for (const [timestamp, open, high, low, close, volume = 0] of rows) {
    if (![timestamp, open, high, low, close, volume].every(Number.isFinite)) continue;
    byTimestamp.set(timestamp, { timestamp, open, high, low, close, volume });
  }
  return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-limit);
}

/** Translates the app's BTC-USD notation to Hyperliquid's USDC-settled perp. */
export function toHyperliquidSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (normalized.includes(":")) return normalized;
  if (normalized.includes("/")) {
    const [base, quote] = normalized.split("/");
    return quote === "USD" ? `${base}/USDC:USDC` : normalized;
  }
  const separator = normalized.lastIndexOf("-");
  if (separator > 0) {
    const base = normalized.slice(0, separator);
    const quote = normalized.slice(separator + 1);
    return quote === "USD" ? `${base}/USDC:USDC` : `${base}/${quote}`;
  }
  return `${normalized}/USDC:USDC`;
}

/** Converts CCXT's USDC-settled symbol to the app's USD quote notation. */
export function fromHyperliquidSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  const [pair] = normalized.split(":");
  const [base, quote] = pair.split("/");
  if (!base || !quote) return normalized.replace("/", "-");
  return `${base}-${quote === "USDC" ? "USD" : quote}`;
}

function isPerpetual(market: HyperliquidRawMarket): boolean {
  const quote = String(market.quote ?? "").toUpperCase();
  const settle = String(market.settle ?? "").toUpperCase();
  const delisted = market.info?.isDelisted === true || market.info?.isDelisted === "true";
  return market.contract === true
    && (market.swap === true || market.type === "swap")
    && (quote === "USDC" || settle === "USDC")
    && market.active !== false
    && !delisted;
}

function maxLeverage(market: HyperliquidRawMarket): number | null {
  const direct = finiteOrNull(market.limits?.leverage?.max);
  const info = finiteOrNull(market.info?.maxLeverage);
  return direct ?? info;
}

/**
 * Public Hyperliquid market data. It deliberately has no order/account
 * methods, so the scanner and signal workers cannot submit a private request.
 */
export class HyperliquidFeed implements MarketDataFeed {
  readonly assetClass = "crypto" as const;
  private readonly exchange: HyperliquidExchangeLike;
  private readonly pollMs: number;

  constructor(options: { exchange: HyperliquidExchangeLike; pollMs?: number }) {
    this.exchange = options.exchange;
    this.pollMs = options.pollMs ?? 15_000;
  }

  async fetchTickers(): Promise<Record<string, HyperliquidTicker>> {
    return this.exchange.fetchTickers();
  }

  async fetchOHLCV(
    symbol: string,
    timeframe?: string,
    since?: number,
    limit?: number,
  ): Promise<number[][]> {
    return this.exchange.fetchOHLCV(toHyperliquidSymbol(symbol), timeframe, since, limit);
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const rows = await this.fetchOHLCV(symbol, timeframe, undefined, limit);
    return normalizeCandles(rows, limit);
  }

  async listMarkets(): Promise<HyperliquidMarketSummary[]> {
    await this.exchange.loadMarkets();
    const markets = Object.entries(this.exchange.markets ?? {})
      .filter(([, market]) => isPerpetual(market));
    const tickers = await this.exchange.fetchTickers(markets.map(([symbol]) => symbol));

    return markets
      .map(([exchangeSymbol, market]) => {
        const ticker = tickers[exchangeSymbol] ?? tickers[market.symbol ?? ""];
        const base = String(market.base ?? exchangeSymbol.split("/")[0]).toUpperCase();
        const settle = String(market.settle ?? "USDC").toUpperCase();
        return {
          symbol: fromHyperliquidSymbol(exchangeSymbol),
          exchangeSymbol,
          base,
          quoteCurrency: "USD" as const,
          settlementCurrency: settle,
          active: market.active !== false,
          status: market.status ?? (market.active === false ? "inactive" : "active"),
          maxLeverage: maxLeverage(market),
          last: finiteOrNull(ticker?.last ?? ticker?.close),
          bid: finiteOrNull(ticker?.bid),
          ask: finiteOrNull(ticker?.ask),
          quoteVolume24h: finiteOrNull(ticker?.quoteVolume),
        };
      })
      .sort((a, b) => (b.quoteVolume24h ?? -1) - (a.quoteVolume24h ?? -1));
  }

  subscribe(symbol: string, timeframe: Timeframe, onCandle: (candle: Candle) => void): () => void {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastTimestamp = -1;
    const emit = (rows: number[][]) => {
      for (const candle of normalizeCandles(rows, rows.length)) {
        if (candle.timestamp > lastTimestamp) {
          lastTimestamp = candle.timestamp;
          onCandle(candle);
        }
      }
    };
    const poll = async () => {
      if (stopped) return;
      try {
        emit(await this.fetchOHLCV(symbol, timeframe, undefined, 2));
      } catch {
        // Retry on the next interval; consumers retain their last candle.
      }
      if (!stopped) timer = setTimeout(poll, this.pollMs);
    };
    const watch = async () => {
      if (!this.exchange.watchOHLCV) return poll();
      try {
        while (!stopped) {
          emit(await this.exchange.watchOHLCV(
            toHyperliquidSymbol(symbol), timeframe, undefined, 2,
          ));
        }
      } catch {
        if (!stopped) await poll();
      }
    };
    void watch();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }
}

export function timeframeDuration(timeframe: Timeframe): number {
  return timeframeMs[timeframe];
}