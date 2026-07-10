import YahooFinanceClass from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const yahooFinance = new (YahooFinanceClass as any)({
  suppressNotices: ["yahooSurvey"],
  validation: { logErrors: false, logOptionsErrors: false },
});

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
 * Batch-fetch quotes for a list of symbols using Yahoo Finance's multi-symbol
 * endpoint. Symbols are chunked into groups of 50 and fetched in parallel
 * batches — drastically faster than one request per symbol.
 */
export async function getQuotes(symbols: string[]): Promise<FormattedQuote[]> {
  const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const BATCH_SIZE = 50;
  const PARALLEL_BATCHES = 4;
  const out: FormattedQuote[] = [];

  for (let i = 0; i < unique.length; i += BATCH_SIZE * PARALLEL_BATCHES) {
    const window = unique.slice(i, i + BATCH_SIZE * PARALLEL_BATCHES);
    const batches: string[][] = [];
    for (let j = 0; j < window.length; j += BATCH_SIZE) {
      batches.push(window.slice(j, j + BATCH_SIZE));
    }

    const results = await Promise.all(
      batches.map((batch) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (yahooFinance.quote(batch as any, {}, { skipValidation: true }) as Promise<any>)
          .then((res) => (Array.isArray(res) ? res : [res]))
          .catch(() => []),
      ),
    );

    for (const batch of results) {
      out.push(...batch.filter(Boolean).map((q: unknown) => formatQuote(q)));
    }
  }

  return out;
}
