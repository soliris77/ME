import { Router } from "express";
import { yahooFinance, formatQuote, getQuotes } from "../lib/yahoo";

const router = Router();

router.get("/quotes", async (req, res) => {
  const { symbols } = req.query as { symbols?: string };
  if (!symbols) {
    return res.status(400).json({ error: "symbols query param required" });
  }
  const symbolList = symbols.split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const quotes = await getQuotes(symbolList);
    return res.json(quotes);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch quotes");
    return res.status(500).json({ error: "Failed to fetch quotes" });
  }
});

router.get("/quotes/:symbol", async (req, res) => {
  const { symbol } = req.params;
  try {
    const q = await yahooFinance.quote(symbol, {}, { skipValidation: true });
    if (!q) return res.status(404).json({ error: "Symbol not found" });
    return res.json(formatQuote(q));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch quote");
    return res.status(404).json({ error: "Symbol not found" });
  }
});

// Cache serveur pour l'historique : TTL 5 min par symbole+range.
// Les requêtes concurrentes pour la même clé partagent la même promesse
// (dédoublonnage en vol), donc deux clients ouverts ne provoquent qu'un
// seul appel Yahoo par symbole par fenêtre de cache.
type HistoryPoint = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
};
const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const historyCache = new Map<string, { expiresAt: number; points: HistoryPoint[] }>();
const inFlight = new Map<string, Promise<HistoryPoint[]>>();

const SHORT_RANGE_CONFIG: Record<string, { durationMs: number; fallbackBars: number }> = {
  "1m": { durationMs: 60 * 1000, fallbackBars: 1 },
  "5m": { durationMs: 5 * 60 * 1000, fallbackBars: 5 },
  "1h": { durationMs: 60 * 60 * 1000, fallbackBars: 60 },
};

function historyCacheTtl(range: string): number {
  if (range === "1m") return 15 * 1000;
  if (range === "5m") return 30 * 1000;
  if (range === "1h") return 60 * 1000;
  return HISTORY_CACHE_TTL_MS;
}

function pruneHistoryCache() {
  const now = Date.now();
  for (const [key, entry] of historyCache) {
    if (entry.expiresAt <= now) historyCache.delete(key);
  }
}

const INTERVAL_MAP: Record<string, string> = {
  "1m": "1m",
  "5m": "1m",
  "1h": "1m",
  "1d": "5m",
  "5d": "15m",
  "1mo": "1d",
  "3mo": "1d",
  "6mo": "1wk",
  "1y": "1mo",
};

router.get("/quotes/:symbol/history/:range", async (req, res) => {
  const { symbol, range } = req.params;
  const validRanges = ["1m", "5m", "1h", "1d", "5d", "1mo", "3mo", "6mo", "1y"];
  if (!validRanges.includes(range)) {
    return res.status(400).json({ error: "Invalid range" });
  }
  const cacheKey = `${symbol.toUpperCase()}:${range}`;
  const cached = historyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.points);
  }
  try {
    let promise = inFlight.get(cacheKey);
    if (!promise) {
      promise = fetchHistory(symbol, range, req.log).then(
        (points) => {
          pruneHistoryCache();
          historyCache.set(cacheKey, { expiresAt: Date.now() + historyCacheTtl(range), points });
          inFlight.delete(cacheKey);
          return points;
        },
        (err) => {
          // Nettoyage sur échec DANS la chaîne partagée : pas de promesse
          // dérivée abandonnée, donc pas de risque d'unhandledRejection.
          inFlight.delete(cacheKey);
          throw err;
        },
      );
      inFlight.set(cacheKey, promise);
    }
    const points = await promise;
    return res.json(points);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch history");
    return res.status(500).json({ error: "Failed to fetch history" });
  }
});

async function fetchHistory(
  symbol: string,
  range: string,
  log: { info: (obj: object, msg: string) => void },
): Promise<HistoryPoint[]> {
  const interval = (INTERVAL_MAP[range] ?? "1d") as "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "90m" | "1h" | "1d" | "5d" | "1wk" | "1mo" | "3mo";

  const toPoints = (quotes: { date: string | number | Date; open?: number; high?: number; low?: number; close?: number; volume?: number }[]): HistoryPoint[] =>
    quotes.map((p) => ({
      date: new Date(p.date).toISOString(),
      open: p.open ?? null,
      high: p.high ?? null,
      low: p.low ?? null,
      close: p.close ?? 0,
      volume: p.volume ?? null,
    }));

  const shortRange = SHORT_RANGE_CONFIG[range];
  const result = await yahooFinance.chart(symbol, {
    period1: shortRange
      ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      : getStartDate(range),
    interval,
  });
  let points = toPoints(result.quotes ?? []);

  if (shortRange && points.length > 0) {
    const cutoff = Date.now() - shortRange.durationMs;
    const recent = points.filter((point) => new Date(point.date).getTime() >= cutoff);
    // Hors séance, conserver les dernières bougies disponibles plutôt que
    // laisser le graphique vide.
    points = recent.length > 0 ? recent : points.slice(-shortRange.fallbackBars);
  }

  // Fallback 1j — marchés fermés (week-end, jour férié) : Yahoo Finance renvoie
  // 0 bougies intraday pour la journée en cours. On recule jusqu'à 7 jours pour
  // capturer la dernière session disponible, puis on filtre pour ne garder que
  // les bougies de ce dernier jour de trading.
  if (range === "1d" && points.length === 0) {
    const fallback = await yahooFinance.chart(symbol, {
      period1: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      interval,
    });
    const all = toPoints(fallback.quotes ?? []);
    if (all.length > 0) {
      // Dernier jour calendaire ayant des données
      const lastDay = all[all.length - 1].date.slice(0, 10); // "YYYY-MM-DD"
      points = all.filter((p) => p.date.startsWith(lastDay));
      log.info({ symbol, lastDay, count: points.length }, "history/1d fallback to last trading session");
    }
  }

  return points;
}

function getStartDate(range: string): Date {
  const now = new Date();
  switch (range) {
    case "1m": return new Date(now.getTime() - 60 * 1000);
    case "5m": return new Date(now.getTime() - 5 * 60 * 1000);
    case "1h": return new Date(now.getTime() - 60 * 60 * 1000);
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
