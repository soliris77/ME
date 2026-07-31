/**
 * Débriefing quotidien — GET /api/debrief?date=YYYY-MM-DD
 * ─────────────────────────────────────────────────────────────────────────────
 * Agrège en lecture seule tout ce qui s'est passé un jour donné (UTC, comme le
 * calcul du coupe-circuit) : ordres, P&L réalisé, activité auto-trader,
 * événements critiques du journal d'audit. Ne modifie rien en base.
 */
import { Router } from "express";
import { db, ordersTable, autoTradeLogsTable, auditLogTable } from "@workspace/db";
import { and, gte, lt, asc } from "drizzle-orm";
import { computeRealizedDailyPnL } from "../workers/autoTradeWorker";

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get("/debrief", async (req, res) => {
  try {
    const raw = typeof req.query.date === "string" ? req.query.date : "";
    let dayStart: Date;
    if (raw) {
      if (!DATE_RE.test(raw)) return res.status(400).json({ error: "Format de date invalide (attendu : YYYY-MM-DD)." });
      dayStart = new Date(`${raw}T00:00:00.000Z`);
      if (isNaN(dayStart.getTime())) return res.status(400).json({ error: "Date invalide." });
    } else {
      dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
    }
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const [ordersUpToDay, dayLogs, dayAudit] = await Promise.all([
      // Historique complet jusqu'à la fin du jour — nécessaire pour reconstituer
      // le coût moyen des positions et donc le P&L réalisé du jour.
      db.select().from(ordersTable)
        .where(lt(ordersTable.createdAt, dayEnd))
        .orderBy(asc(ordersTable.createdAt)),
      db.select().from(autoTradeLogsTable)
        .where(and(gte(autoTradeLogsTable.createdAt, dayStart), lt(autoTradeLogsTable.createdAt, dayEnd)))
        .orderBy(asc(autoTradeLogsTable.createdAt)),
      db.select().from(auditLogTable)
        .where(and(gte(auditLogTable.createdAt, dayStart), lt(auditLogTable.createdAt, dayEnd)))
        .orderBy(asc(auditLogTable.createdAt)),
    ]);

    const dayOrders = ordersUpToDay.filter((o) => o.createdAt >= dayStart);
    const { realizedPnL, unmatchedSells } = computeRealizedDailyPnL(ordersUpToDay, dayStart);

    // Classement auto vs manuel : un ordre référencé par un log auto-trader est automatique.
    const autoOrderIds = new Set(dayLogs.map((l) => l.orderId).filter((id): id is number => id != null));

    const buys  = dayOrders.filter((o) => o.side.toUpperCase() === "BUY");
    const sells = dayOrders.filter((o) => o.side.toUpperCase() === "SELL");
    const executed = dayOrders.filter((o) => ["filled", "partially_filled", "simulated"].includes(o.status));
    const failed   = dayOrders.filter((o) => ["rejected", "error"].includes(o.status));

    return res.json({
      date: dayStart.toISOString().slice(0, 10),
      realizedPnL,
      unmatchedSells,
      stats: {
        totalOrders: dayOrders.length,
        buys: buys.length,
        sells: sells.length,
        executed: executed.length,
        failed: failed.length,
        auto: dayOrders.filter((o) => autoOrderIds.has(o.id)).length,
        manual: dayOrders.filter((o) => !autoOrderIds.has(o.id)).length,
      },
      orders: dayOrders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt.toISOString(),
        symbol: o.symbol,
        side: o.side.toUpperCase(),
        quantity: o.quantity,
        orderType: o.orderType,
        mode: o.mode,
        status: o.status,
        fillPrice: o.fillPrice,
        expectedPrice: o.expectedPrice,
        errorMessage: o.errorMessage,
        isAuto: autoOrderIds.has(o.id),
      })),
      autoTrader: dayLogs.map((l) => ({
        id: l.id,
        createdAt: l.createdAt.toISOString(),
        symbol: l.symbol,
        side: l.side,
        triggerType: l.triggerType,
        signalScore: l.signalScore,
        signalVerdict: l.signalVerdict,
        price: l.price,
        quantity: l.quantity,
        orderId: l.orderId,
        notes: l.notes,
      })),
      audit: dayAudit.map((a) => ({
        id: a.id,
        createdAt: a.createdAt.toISOString(),
        action: a.action,
        summary: a.summary,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "debrief: failed");
    return res.status(500).json({ error: "Erreur lors du calcul du débriefing." });
  }
});

export default router;
