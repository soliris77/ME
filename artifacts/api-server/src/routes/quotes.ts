import { Router } from "express";
import YahooFinanceClass from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = new (YahooFinanceClass as any)();

const router = Router();

const TYPE_MAP: Record<string, string> = {
  EQUITY: "stock",
  ETF: "etf",
  CRYPTOCURRENCY: "crypto",
  INDEX: "index",
  MUTUALFUND: "stock",
  FUTURE: "stock",
};

function mapQuoteType(quoteType?: string): string {
  if (!quoteType) return "stock";
  return TYPE_MAP[quoteType.toUpperCase()] ?? "stock";
}

function formatQuote(q: Awaited<ReturnType<typeof yahooFinance.quote>>) {
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

router.get("/quotes", async (req, res) => {
  const { symbols } = req.query as { symbols?: string };
  if (!symbols) {
    return res.status(400).json({ error: "symbols query param required" });
  }
  const symbolList = symbols.split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const results = await Promise.all(
      symbolList.map((sym) =>
        yahooFinance.quote(sym).catch(() => null)
      )
    );
    const quotes = results.filter(Boolean).map((q) => formatQuote(q!));
    return res.json(quotes);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch quotes");
    return res.status(500).json({ error: "Failed to fetch quotes" });
  }
});

router.get("/quotes/:symbol", async (req, res) => {
  const { symbol } = req.params;
  try {
    const q = await yahooFinance.quote(symbol);
    if (!q) return res.status(404).json({ error: "Symbol not found" });
    return res.json(formatQuote(q));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch quote");
    return res.status(404).json({ error: "Symbol not found" });
  }
});

const INTERVAL_MAP: Record<string, string> = {
  "1d": "5m",
  "5d": "15m",
  "1mo": "1d",
  "3mo": "1d",
  "6mo": "1wk",
  "1y": "1mo",
};

router.get("/quotes/:symbol/history/:range", async (req, res) => {
  const { symbol, range } = req.params;
  const validRanges = ["1d", "5d", "1mo", "3mo", "6mo", "1y"];
  if (!validRanges.includes(range)) {
    return res.status(400).json({ error: "Invalid range" });
  }
  try {
    const interval = (INTERVAL_MAP[range] ?? "1d") as "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "90m" | "1h" | "1d" | "5d" | "1wk" | "1mo" | "3mo";
    const result = await yahooFinance.chart(symbol, {
      period1: getStartDate(range),
      interval,
    });
    const points = (result.quotes ?? []).map((p) => ({
      date: new Date(p.date).toISOString(),
      open: p.open ?? null,
      high: p.high ?? null,
      low: p.low ?? null,
      close: p.close ?? 0,
      volume: p.volume ?? null,
    }));
    return res.json(points);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch history");
    return res.status(500).json({ error: "Failed to fetch history" });
  }
});

function getStartDate(range: string): Date {
  const now = new Date();
  switch (range) {
    case "1d": return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "5d": return new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    case "1mo": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "3mo": return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "6mo": return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    case "1y": return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    default: return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

export default router;
