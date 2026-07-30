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

const router = Router();

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
      accountId, stopLossPct, takeProfitPct,
      maxTradesPerDay, notifyOnSignal, cooldownMinutes,
    } = req.body as Record<string, unknown>;

    if (!symbol || typeof symbol !== "string") {
      return res.status(400).json({ error: "symbol requis" });
    }

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
      accountId, stopLossPct, takeProfitPct,
      maxTradesPerDay, notifyOnSignal, cooldownMinutes, enabled,
    } = req.body as Record<string, unknown>;

    const [updated] = await db.update(autoTradeRulesTable).set({
      ...(symbol && { symbol: (symbol as string).toUpperCase() }),
      ...(name !== undefined && { name: typeof name === "string" ? name : null }),
      ...(sideMode && { sideMode: sideMode as string }),
      ...(typeof minScore === "number" && { minScore }),
      ...(typeof quantity === "number" && { quantity: String(quantity) }),
      ...(accountId !== undefined && { accountId: typeof accountId === "string" ? accountId : null }),
      ...(stopLossPct !== undefined && { stopLossPct: typeof stopLossPct === "number" ? String(stopLossPct) : null }),
      ...(takeProfitPct !== undefined && { takeProfitPct: typeof takeProfitPct === "number" ? String(takeProfitPct) : null }),
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
