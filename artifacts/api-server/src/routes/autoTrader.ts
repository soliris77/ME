/**
 * Routes Auto-Trader
 * GET    /api/auto-trader/rules         — liste toutes les règles
 * POST   /api/auto-trader/rules         — créer une règle
 * PUT    /api/auto-trader/rules/:id     — mettre à jour une règle
 * DELETE /api/auto-trader/rules/:id     — supprimer une règle
 * PATCH  /api/auto-trader/rules/:id/toggle — activer/désactiver
 * GET    /api/auto-trader/logs          — historique des déclenchements
 * POST   /api/auto-trader/run           — forcer un cycle immédiat (debug)
 */
import { Router } from "express";
import { db, autoTradeRulesTable, autoTradeLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { runAutoTradeCheck } from "../workers/autoTradeWorker";
import { runBacktest } from "../lib/backtest";
import { yahooFinance } from "../lib/yahoo";
import type { OHLCPoint } from "../lib/patternDetect";

const router = Router();

/** Retourne le nombre s'il est fini et dans [min, max], sinon undefined. */
function boundedNumber(v: unknown, min: number, max: number): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : undefined;
}

/** Valide les champs numériques communs d'une règle. Retourne un message d'erreur ou null. */
function validateRuleNumbers(b: Record<string, unknown>): string | null {
  const checks: [unknown, number, number, string][] = [
    [b.minScore,        10, 100,   "minScore doit être entre 10 et 100"],
    [b.quantity,        0.0001, 1_000_000, "quantity doit être entre 0.0001 et 1 000 000"],
    [b.stopLossPct,     0.1, 50,   "stopLossPct doit être entre 0.1 et 50"],
    [b.takeProfitPct,   0.1, 500,  "takeProfitPct doit être entre 0.1 et 500"],
    [b.trailingStopPct, 0.1, 50,   "trailingStopPct doit être entre 0.1 et 50"],
    [b.riskAmount,      1, 1_000_000, "riskAmount doit être entre 1 et 1 000 000"],
    [b.maxTradesPerDay, 1, 50,     "maxTradesPerDay doit être entre 1 et 50"],
    [b.cooldownMinutes, 5, 10_080, "cooldownMinutes doit être entre 5 et 10080"],
  ];
  for (const [v, min, max, msg] of checks) {
    if (v !== undefined && v !== null && boundedNumber(v, min, max) === undefined) return msg;
  }
  if (b.sideMode !== undefined && !["buy", "sell", "both"].includes(b.sideMode as string)) {
    return 'sideMode doit être "buy", "sell" ou "both"';
  }
  if (b.sizingMode === "risk") {
    const risk = boundedNumber(b.riskAmount, 1, 1_000_000);
    const sl = boundedNumber(b.stopLossPct, 0.1, 50);
    if (risk === undefined || sl === undefined) {
      return 'le mode "risk" exige riskAmount (≥ 1 $) et stopLossPct (> 0)';
    }
  }
  return null;
}

// GET /api/auto-trader/rules
router.get("/auto-trader/rules", async (_req, res) => {
  try {
    const rules = await db
      .select()
      .from(autoTradeRulesTable)
      .orderBy(desc(autoTradeRulesTable.createdAt));
    res.json(rules);
  } catch (err) {
    logger.error({ err }, "auto-trader: GET rules error");
    res.status(500).json({ error: "Erreur lors du chargement des règles" });
  }
});

// POST /api/auto-trader/rules
router.post("/auto-trader/rules", async (req, res) => {
  try {
    const {
      symbol, name, sideMode, minScore, quantity,
      accountId, stopLossPct, takeProfitPct, trailingStopPct,
      sizingMode, riskAmount, confirmWeekly,
      maxTradesPerDay, notifyOnSignal, cooldownMinutes,
    } = req.body as Record<string, unknown>;

    if (!symbol || typeof symbol !== "string") {
      return res.status(400).json({ error: "symbol requis" });
    }
    const vErr = validateRuleNumbers(req.body as Record<string, unknown>);
    if (vErr) return res.status(400).json({ error: vErr });

    const [rule] = await db.insert(autoTradeRulesTable).values({
      symbol: (symbol as string).toUpperCase(),
      name: typeof name === "string" ? name : null,
      enabled: true,
      sideMode: typeof sideMode === "string" ? sideMode : "both",
      minScore: typeof minScore === "number" ? minScore : 60,
      quantity: typeof quantity === "number" ? String(quantity) : "1",
      accountId: typeof accountId === "string" ? accountId : null,
      stopLossPct: typeof stopLossPct === "number" ? String(stopLossPct) : null,
      takeProfitPct: typeof takeProfitPct === "number" ? String(takeProfitPct) : null,
      trailingStopPct: typeof trailingStopPct === "number" ? String(trailingStopPct) : null,
      sizingMode: sizingMode === "risk" ? "risk" : "fixed",
      riskAmount: typeof riskAmount === "number" && riskAmount > 0 ? String(riskAmount) : null,
      confirmWeekly: typeof confirmWeekly === "boolean" ? confirmWeekly : false,
      maxTradesPerDay: typeof maxTradesPerDay === "number" ? maxTradesPerDay : 3,
      notifyOnSignal: typeof notifyOnSignal === "boolean" ? notifyOnSignal : true,
      cooldownMinutes: typeof cooldownMinutes === "number" ? cooldownMinutes : 240,
    }).returning();

    logger.info({ ruleId: rule.id, symbol: rule.symbol }, "auto-trader: règle créée");
    return res.status(201).json(rule);
  } catch (err) {
    logger.error({ err }, "auto-trader: POST rules error");
    return res.status(500).json({ error: "Erreur lors de la création de la règle" });
  }
});

// PUT /api/auto-trader/rules/:id
router.put("/auto-trader/rules/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "id invalide" });

    const {
      symbol, name, sideMode, minScore, quantity,
      accountId, stopLossPct, takeProfitPct, trailingStopPct,
      sizingMode, riskAmount, confirmWeekly,
      maxTradesPerDay, notifyOnSignal, cooldownMinutes, enabled,
    } = req.body as Record<string, unknown>;

    const vErr = validateRuleNumbers(req.body as Record<string, unknown>);
    if (vErr) return res.status(400).json({ error: vErr });

    const [updated] = await db.update(autoTradeRulesTable).set({
      ...(typeof symbol === "string" && symbol ? { symbol: symbol.toUpperCase() } : {}),
      ...(name !== undefined && { name: typeof name === "string" ? name : null }),
      ...(typeof sideMode === "string" && sideMode ? { sideMode } : {}),
      ...(typeof minScore === "number" && { minScore }),
      ...(typeof quantity === "number" && { quantity: String(quantity) }),
      ...(accountId !== undefined && { accountId: typeof accountId === "string" ? accountId : null }),
      ...(stopLossPct !== undefined && { stopLossPct: typeof stopLossPct === "number" ? String(stopLossPct) : null }),
      ...(takeProfitPct !== undefined && { takeProfitPct: typeof takeProfitPct === "number" ? String(takeProfitPct) : null }),
      ...(trailingStopPct !== undefined && { trailingStopPct: typeof trailingStopPct === "number" ? String(trailingStopPct) : null }),
      ...(sizingMode !== undefined && { sizingMode: sizingMode === "risk" ? "risk" : "fixed" }),
      ...(riskAmount !== undefined && { riskAmount: typeof riskAmount === "number" && riskAmount > 0 ? String(riskAmount) : null }),
      ...(typeof confirmWeekly === "boolean" && { confirmWeekly }),
      ...(typeof maxTradesPerDay === "number" && { maxTradesPerDay }),
      ...(typeof notifyOnSignal === "boolean" && { notifyOnSignal }),
      ...(typeof cooldownMinutes === "number" && { cooldownMinutes }),
      ...(typeof enabled === "boolean" && { enabled }),
      updatedAt: new Date(),
    }).where(eq(autoTradeRulesTable.id, id)).returning();

    if (!updated) return res.status(404).json({ error: "Règle introuvable" });
    return res.json(updated);
  } catch (err) {
    logger.error({ err }, "auto-trader: PUT rules error");
    return res.status(500).json({ error: "Erreur lors de la mise à jour" });
  }
});

// PATCH /api/auto-trader/rules/:id/toggle
router.patch("/auto-trader/rules/:id/toggle", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "id invalide" });

    const [existing] = await db.select().from(autoTradeRulesTable).where(eq(autoTradeRulesTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Règle introuvable" });

    const [updated] = await db.update(autoTradeRulesTable)
      .set({ enabled: !existing.enabled, updatedAt: new Date() })
      .where(eq(autoTradeRulesTable.id, id))
      .returning();

    return res.json(updated);
  } catch (err) {
    logger.error({ err }, "auto-trader: PATCH toggle error");
    return res.status(500).json({ error: "Erreur lors du toggle" });
  }
});

// DELETE /api/auto-trader/rules/:id
router.delete("/auto-trader/rules/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "id invalide" });
    await db.delete(autoTradeRulesTable).where(eq(autoTradeRulesTable.id, id));
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "auto-trader: DELETE rules error");
    return res.status(500).json({ error: "Erreur lors de la suppression" });
  }
});

// GET /api/auto-trader/logs
router.get("/auto-trader/logs", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
    const logs = await db.select().from(autoTradeLogsTable)
      .orderBy(desc(autoTradeLogsTable.createdAt))
      .limit(limit);
    res.json(logs);
  } catch (err) {
    logger.error({ err }, "auto-trader: GET logs error");
    res.status(500).json({ error: "Erreur lors du chargement des logs" });
  }
});

// POST /api/auto-trader/backtest — simule une stratégie sur l'historique
router.post("/auto-trader/backtest", async (req, res) => {
  try {
    const {
      symbol, minScore, sideMode, stopLossPct, takeProfitPct, trailingStopPct, years,
    } = req.body as Record<string, unknown>;

    if (!symbol || typeof symbol !== "string") {
      return res.status(400).json({ error: "symbol requis" });
    }
    if (sideMode === "sell") {
      return res.status(400).json({ error: "Le backtest ne modélise que les stratégies acheteuses (long) — mode \"sell\" non supporté" });
    }
    const vErr = validateRuleNumbers(req.body as Record<string, unknown>);
    if (vErr) return res.status(400).json({ error: vErr });

    const lookbackYears = typeof years === "number" && years >= 1 && years <= 5 ? years : 2;
    const period1 = new Date(Date.now() - lookbackYears * 365 * 24 * 60 * 60 * 1000);
    const chart = await yahooFinance.chart(symbol.toUpperCase(), { period1, interval: "1d" });
    const history: OHLCPoint[] = (chart.quotes ?? [])
      .map((p: { date: string | number | Date; open?: number; high?: number; low?: number; close?: number; volume?: number }) => ({
        date: new Date(p.date).toISOString(),
        open: p.open ?? null,
        high: p.high ?? null,
        low: p.low ?? null,
        close: p.close ?? 0,
        volume: p.volume ?? null,
      }))
      .filter((p: OHLCPoint) => p.close > 0);

    if (history.length < 120) {
      return res.status(400).json({ error: "Historique insuffisant pour ce symbole (min ~6 mois)" });
    }

    const result = runBacktest({
      history,
      minScore: typeof minScore === "number" ? minScore : 60,
      sideMode: sideMode === "buy" || sideMode === "sell" || sideMode === "both" ? sideMode : "both",
      stopLossPct: typeof stopLossPct === "number" && stopLossPct > 0 ? stopLossPct : null,
      takeProfitPct: typeof takeProfitPct === "number" && takeProfitPct > 0 ? takeProfitPct : null,
      trailingStopPct: typeof trailingStopPct === "number" && trailingStopPct > 0 ? trailingStopPct : null,
    });

    return res.json({ symbol: symbol.toUpperCase(), years: lookbackYears, ...result });
  } catch (err) {
    logger.error({ err }, "auto-trader: POST backtest error");
    return res.status(500).json({ error: "Erreur lors du backtest" });
  }
});

// POST /api/auto-trader/run — force un cycle immédiat
router.post("/auto-trader/run", async (_req, res) => {
  try {
    void runAutoTradeCheck().catch((err) => logger.error({ err }, "auto-trader: forced run failed"));
    res.json({ ok: true, message: "Cycle démarré en arrière-plan" });
  } catch (err) {
    logger.error({ err }, "auto-trader: POST run error");
    res.status(500).json({ error: "Erreur lors du démarrage du cycle" });
  }
});

export default router;
