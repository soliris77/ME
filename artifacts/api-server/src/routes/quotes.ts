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

    const toPoints = (quotes: { date: string | number | Date; open?: number; high?: number; low?: number; close?: number; volume?: number }[]) =>
      quotes.map((p) => ({
        date: new Date(p.date).toISOString(),
        open: p.open ?? null,
        high: p.high ?? null,
        low: p.low ?? null,
        close: p.close ?? 0,
        volume: p.volume ?? null,
      }));

    const result = await yahooFinance.chart(symbol, { period1: getStartDate(range), interval });
    let points = toPoints(result.quotes ?? []);

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
        req.log.info({ symbol, lastDay, count: points.length }, "history/1d fallback to last trading session");
      }
    }

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
