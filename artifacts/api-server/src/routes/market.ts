import { Router } from "express";
import YahooFinanceClass from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = new (YahooFinanceClass as any)();

const router = Router();

const INDICES = ["^GSPC", "^IXIC", "^GSPTSX", "BTC-USD", "ETH-USD"];
const WEALTHSIMPLE_POPULAR = ["XEQT.TO", "VEQT.TO", "ZSP.TO", "HXT.TO", "AAPL", "TSLA", "MSFT", "SHOP.TO"];

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

router.get("/market/overview", async (req, res) => {
  try {
    const allSymbols = [...INDICES, ...WEALTHSIMPLE_POPULAR];
    const results = await Promise.all(
      allSymbols.map((sym) => yahooFinance.quote(sym).catch(() => null))
    );
    const allQuotes = results.filter(Boolean).map((q) => formatQuote(q!));

    const indices = allQuotes.filter((q) => INDICES.includes(q.symbol));
    const popular = allQuotes.filter((q) => WEALTHSIMPLE_POPULAR.includes(q.symbol));

    const sortedByChange = [...popular].sort((a, b) => b.changePercent - a.changePercent);
    const topGainers = sortedByChange.filter((q) => q.changePercent > 0).slice(0, 5);
    const topLosers = [...sortedByChange].reverse().filter((q) => q.changePercent < 0).slice(0, 5);

    return res.json({
      indices,
      topGainers,
      topLosers,
      wealthsimplePopular: popular,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch market overview");
    return res.status(500).json({ error: "Failed to fetch market overview" });
  }
});

router.get("/market/search", async (req, res) => {
  const { q } = req.query as { q?: string };
  if (!q) return res.status(400).json({ error: "q query param required" });

  try {
    const results = await yahooFinance.search(q, { newsCount: 0 });
    const quotes = (results.quotes ?? []).slice(0, 10).map((item) => ({
      symbol: item.symbol ?? "",
      name: ("longname" in item && item.longname) ? item.longname : ("shortname" in item && item.shortname) ? item.shortname : item.symbol ?? "",
      type: ("quoteType" in item && item.quoteType) ? (TYPE_MAP[item.quoteType.toUpperCase()] ?? "stock") : "stock",
      exchange: ("exchange" in item && item.exchange) ? item.exchange : "",
    }));
    return res.json(quotes);
  } catch (err) {
    req.log.error({ err }, "Search failed");
    return res.status(500).json({ error: "Search failed" });
  }
});

export default router;
