/**
 * /api/copy-trading/* — Gestion des traders suivis et historique des trades copiés
 *
 * GET    /api/copy-trading/traders/search?q=...         → recherche de traders CopyFactory
 * POST   /api/copy-trading/followed-traders              → suivre un trader
 * PATCH  /api/copy-trading/followed-traders/:id          → modifier les règles de risque
 * DELETE /api/copy-trading/followed-traders/:id          → arrêter de suivre
 * GET    /api/copy-trading/copied-trades                 → historique des trades copiés
 * GET    /api/copy-trading/performance/:followedTraderId → stats du trader suivi
 */
import { Router } from "express";
import { db, mtConnectionsTable, followedTradersTable, copiedTradesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { searchStrategies, subscribeToCopyFactoryStrategy, unsubscribeFromCopyFactoryStrategy } from "../lib/integrations/metatrader/client";
import type { NormalizedTrader } from "../lib/integrations/metatrader/types";
import { logger } from "../lib/logger";

const router = Router();

// ─── Helper ───────────────────────────────────────────────────────────────────
async function getActiveConnection() {
  const rows = await db
    .select()
    .from(mtConnectionsTable)
    .where(eq(mtConnectionsTable.isActive, true))
    .limit(1);
  return rows[0] ?? null;
}

// ─── GET /api/copy-trading/traders/search?q= ─────────────────────────────────
router.get("/copy-trading/traders/search", async (req, res) => {
  try {
    const q = (req.query.q as string | undefined) ?? "";

    if (!process.env.METAAPI_TOKEN) {
      return res.status(503).json({
        error: "METAAPI_TOKEN non configuré. Ajoute-le dans les secrets Replit.",
      });
    }

    const strategies = await searchStrategies(q || undefined);

    // Normaliser pour le frontend
    const normalized: NormalizedTrader[] = strategies.map((s) => ({
      strategyId: s._id,
      displayName: s.name,
      description: s.description,
      gainPct: s.statistics?.gain != null ? s.statistics.gain * 100 : null,
      maxDrawdownPct: s.statistics?.maxRelativeDrawdown != null
        ? s.statistics.maxRelativeDrawdown * 100
        : null,
      totalTrades: s.statistics?.trades ?? null,
      winRatePct: s.statistics?.wonTradesByCount != null && s.statistics?.trades
        ? (s.statistics.wonTradesByCount / s.statistics.trades) * 100
        : null,
      subscribers: s.subscribers ?? null,
    }));

    return res.json(normalized);
  } catch (err) {
    logger.error({ err }, "copy-trading: search failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/copy-trading/followed-traders ──────────────────────────────────
// Body : { strategyId, traderDisplayName, maxAmountPerTrade?, maxPercentOfCapital?, stopLossGlobalPercent? }
router.post("/copy-trading/followed-traders", async (req, res) => {
  try {
    const conn = await getActiveConnection();
    if (!conn) {
      return res.status(400).json({
        error: "Aucun compte MetaTrader connecté. Connecte ton compte MT d'abord.",
      });
    }

    const {
      strategyId,
      traderDisplayName,
      maxAmountPerTrade,
      maxPercentOfCapital,
      stopLossGlobalPercent,
    } = req.body as {
      strategyId?: string;
      traderDisplayName?: string;
      maxAmountPerTrade?: number;
      maxPercentOfCapital?: number;
      stopLossGlobalPercent?: number;
    };

    if (!strategyId) {
      return res.status(400).json({ error: "strategyId est requis." });
    }

    const [row] = await db
      .insert(followedTradersTable)
      .values({
        mtConnectionId: conn.id,
        externalStrategyId: strategyId,
        traderDisplayName: traderDisplayName ?? null,
        autoExecute: false, // toujours false à la création — opt-in explicite requis
        maxAmountPerTrade: maxAmountPerTrade != null ? String(maxAmountPerTrade) : null,
        maxPercentOfCapital: maxPercentOfCapital != null ? String(maxPercentOfCapital) : null,
        stopLossGlobalPercent: stopLossGlobalPercent != null ? String(stopLossGlobalPercent) : null,
      })
      .returning();

    logger.info({ strategyId, followedTraderId: row?.id }, "copy-trading: trader followed");
    return res.status(201).json(row);
  } catch (err) {
    // Contrainte unique violée → trader déjà suivi
    if (String(err).includes("unique") || String(err).includes("duplicate")) {
      return res.status(409).json({ error: "Tu suis déjà ce trader." });
    }
    logger.error({ err }, "copy-trading: follow trader failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── PATCH /api/copy-trading/followed-traders/:id ────────────────────────────
// Permet de modifier les règles de risque ET d'activer/désactiver autoExecute.
router.patch("/copy-trading/followed-traders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID invalide." });

    const {
      autoExecute,
      maxAmountPerTrade,
      maxPercentOfCapital,
      stopLossGlobalPercent,
      traderDisplayName,
    } = req.body as {
      autoExecute?: boolean;
      maxAmountPerTrade?: number | null;
      maxPercentOfCapital?: number | null;
      stopLossGlobalPercent?: number | null;
      traderDisplayName?: string;
    };

    // Récupérer le trader suivi existant
    const existing = await db
      .select()
      .from(followedTradersTable)
      .where(eq(followedTradersTable.id, id))
      .limit(1);

    if (!existing[0]) {
      return res.status(404).json({ error: "Trader suivi introuvable." });
    }

    const trader = existing[0];
    const conn = await getActiveConnection();

    // Gérer l'abonnement CopyFactory si autoExecute change
    if (autoExecute !== undefined && autoExecute !== trader.autoExecute && conn?.metaApiAccountId && process.env.METAAPI_TOKEN) {
      if (autoExecute) {
        await subscribeToCopyFactoryStrategy(conn.metaApiAccountId, trader.externalStrategyId).catch(
          (err) => logger.warn({ err }, "copy-trading: CopyFactory subscribe failed"),
        );
      } else {
        await unsubscribeFromCopyFactoryStrategy(conn.metaApiAccountId, trader.externalStrategyId).catch(
          (err) => logger.warn({ err }, "copy-trading: CopyFactory unsubscribe failed"),
        );
      }
    }

    const updateValues: Partial<typeof followedTradersTable.$inferInsert> = {};
    if (autoExecute !== undefined) updateValues.autoExecute = autoExecute;
    if (traderDisplayName !== undefined) updateValues.traderDisplayName = traderDisplayName;
    if (maxAmountPerTrade !== undefined)
      updateValues.maxAmountPerTrade = maxAmountPerTrade != null ? String(maxAmountPerTrade) : null;
    if (maxPercentOfCapital !== undefined)
      updateValues.maxPercentOfCapital = maxPercentOfCapital != null ? String(maxPercentOfCapital) : null;
    if (stopLossGlobalPercent !== undefined)
      updateValues.stopLossGlobalPercent = stopLossGlobalPercent != null ? String(stopLossGlobalPercent) : null;

    const [updated] = await db
      .update(followedTradersTable)
      .set(updateValues)
      .where(eq(followedTradersTable.id, id))
      .returning();

    logger.info({ id, autoExecute }, "copy-trading: trader settings updated");
    return res.json(updated);
  } catch (err) {
    logger.error({ err }, "copy-trading: update trader failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── DELETE /api/copy-trading/followed-traders/:id ───────────────────────────
router.delete("/copy-trading/followed-traders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID invalide." });

    const existing = await db
      .select()
      .from(followedTradersTable)
      .where(eq(followedTradersTable.id, id))
      .limit(1);

    if (!existing[0]) {
      return res.status(404).json({ error: "Trader suivi introuvable." });
    }

    const trader = existing[0];
    const conn = await getActiveConnection();

    // Désabonner de CopyFactory si autoExecute était actif
    if (trader.autoExecute && conn?.metaApiAccountId && process.env.METAAPI_TOKEN) {
      await unsubscribeFromCopyFactoryStrategy(conn.metaApiAccountId, trader.externalStrategyId).catch(
        (err) => logger.warn({ err }, "copy-trading: CopyFactory unsubscribe on delete failed"),
      );
    }

    await db.delete(followedTradersTable).where(eq(followedTradersTable.id, id));
    logger.info({ id }, "copy-trading: trader unfollowed");
    return res.json({ message: "Trader retiré de la liste de suivi." });
  } catch (err) {
    logger.error({ err }, "copy-trading: unfollow trader failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/copy-trading/followed-traders ───────────────────────────────────
router.get("/copy-trading/followed-traders", async (_req, res) => {
  try {
    const traders = await db
      .select()
      .from(followedTradersTable)
      .orderBy(desc(followedTradersTable.createdAt));
    return res.json(traders);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/copy-trading/copied-trades ─────────────────────────────────────
router.get("/copy-trading/copied-trades", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const trades = await db
      .select()
      .from(copiedTradesTable)
      .orderBy(desc(copiedTradesTable.createdAt))
      .limit(limit);
    return res.json(trades);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/copy-trading/performance/:followedTraderId ──────────────────────
router.get("/copy-trading/performance/:followedTraderId", async (req, res) => {
  try {
    const id = Number(req.params.followedTraderId);
    if (isNaN(id)) return res.status(400).json({ error: "ID invalide." });

    const trades = await db
      .select()
      .from(copiedTradesTable)
      .where(eq(copiedTradesTable.followedTraderId, id))
      .orderBy(desc(copiedTradesTable.createdAt));

    const total = trades.length;
    const executed = trades.filter((t) => t.status === "executed").length;
    const notified = trades.filter((t) => t.status === "notified").length;
    const failed = trades.filter((t) => t.status === "failed").length;

    return res.json({
      followedTraderId: id,
      totalTrades: total,
      executed,
      notified,
      failed,
      pending: total - executed - notified - failed,
      trades,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
