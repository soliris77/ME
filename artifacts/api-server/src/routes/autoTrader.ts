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
import { db, autoTradeRulesTable, autoTradeLogsTable, ordersTable, brokerConnectionsTable, autoTradeCopyBindingsTable, followedTradersTable, watchlistTable, riskSettingsTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { runAutoTradeCheck, getDailyRealizedPnLStatus } from "../workers/autoTradeWorker";
import { runBacktest, WARMUP } from "../lib/backtest";
import { yahooFinance, getQuotes } from "../lib/yahoo";
import type { OHLCPoint } from "../lib/patternDetect";
import { getRiskSettings } from "../lib/settings";
import { getTradingMode } from "../lib/tradingMode";
import { resolveBrokerAdapter } from "../lib/brokerAdapter";
import { getConfiguredAdapterForAccount } from "@workspace/broker";
import { resolveAuthoritativeConnection } from "../lib/connectionResolver";
import { normalizeAccountIdentity } from "../lib/accountIdentity";
function snapCredentials(conn: { snaptradeUserId: string | null; snaptradeUserSecret: string | null } | null | undefined) {
  if (!conn?.snaptradeUserId || !conn.snaptradeUserSecret) return null;
  return { snaptradeUserId: conn.snaptradeUserId, snaptradeUserSecret: conn.snaptradeUserSecret };
}
import { computeIndicators, analyzeTradingSignals } from "@workspace/indicators";
import { buildSuggestions, type AdvisorPosition, type AdvisorSignal } from "../lib/ruleAdvisor";
import {
  computeGlobalRisk, guessCurrency,
  type StopPositionInput, type ExposureInput,
} from "../lib/globalRisk";

const router = Router();
async function authoritativeRiskAccount(raw: unknown): Promise<string> {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("accountId requis");
  const connection = await resolveAuthoritativeConnection(raw);
  const provider = connection.provider === "ccxt" ? "ccxt" : "snaptrade";
  return normalizeAccountIdentity(provider, raw);
}

// Account-scoped Lot 6 risk controls.  Kill-switch cancellation explicitly
// excludes protective stop orders (those are owned by protectiveOrdersTable).
router.get("/auto-trader/risk-settings", async (req, res) => {
  try {
    const accountId = await authoritativeRiskAccount(req.query.accountId);
    let [settings] = await db.select().from(riskSettingsTable).where(eq(riskSettingsTable.accountId, accountId)).limit(1);
    if (!settings) [settings] = await db.insert(riskSettingsTable).values({ accountId }).returning();
    return res.json(settings);
  } catch (err) { logger.error({ err }, "risk settings read failed"); return res.status(500).json({ error: "Impossible de lire les réglages de risque." }); }
});

router.put("/auto-trader/risk-settings", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const accountId = await authoritativeRiskAccount(body.accountId);
    const values = {
      ...(body.mode === "dry_run" || body.mode === "live" ? { mode: body.mode } : {}),
      ...(typeof body.maxPositionPct === "number" ? { maxPositionPct: String(body.maxPositionPct) } : {}),
      ...(typeof body.maxDailyLossPct === "number" ? { maxDailyLossPct: String(body.maxDailyLossPct) } : {}),
      ...(typeof body.maxOrdersPerHour === "number" ? { maxOrdersPerHour: body.maxOrdersPerHour } : {}),
      updatedAt: new Date(),
    };
    const [updated] = await db.insert(riskSettingsTable).values({ accountId, ...values }).onConflictDoUpdate({ target: riskSettingsTable.accountId, set: values }).returning();
    return res.json(updated);
  } catch (err) { logger.error({ err }, "risk settings update failed"); return res.status(400).json({ error: "Réglages de risque invalides." }); }
});

router.post("/auto-trader/risk-settings/kill-switch", async (req, res) => {
  try {
    const accountId = await authoritativeRiskAccount(req.body?.accountId);
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "activation manuelle";
    const [settings] = await db.insert(riskSettingsTable).values({ accountId, killSwitchActive: true, killSwitchReason: reason })
      .onConflictDoUpdate({ target: riskSettingsTable.accountId, set: { killSwitchActive: true, killSwitchReason: reason, updatedAt: new Date() } }).returning();
    // Only regular open orders are cancelled. Protective broker orders are
    // represented in protective_orders and are intentionally untouched.
    let conn;
    try { conn = await resolveAuthoritativeConnection(accountId); } catch { conn = null; }
    let cancelled = 0;
    const credentials = snapCredentials(conn);
    if (credentials || conn?.provider === "ccxt") {
      const provider = conn?.provider === "ccxt" ? "ccxt" : "snaptrade";
      const rawAccountId = provider === "ccxt" ? accountId.replace(/^ccxt:/, "") : accountId.replace(/^snaptrade:/, "");
      const adapter = provider === "ccxt"
        ? getConfiguredAdapterForAccount({ id: rawAccountId, provider: "ccxt", assetClass: "crypto", exchangeId: conn!.exchangeId ?? "kraken" })
        : resolveBrokerAdapter(credentials!);
      const open = await db.select().from(ordersTable).where(and(eq(ordersTable.brokerAccountId, accountId), inArray(ordersTable.status, ["pending", "submitted"])));
      for (const order of open.filter((o) => o.orderType !== "stop" && o.snaptradeOrderId)) {
        await adapter.cancelOrder(rawAccountId, order.snaptradeOrderId!).catch(() => undefined);
        cancelled++;
      }
    }
    return res.json({ ...settings, cancelled });
  } catch (err) { logger.error({ err }, "risk kill switch failed"); return res.status(500).json({ error: "Activation du kill-switch impossible." }); }
});

router.post("/auto-trader/risk-settings/reactivate", async (req, res) => {
  try {
    const accountId = await authoritativeRiskAccount(req.body?.accountId);
    const [settings] = await db.update(riskSettingsTable).set({ killSwitchActive: false, killSwitchReason: null, updatedAt: new Date() }).where(eq(riskSettingsTable.accountId, accountId)).returning();
    if (!settings) return res.status(404).json({ error: "Compte de risque introuvable." });
    return res.json(settings);
  } catch (err) { logger.error({ err }, "risk reactivation failed"); return res.status(500).json({ error: "Réactivation impossible." }); }
});
const VALID_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
function validateTimeframe(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && (VALID_TIMEFRAMES as readonly string[]).includes(value)
    ? null : "timeframe doit être 1m, 5m, 15m, 1h, 4h ou 1d";
}

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
      maxTradesPerDay, notifyOnSignal, cooldownMinutes, aiReview, timeframe,
    } = req.body as Record<string, unknown>;

    if (!symbol || typeof symbol !== "string") {
      return res.status(400).json({ error: "symbol requis" });
    }
    const timeframeError = validateTimeframe(timeframe);
    if (timeframeError) return res.status(400).json({ error: timeframeError });
    const vErr = validateRuleNumbers(req.body as Record<string, unknown>);
    if (vErr) return res.status(400).json({ error: vErr });

    const [rule] = await db.insert(autoTradeRulesTable).values({
      symbol: (symbol as string).toUpperCase(),
      timeframe: typeof timeframe === "string" ? timeframe : "1m",
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
      aiReview: typeof aiReview === "boolean" ? aiReview : false,
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
      maxTradesPerDay, notifyOnSignal, cooldownMinutes, enabled, aiReview,
      timeframe,
    } = req.body as Record<string, unknown>;

    const vErr = validateRuleNumbers(req.body as Record<string, unknown>);
    if (vErr) return res.status(400).json({ error: vErr });
    const timeframeError = validateTimeframe(timeframe);
    if (timeframeError) return res.status(400).json({ error: timeframeError });

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
      ...(typeof aiReview === "boolean" && { aiReview }),
      ...(typeof timeframe === "string" && { timeframe }),
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

// GET /api/auto-trader/daily-pnl — P&L réalisé du jour vs limite configurée
// Même calcul que le coupe-circuit (appariement des lots, ventes du jour).
router.get("/auto-trader/daily-pnl", async (_req, res) => {
  try {
    // Pas de sync des fills ici (appel léger, poll fréquent) — le worker les
    // synchronise toutes les 60 s ; on lit l'état déjà persisté.
    const status = await getDailyRealizedPnLStatus();
    res.json(status);
  } catch (err) {
    logger.error({ err }, "auto-trader: GET daily-pnl error");
    res.status(500).json({ error: "Erreur lors du calcul du P&L du jour" });
  }
});

// GET /api/auto-trader/global-risk — vue « risque global », lecture seule.
// Agrège : perte totale si TOUS les stops actifs sont touchés (positions
// suivies par l'auto-trader + ordres stop courtier en attente), exposition
// par symbole et par devise, et comparaison aux limites configurées.
router.get("/auto-trader/global-risk", async (_req, res) => {
  try {
    const mode = getTradingMode();

    // 1) Positions suivies par l'auto-trader (stops logiciels : SL / trailing)
    const allRules = await db.select().from(autoTradeRulesTable);
    const openRules = allRules.filter(
      (r) => r.openQuantity && parseFloat(r.openQuantity as string) > 0 && r.openEntryPrice,
    );

    // 2) Ordres stop de protection encore actifs chez le courtier
    //    (expectedPrice = stopPrice pour un ordre stop — voir routes/broker.ts)
    const stopOrders = await db.select().from(ordersTable).where(and(
      eq(ordersTable.orderType, "stop"),
      eq(ordersTable.mode, mode),
      inArray(ordersTable.status, ["pending", "submitted"]),
    ));

    // 3) Cotations live pour tous les symboles concernés
    const symbols = [...new Set([
      ...openRules.map((r) => r.symbol),
      ...stopOrders.map((o) => o.symbol),
    ])];
    const quoteMap = new Map<string, { price: number; currency: string }>();
    if (symbols.length > 0) {
      try {
        const quotes = await getQuotes(symbols);
        for (const q of quotes) {
          if (q.symbol && Number.isFinite(q.price) && q.price > 0) {
            quoteMap.set(q.symbol.toUpperCase(), { price: q.price, currency: q.currency || guessCurrency(q.symbol) });
          }
        }
      } catch (err) {
        logger.warn({ err }, "global-risk: getQuotes échoué — risques calculés sans cotations");
      }
    }

    const stopPositions: StopPositionInput[] = [
      ...openRules.map((r): StopPositionInput => ({
        source: "auto_trader",
        refId: r.id,
        symbol: r.symbol,
        quantity: parseFloat(r.openQuantity as string),
        entryPrice: parseFloat(r.openEntryPrice as string),
        currentPrice: quoteMap.get(r.symbol.toUpperCase())?.price ?? null,
        // Les stops logiciels ne sont surveillés que si la règle est active :
        // une règle désactivée avec position ouverte = position non protégée.
        stopLossPct: r.enabled && r.stopLossPct ? parseFloat(r.stopLossPct as string) : null,
        trailingStopPct: r.enabled && r.trailingStopPct ? parseFloat(r.trailingStopPct as string) : null,
        highWaterMark: r.highWaterMark ? parseFloat(r.highWaterMark as string) : null,
        stopPrice: null,
      })),
      ...stopOrders
        .filter((o) => o.side.toUpperCase() === "SELL")
        .map((o): StopPositionInput => ({
          source: "stop_order",
          refId: o.id,
          symbol: o.symbol,
          quantity: Number(o.quantity),
          entryPrice: null,
          currentPrice: quoteMap.get(o.symbol.toUpperCase())?.price ?? null,
          stopLossPct: null,
          trailingStopPct: null,
          highWaterMark: null,
          stopPrice: o.expectedPrice != null ? Number(o.expectedPrice) : null,
        })),
    ];

    // 4) Exposition : positions courtier si connecté (source de vérité),
    //    sinon positions internes de l'auto-trader valorisées aux cotations.
    let exposureRows: ExposureInput[] = [];
    let exposureSource: "broker" | "auto_trader" = "auto_trader";
    let brokerFetchError: string | null = null;

    let conn;
    try { conn = await resolveAuthoritativeConnection(); } catch { conn = null; }

    const credentials = snapCredentials(conn);
    if (conn && conn.status === "connected" && credentials) {
      try {
        const accounts = (conn.accounts as { id: string }[] | null) ?? [];
        const raw: unknown[] = [];
        for (const acc of accounts) {
          if (!acc?.id) continue;
          const positions = await resolveBrokerAdapter(credentials).getPositions(acc.id);
          raw.push(...positions);
        }
        exposureRows = raw.map((r) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = r as any;
          const symbol: string = String(p?.symbol ?? "").toUpperCase();
          const units = Number(p?.quantity ?? 0);
          const price = Number(p?.currentPrice ?? p?.averagePrice ?? 0);
          const currency = String(p?.currency ?? "USD").toUpperCase();
          return { symbol, value: units * price, currency };
        }).filter((r) => r.symbol && r.value > 0);
        // Courtier joignable mais aucune position (ex. comptes vides) :
        // on retombe sur les positions internes pour ne pas afficher 0.
        if (exposureRows.length > 0) exposureSource = "broker";
      } catch (err) {
        brokerFetchError = String(err);
        logger.warn({ err }, "global-risk: lecture des positions courtier échouée — repli sur les positions internes");
      }
    }

    if (exposureSource === "auto_trader") {
      exposureRows = openRules.map((r) => {
        const q = quoteMap.get(r.symbol.toUpperCase());
        const qty = parseFloat(r.openQuantity as string);
        const price = q?.price ?? parseFloat(r.openEntryPrice as string);
        return {
          symbol: r.symbol.toUpperCase(),
          value: qty * price,
          currency: q?.currency ?? guessCurrency(r.symbol),
        };
      });
    }

    // 5) Limites configurées
    const settings = await getRiskSettings();
    const result = computeGlobalRisk(stopPositions, exposureRows);

    return res.json({
      mode,
      generatedAt: new Date().toISOString(),
      ...result,
      exposureSource,
      brokerFetchError,
      limits: {
        maxDailyLossAmount: settings.maxDailyLossAmount,
        maxPortfolioExposure: settings.maxPortfolioExposure,
      },
      riskExceedsDailyLimit:
        settings.maxDailyLossAmount !== null &&
        result.totalRiskIfAllStopsHit > settings.maxDailyLossAmount,
      exposureExceedsLimit:
        Number.isFinite(settings.maxPortfolioExposure) &&
        result.exposure.total > settings.maxPortfolioExposure,
    });
  } catch (err) {
    logger.error({ err }, "auto-trader: GET global-risk error");
    return res.status(500).json({ error: "Erreur lors du calcul du risque global" });
  }
});

// GET /api/auto-trader/suggestions — « Suggestions de règles » (moteur LOCAL gratuit)
// Propose 2-3 règles à partir des données déjà disponibles (positions, watchlist,
// règles existantes, réglages de risque, signaux techniques réutilisés). Ne crée
// jamais de règle : chaque suggestion renvoie un prefill à confirmer dans le
// formulaire habituel. Portefeuille et watchlist vides → [] + message amical.
router.get("/auto-trader/suggestions", async (_req, res) => {
  try {
    const existingRules = await db.select().from(autoTradeRulesTable);

    // 1) Positions détenues (source de vérité : courtier si connecté).
    const positions: AdvisorPosition[] = [];
    let conn;
    try { conn = await resolveAuthoritativeConnection(); } catch { conn = null; }
    const credentials = snapCredentials(conn);
    if (conn && conn.status === "connected" && credentials) {
      try {
        const accounts = (conn.accounts as { id: string }[] | null) ?? [];
        for (const acc of accounts) {
          if (!acc?.id) continue;
          const raw = await resolveBrokerAdapter(credentials).getPositions(acc.id);
          for (const r of raw) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = r as any;
            const symbol: string = String(p?.symbol ?? "").toUpperCase();
            const units = Number(p?.quantity ?? 0);
            const price = Number(p?.currentPrice ?? p?.averagePrice ?? 0);
            if (symbol && units > 0 && price > 0) {
              positions.push({ symbol, value: units * price, price, currency: String(p?.currency ?? "USD").toUpperCase() });
            }
          }
        }
      } catch (err) {
        logger.warn({ err }, "auto-trader: lecture des positions courtier échouée — suggestions sans positions");
      }
    }
    // Repli : positions internes de l'auto-trader (règles avec position ouverte).
    if (positions.length === 0) {
      for (const r of existingRules) {
        const qty = parseFloat(r.openQuantity as string);
        const entry = parseFloat(r.openEntryPrice as string);
        if (Number.isFinite(qty) && qty > 0 && Number.isFinite(entry) && entry > 0) {
          positions.push({ symbol: r.symbol.toUpperCase(), value: qty * entry, price: entry, currency: guessCurrency(r.symbol) });
        }
      }
    }

    // 2) Watchlist (symboles uniques).
    const watchRows = await db.select({ symbol: watchlistTable.symbol }).from(watchlistTable);
    const watchlistSymbols = [...new Set(watchRows.map((w) => (w.symbol || "").toUpperCase()).filter(Boolean))];

    // Portefeuille ET watchlist vides → rien à suggérer (message amical).
    if (positions.length === 0 && watchlistSymbols.length === 0) {
      return res.json({
        suggestions: [],
        message: "Ajoutez des symboles à votre watchlist ou connectez votre portefeuille pour recevoir des suggestions de règles.",
      });
    }

    // 3) Signaux techniques — calculés UNIQUEMENT pour les symboles watchlist non
    //    encore couverts par une règle d'achat (réutilise le calcul existant,
    //    aucun fournisseur externe supplémentaire).
    const signals = new Map<string, AdvisorSignal>();
    const ruleBuySymbols = new Set(existingRules
      .filter((r) => ["buy", "both"].includes((r.sideMode || "both").toLowerCase()))
      .map((r) => r.symbol.toUpperCase()));
    const symbolsToScore = watchlistSymbols.filter((s) => !ruleBuySymbols.has(s)).slice(0, 20);
    const DAY = 24 * 60 * 60 * 1000;
    await Promise.all(symbolsToScore.map(async (sym) => {
      try {
        const chart = await yahooFinance.chart(sym, { period1: new Date(Date.now() - 400 * DAY), interval: "1d" });
        const history: OHLCPoint[] = (chart.quotes ?? []).map((p: { date: string | number | Date; open?: number; high?: number; low?: number; close?: number; volume?: number }) => ({
          date: new Date(p.date).toISOString(),
          open: p.open ?? null, high: p.high ?? null, low: p.low ?? null,
          close: p.close ?? 0, volume: p.volume ?? null,
        }));
        if (history.length < 55) return;
        const indicators = computeIndicators(history);
        const currentPrice = history[history.length - 1].close;
        // Prix courant transmis au conseiller : sans prix positif fiable, aucune
        // suggestion d'achat ne sera émise (fail-closed côté moteur).
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) return;
        const analysis = analyzeTradingSignals(indicators, currentPrice);
        signals.set(sym, { score: analysis.score, overall: analysis.overall, price: currentPrice });
      } catch (err) {
        logger.debug({ err, sym }, "auto-trader: signal watchlist indisponible — symbole ignoré");
      }
    }));

    const settings = await getRiskSettings();
    const suggestions = buildSuggestions({
      positions,
      watchlistSymbols,
      existingRules: existingRules.map((r) => ({
        symbol: r.symbol,
        sideMode: r.sideMode ?? "both",
        enabled: r.enabled ?? undefined,
        stopLossPct: r.stopLossPct,
        trailingStopPct: r.trailingStopPct,
        openQuantity: r.openQuantity,
      })),
      signals,
      riskSettings: { maxOrderValue: settings.maxOrderValue, maxPortfolioExposure: settings.maxPortfolioExposure },
    });

    return res.json({
      suggestions,
      message: suggestions.length === 0
        ? "Aucune suggestion pour le moment : vos positions sont déjà protégées et aucun signal fort n'est détecté."
        : null,
    });
  } catch (err) {
    logger.error({ err }, "auto-trader: GET suggestions error");
    return res.status(500).json({ error: "Erreur lors du calcul des suggestions" });
  }
});

// POST /api/auto-trader/backtest — simule une stratégie sur l'historique
router.post("/auto-trader/backtest", async (req, res) => {
  try {
    const {
      symbol, minScore, sideMode, stopLossPct, takeProfitPct, trailingStopPct, years, months, includeHistory,
    } = req.body as Record<string, unknown>;

    if (!symbol || typeof symbol !== "string") {
      return res.status(400).json({ error: "symbol requis" });
    }
    const vErr = validateRuleNumbers(req.body as Record<string, unknown>);
    if (vErr) return res.status(400).json({ error: vErr });

    // Fenêtre de simulation : soit en années (1-5, défaut 2), soit en mois (3-12).
    // En mode "mois", on récupère ~3 mois supplémentaires pour le warm-up des
    // indicateurs (55 barres) afin que la simulation couvre bien la fenêtre demandée.
    const DAY = 24 * 60 * 60 * 1000;
    const lookbackMonths = typeof months === "number" && months >= 3 && months <= 12 ? months : null;
    const lookbackYears = typeof years === "number" && years >= 1 && years <= 5 ? years : 2;
    const period1 = lookbackMonths !== null
      ? new Date(Date.now() - (lookbackMonths * 30.5 + 95) * DAY)
      : new Date(Date.now() - lookbackYears * 365 * DAY);
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

    const minBars = lookbackMonths !== null ? WARMUP + 20 : 120;
    if (history.length < minBars) {
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

    // Historique de graphique (post-warm-up = fenêtre réellement simulée),
    // pour afficher les marqueurs d'entrées/sorties côté frontend.
    const chartHistory = includeHistory === true
      ? history.slice(WARMUP).map((p) => ({ date: p.date, close: p.close }))
      : undefined;

    return res.json({
      symbol: symbol.toUpperCase(),
      years: lookbackMonths !== null ? lookbackMonths / 12 : lookbackYears,
      months: lookbackMonths,
      ...result,
      ...(chartHistory ? { chartHistory } : {}),
    });
  } catch (err) {
    logger.error({ err }, "auto-trader: POST backtest error");
    return res.status(500).json({ error: "Erreur lors du backtest" });
  }
});

// ── Liaisons copy-trading → auto-trader ────────────────────────────────────────
// Source de signal optionnelle : associe une règle d'auto-trading à un trader
// suivi. Quand ce trader ouvre un trade, l'auto-trader soumet un ordre via le
// même pipeline de risque (si le symbole correspond exactement à la règle).

// GET /api/auto-trader/copy-bindings — liste avec noms de règle et de trader
router.get("/auto-trader/copy-bindings", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: autoTradeCopyBindingsTable.id,
        ruleId: autoTradeCopyBindingsTable.ruleId,
        followedTraderId: autoTradeCopyBindingsTable.followedTraderId,
        enabled: autoTradeCopyBindingsTable.enabled,
        createdAt: autoTradeCopyBindingsTable.createdAt,
        ruleName: autoTradeRulesTable.name,
        ruleSymbol: autoTradeRulesTable.symbol,
        traderDisplayName: followedTradersTable.traderDisplayName,
        traderStrategyId: followedTradersTable.externalStrategyId,
      })
      .from(autoTradeCopyBindingsTable)
      .leftJoin(autoTradeRulesTable, eq(autoTradeCopyBindingsTable.ruleId, autoTradeRulesTable.id))
      .leftJoin(followedTradersTable, eq(autoTradeCopyBindingsTable.followedTraderId, followedTradersTable.id))
      .orderBy(desc(autoTradeCopyBindingsTable.id));
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "auto-trader: GET copy-bindings error");
    res.status(500).json({ error: "Erreur lors du chargement des liaisons copy-trading" });
  }
});

// POST /api/auto-trader/copy-bindings — { ruleId, followedTraderId }
router.post("/auto-trader/copy-bindings", async (req, res) => {
  try {
    const { ruleId, followedTraderId } = req.body as Record<string, unknown>;
    if (typeof ruleId !== "number" || !Number.isInteger(ruleId)) {
      return res.status(400).json({ error: "ruleId (entier) requis" });
    }
    if (typeof followedTraderId !== "number" || !Number.isInteger(followedTraderId)) {
      return res.status(400).json({ error: "followedTraderId (entier) requis" });
    }

    // Vérifier l'existence des deux références (message d'erreur clair).
    const [rule] = await db.select().from(autoTradeRulesTable).where(eq(autoTradeRulesTable.id, ruleId)).limit(1);
    if (!rule) return res.status(404).json({ error: "Règle introuvable" });
    const [trader] = await db.select().from(followedTradersTable).where(eq(followedTradersTable.id, followedTraderId)).limit(1);
    if (!trader) return res.status(404).json({ error: "Trader suivi introuvable" });

    const [binding] = await db.insert(autoTradeCopyBindingsTable).values({
      ruleId,
      followedTraderId,
      enabled: true,
    }).returning();

    logger.info({ bindingId: binding.id, ruleId, followedTraderId }, "auto-trader: liaison copy-trading créée");
    return res.status(201).json(binding);
  } catch (err) {
    if (String(err).includes("unique") || String(err).includes("duplicate")) {
      return res.status(409).json({ error: "Cette liaison existe déjà." });
    }
    logger.error({ err }, "auto-trader: POST copy-bindings error");
    return res.status(500).json({ error: "Erreur lors de la création de la liaison" });
  }
});

// PATCH /api/auto-trader/copy-bindings/:id — { enabled }
router.patch("/auto-trader/copy-bindings/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "id invalide" });
    const { enabled } = req.body as Record<string, unknown>;
    if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled (booléen) requis" });

    const [updated] = await db.update(autoTradeCopyBindingsTable)
      .set({ enabled })
      .where(eq(autoTradeCopyBindingsTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Liaison introuvable" });
    return res.json(updated);
  } catch (err) {
    logger.error({ err }, "auto-trader: PATCH copy-bindings error");
    return res.status(500).json({ error: "Erreur lors de la mise à jour de la liaison" });
  }
});

// DELETE /api/auto-trader/copy-bindings/:id
router.delete("/auto-trader/copy-bindings/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "id invalide" });
    await db.delete(autoTradeCopyBindingsTable).where(eq(autoTradeCopyBindingsTable.id, id));
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "auto-trader: DELETE copy-bindings error");
    return res.status(500).json({ error: "Erreur lors de la suppression de la liaison" });
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
