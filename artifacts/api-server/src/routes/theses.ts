import { Router } from "express";
import { db, investmentThesesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// ─── Thèses d'investissement — une par symbole ────────────────────────────────

router.get("/theses", async (req, res) => {
  try {
    const rows = await db.select().from(investmentThesesTable).orderBy(investmentThesesTable.symbol);
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list theses");
    return res.status(500).json({ error: "Failed to list theses" });
  }
});

router.get("/theses/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const [row] = await db.select().from(investmentThesesTable).where(eq(investmentThesesTable.symbol, symbol));
    if (!row) return res.status(404).json({ error: "No thesis for this symbol" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to get thesis");
    return res.status(500).json({ error: "Failed to get thesis" });
  }
});

// Valide un prix décimal en préservant la chaîne telle quelle (pas de passage
// par les flottants IEEE-754 → pas de perte de précision, NaN rejeté).
const DECIMAL_RE = /^\d+(\.\d+)?$/;
function parsePrice(value: unknown, field: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const s = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!DECIMAL_RE.test(s) || /^0+(\.0+)?$/.test(s)) {
    return { ok: false, error: `${field} doit être un prix positif` };
  }
  return { ok: true, value: s };
}

// Comparaison décimale sans conversion flottante : aligne les décimales et
// compare comme des entiers (suffisant pour des prix).
function decimalLte(a: string, b: string): boolean {
  const [ai, ad = ""] = a.split(".");
  const [bi, bd = ""] = b.split(".");
  const scale = Math.max(ad.length, bd.length);
  const aBig = BigInt(ai + ad.padEnd(scale, "0"));
  const bBig = BigInt(bi + bd.padEnd(scale, "0"));
  return aBig <= bBig;
}

// Crée ou met à jour (une seule thèse par symbole).
router.put("/theses/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const { reason, targetPrice, invalidationPrice } = req.body as {
    reason?: string; targetPrice?: unknown; invalidationPrice?: unknown;
  };
  const trimmed = reason?.trim();
  if (!trimmed) return res.status(400).json({ error: "reason is required" });

  const target = parsePrice(targetPrice, "targetPrice");
  if (!target.ok) return res.status(400).json({ error: target.error });
  const invalidation = parsePrice(invalidationPrice, "invalidationPrice");
  if (!invalidation.ok) return res.status(400).json({ error: invalidation.error });

  if (target.value !== null && invalidation.value !== null && decimalLte(target.value, invalidation.value)) {
    return res.status(400).json({ error: "Le seuil d'invalidation doit être sous le prix cible" });
  }

  try {
    const [row] = await db
      .insert(investmentThesesTable)
      .values({ symbol, reason: trimmed, targetPrice: target.value, invalidationPrice: invalidation.value })
      .onConflictDoUpdate({
        target: investmentThesesTable.symbol,
        set: { reason: trimmed, targetPrice: target.value, invalidationPrice: invalidation.value, updatedAt: new Date() },
      })
      .returning();
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to save thesis");
    return res.status(500).json({ error: "Failed to save thesis" });
  }
});

router.delete("/theses/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const deleted = await db.delete(investmentThesesTable).where(eq(investmentThesesTable.symbol, symbol)).returning();
    if (deleted.length === 0) return res.status(404).json({ error: "No thesis for this symbol" });
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete thesis");
    return res.status(500).json({ error: "Failed to delete thesis" });
  }
});

export default router;
