import YahooFinanceClass from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const yahooFinance = new (YahooFinanceClass as any)();

const TYPE_MAP: Record<string, string> = {
  EQUITY: "stock",
  ETF: "etf",
  CRYPTOCURRENCY: "crypto",
  INDEX: "index",
  MUTUALFUND: "stock",
  FUTURE: "stock",
};

export function mapQuoteType(quoteType?: string): string {
  if (!quoteType) return "stock";
  return TYPE_MAP[quoteType.toUpperCase()] ?? "stock";
}

export interface FormattedQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  marketCap: number | null;
  currency: string;
  type: string;
  exchange: string | null;
  lastUpdated: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatQuote(q: any): FormattedQuote {
  return {
    symbol: q.symbol,
    name: q.longName ?? q.shortName ?? q.symbol,
    price: q.regularMarketPrice ?? 0,
    change: q.regularMarketChange ?? 0,
    changePercent: q.regularMarketChangePercent ?? 0,
    previousClose: q.regularMarketPreviousClose ?? null,
    open: q.regularMarketOpen ?? null,
    high: q.regularMarketDayHigh ?? null,
    low: q.regularMarketDayLow ?? null,
    volume: q.regularMarketVolume ?? null,
    marketCap: q.marketCap ?? null,
    currency: q.currency ?? "USD",
    type: mapQuoteType(q.quoteType),
    exchange: q.fullExchangeName ?? q.exchange ?? null,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Batch-fetch quotes for a list of symbols. Failed lookups are silently
 * dropped from the result (caller can diff against input to see what's missing).
 */
/**
 * Batch-fetch quotes for a list of symbols. Failed lookups are silently
 * dropped from the result (caller can diff against input to see what's missing).
 *
 * Requests are chunked with a concurrency limit rather than fired all at
 * once — Yahoo's free/unauthenticated endpoint is more likely to rate-limit
 * or time out a single burst of 100+ parallel requests (which happens now
 * that /market/overview covers many more symbols/markets).
 */
export async function getQuotes(symbols: string[]): Promise<FormattedQuote[]> {
  const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const CONCURRENCY = 15;
  const out: FormattedQuote[] = [];
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const chunk = unique.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((sym) => yahooFinance.quote(sym).catch(() => null)),
    );
    out.push(...results.filter(Boolean).map((q) => formatQuote(q)));
  }
  return out;
}
