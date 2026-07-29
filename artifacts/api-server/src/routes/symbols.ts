import { Router } from "express";
import { yahooFinance } from "../lib/yahoo";

const router = Router();

/**
 * GET /symbols/search?q=AMD
 * Recherche de symboles via Yahoo Finance autocomplete.
 * Retourne au max 8 résultats filtrés (actions, ETF, crypto, indices).
 */
router.get("/symbols/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q || q.length < 1) return res.json([]);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (yahooFinance.search(q, {}, { skipValidation: true }) as Promise<any>);
    const quotes: unknown[] = result?.quotes ?? [];

    const ALLOWED_TYPES = new Set(["EQUITY", "ETF", "CRYPTOCURRENCY", "INDEX", "MUTUALFUND", "FUTURE"]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = (quotes as any[])
      .filter((q: any) => q?.symbol && ALLOWED_TYPES.has(q?.quoteType?.toUpperCase?.() ?? ""))
      .slice(0, 8)
      .map((q: any) => ({
        symbol: q.symbol as string,
        name: (q.longname ?? q.shortname ?? q.symbol) as string,
        exchange: (q.exchDisp ?? q.exchange ?? "") as string,
        type: (q.quoteType ?? "") as string,
      }));

    return res.json(filtered);
  } catch (err) {
    req.log.warn({ err, q }, "symbols/search: Yahoo Finance search failed");
    return res.json([]);
  }
});

export default router;
