/**
 * Moteur central de soumission d'ordres — POINT D'ENTRÉE UNIQUE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Pipeline complet, dans l'ordre :
 *   0. Kill-switch — bloque TOUT si le trading est suspendu manuellement
 *   1. Validation des champs
 *   2. Idempotence atomique : SELECT optimiste + contrainte unique DB comme verrou
 *   3. Garde-fous de risque (risk.ts)
 *   4. Dispatch paper/live
 *
 * Ordre des opérations en mode LIVE (correction critique) :
 *   a. INSERT une ligne "pending" AVANT d'appeler le courtier
 *      → la contrainte unique (orders_signal_id_idx) sert de verrou distribué :
 *        si deux requêtes concurrentes passent l'idempotence SELECT, une seule
 *        réussira l'INSERT ; l'autre lèvera 23505 et retournera "duplicate"
 *        SANS avoir appelé SnapTrade.
 *   b. Appel à placeOrder() SEULEMENT si l'INSERT a réussi
 *   c. UPDATE de la ligne avec le résultat (status, snaptradeOrderId, errorMessage)
 */
import { db, pool, ordersTable, rejectedSignalsTable, brokerConnectionsTable } from "@workspace/db";
import { and, eq, gte, desc } from "drizzle-orm";
import { getTradingMode } from "./tradingMode";
import { resolveBrokerAdapter } from "./brokerAdapter";
import type { Position } from "@workspace/broker";
import { checkOrderRisk, BrokerPosition } from "./risk";
import { getRiskSettings } from "./settings";
import { notifyLargeOrderExecuted, notifyKillSwitchActivated } from "./notifications";
import { logger } from "./logger";
import { getLiveArm } from "./tradingMode";
import { RiskGate } from "@workspace/risk";
import type { AuditRepo, RiskSettingsRepo } from "@workspace/risk";
import { riskSettingsTable, orderAuditLogTable } from "@workspace/db";
import type { OrderRequest } from "@workspace/broker";

export interface SubmitOrderInput {
  signalId: string;
  symbol: string;
  side: string;
  quantity: number;
  accountId?: string;
  expectedPrice?: number;
  /** Provenance : "manual" | "auto-signal" | autre libellé libre */
  source?: string;
  /** Type d'ordre — "market" (défaut) ou "stop" (SELL stop de protection) */
  orderType?: "market" | "stop";
  /** Prix de déclenchement — requis si orderType === "stop" */
  stopPrice?: number;
  /** Connexion courtier — requise uniquement en mode live */
  brokerConnection?: { snaptradeUserId: string; snaptradeUserSecret: string } | null;
}

export type SubmitOrderResult =
  | { status: "accepted" | "duplicate"; order: Record<string, unknown> }
  | { status: "rejected"; reason: string; message: string; details: Record<string, unknown> };

export class OrderValidationError extends Error {}

/**
 * Statuts sous lesquels un ordre stop protège encore la position.
 * Doit rester aligné avec ACTIVE_STATUSES de GET /api/broker/stop-orders.
 */
export const ACTIVE_STOP_STATUSES = ["pending", "submitted", "simulated"];

/**
 * Extrait l'identifiant d'ordre de la réponse SnapTrade. La réponse peut être
 * un AccountOrderRecord (ID au premier niveau) ou une OrderUpdatedResponse
 * (ID imbriqué sous `order`). Le brokerage_order_id est préféré car c'est la
 * clé des listes d'ordres — indispensable à la synchronisation des fills
 * (coupe-circuit de perte journalière).
 */
export function extractSnaptradeOrderId(result: unknown): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = result as any;
  const id = r?.brokerage_order_id ?? r?.order?.brokerage_order_id ?? r?.id ?? r?.order?.id ?? null;
  return id != null ? String(id) : null;
}

/**
 * Prérequis d'un ordre LIVE — garde-fou "fail closed" : sans connexion
 * courtier ET sans accountId concret, aucun ordre réel n'est soumis ni
 * enregistré. Garantit que chaque ordre live persisté porte un
 * brokerAccountId, condition nécessaire à la synchronisation des fills
 * (et donc au coupe-circuit de perte journalière).
 */
export function validateLiveOrderPrerequisites(
  brokerConnection: unknown,
  accountId: string | undefined,
): Extract<SubmitOrderResult, { status: "rejected" }> | null {
  if (!brokerConnection) {
    return { status: "rejected", reason: "broker_not_connected", message: "Aucune connexion courtier configurée. Rendez-vous dans /courtier.", details: {} };
  }
  if (!accountId) {
    return { status: "rejected", reason: "account_required", message: "accountId requis en mode live.", details: {} };
  }
  return null;
}

function normalizeSide(side: string): "BUY" | "SELL" {
  const upper = side.toUpperCase();
  if (upper !== "BUY" && upper !== "SELL") throw new OrderValidationError("side doit être BUY ou SELL");
  return upper;
}

/** Renvoie true si l'erreur est une violation de contrainte unique PostgreSQL (23505). */
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === "23505";
}

/** Normalise les positions SnapTrade en BrokerPosition[]. */
function mapBrokerPositions(raw: Position[]): BrokerPosition[] {
  return raw
    .map((p) => ({
      symbol: p.symbol.toUpperCase(),
      units: p.quantity,
      price: p.currentPrice ?? p.averagePrice,
      currency: (p.currency ?? "USD").toUpperCase(),
    }))
    .filter((p) => p.symbol && p.units > 0 && p.price > 0);
}

/** Realized live P&L for today's sells using the locally persisted fill ledger.
 * Unknown external lots are deliberately excluded (the same conservative
 * behavior as the daily-loss worker); this routine never invents a cost basis. */
async function getTodayLiveRealizedPnL(accountId: string): Promise<number> {
  const { rows } = await pool.query<{
    symbol: string; side: string; quantity: string; filled_quantity: string | null;
    fill_price: string | null; expected_price: string | null; created_at: Date;
  }>(`SELECT symbol, side, quantity, filled_quantity, fill_price, expected_price, created_at
      FROM orders WHERE mode = 'live' AND broker_account_id = $1
      AND status IN ('filled', 'partially_filled') ORDER BY created_at ASC, id ASC`, [accountId]);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const lots = new Map<string, { quantity: number; cost: number }>();
  let pnl = 0;
  for (const row of rows) {
    const qty = Number(row.filled_quantity ?? row.quantity);
    const price = Number(row.fill_price ?? row.expected_price);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) continue;
    const lot = lots.get(row.symbol) ?? { quantity: 0, cost: 0 };
    if (row.side === "BUY") {
      lot.cost = (lot.cost * lot.quantity + price * qty) / (lot.quantity + qty);
      lot.quantity += qty;
    } else {
      const matched = Math.min(qty, lot.quantity);
      if (row.created_at >= today) pnl += (price - lot.cost) * matched;
      lot.quantity = Math.max(0, lot.quantity - qty);
      if (lot.quantity === 0) lot.cost = 0;
    }
    lots.set(row.symbol, lot);
  }
  return pnl;
}

export async function submitOrder(input: SubmitOrderInput): Promise<SubmitOrderResult> {
  const { signalId, symbol, quantity, accountId, expectedPrice, source, brokerConnection } = input;

  // ── 0) Kill-switch ─────────────────────────────────────────────────────────
  // Premier contrôle, avant toute autre logique.
  // Persisté en base → survit aux redémarrages du serveur.
  const [connRow] = await db.select().from(brokerConnectionsTable).limit(1);
  if (connRow?.tradingHalted) {
    logger.warn({ signalId, source }, "orderEngine: order blocked — kill switch is active");
    return {
      status: "rejected",
      reason: "kill_switch_active",
      message: "Trading suspendu manuellement (kill-switch actif). Réactivez le trading depuis la page Courtier avant de passer des ordres.",
      details: { haltedAt: connRow.haltedAt?.toISOString() ?? null },
    };
  }

  // ── 1) Validation des champs ────────────────────────────────────────────────
  if (!signalId || !symbol || !input.side || !quantity) {
    throw new OrderValidationError("signalId, symbol, side et quantity sont requis");
  }
  const side = normalizeSide(input.side);
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
    throw new OrderValidationError("quantity doit être un nombre positif");
  }
  const orderType: "market" | "stop" = input.orderType === "stop" ? "stop" : "market";
  const stopPrice = input.stopPrice;
  if (orderType === "stop") {
    if (side !== "SELL") {
      throw new OrderValidationError("seuls les ordres stop SELL (protection) sont supportés");
    }
    if (typeof stopPrice !== "number" || !Number.isFinite(stopPrice) || stopPrice <= 0) {
      throw new OrderValidationError("stopPrice doit être un nombre positif pour un ordre stop");
    }
  }

  const mode = getTradingMode();

  // LIVE prerequisites are checked before the temporary arm so callers retain
  // the explicit, established account/connection errors rather than receiving
  // a less useful arm-account mismatch.
  if (mode === "live") {
    const livePrereq = validateLiveOrderPrerequisites(brokerConnection, accountId);
    if (livePrereq) return livePrereq;
  }

  // ── 2) Idempotence ──────────────────────────────────────────────────────────
  // SELECT optimiste : couvre la grande majorité des doublons sans toucher au DB lock.
  // La contrainte unique (orders_signal_id_idx) est le vrai verrou pour les races.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.signalId, signalId), gte(ordersTable.createdAt, cutoff)))
    .limit(1);
  if (existing.length > 0) {
    logger.info({ signalId, source }, "orderEngine: duplicate order suppressed (idempotence)");
    return { status: "duplicate", order: existing[0] };
  }

  // ── 2b) Anti-empilement des stops de protection ────────────────────────────
  // L'idempotence par signalId ne couvre PAS le cas « l'utilisateur ferme le
  // modal, rachète, et resoummet un stop » : chaque montage du modal génère un
  // nouveau signalId. Un stop actif (pending/submitted/simulated) pour le même
  // symbole signifie que la position est déjà protégée — en empiler un second
  // doublerait silencieusement la quantité vendue au déclenchement. On rejette
  // donc explicitement : l'utilisateur doit d'abord annuler le stop existant
  // (page Courtier) s'il veut le remplacer.
  if (orderType === "stop") {
    const symbolUpper = symbol.toUpperCase();
    const stopRows = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.orderType, "stop"), eq(ordersTable.symbol, symbolUpper)));
    const activeStop = stopRows.find(
      (o) =>
        ACTIVE_STOP_STATUSES.includes(o.status) &&
        // Comptes différents = positions différentes → pas un doublon.
        (!accountId || !o.brokerAccountId || o.brokerAccountId === accountId),
    );
    if (activeStop) {
      logger.warn(
        { signalId, symbol: symbolUpper, existingOrderId: activeStop.id, existingStatus: activeStop.status },
        "orderEngine: stop order rejected — an active protective stop already exists for this symbol",
      );
      await db.insert(rejectedSignalsTable).values({
        signalId,
        symbol: symbolUpper,
        reason: "duplicate_stop",
        details: {
          existingOrderId: activeStop.id,
          existingSignalId: activeStop.signalId,
          existingStatus: activeStop.status,
          existingStopPrice: activeStop.expectedPrice,
          side, quantity, stopPrice, source: source ?? "manual", mode,
        },
      });
      return {
        status: "rejected",
        reason: "duplicate_stop",
        message: `Un ordre stop de protection est déjà actif pour ${symbolUpper} (stop à ${activeStop.expectedPrice ?? "?"} $, statut « ${activeStop.status} »). Annulez-le d'abord depuis la page Courtier si vous voulez le remplacer.`,
        details: {
          existingOrderId: activeStop.id,
          existingStatus: activeStop.status,
          existingStopPrice: activeStop.expectedPrice,
        },
      };
    }
  }

  // ── 3) Positions réelles du courtier ────────────────────────────────────────
  let brokerPositions: BrokerPosition[] | null = null;
  if (mode === "live" && brokerConnection && accountId) {
    try {
      const adapter = resolveBrokerAdapter(brokerConnection);
      brokerPositions = mapBrokerPositions(await adapter.getPositions(accountId));
    } catch (err) {
      logger.warn({ err, accountId }, "orderEngine: failed to fetch broker positions, falling back to order-based exposure");
    }
  }

  // ── 4) Garde-fous de risque ─────────────────────────────────────────────────
  const risk = await checkOrderRisk({ signalId, symbol: symbol.toUpperCase(), side, quantity, mode, brokerPositions });
  if (risk.ok && orderType === "stop" && stopPrice != null && stopPrice >= risk.livePrice) {
    // Un stop SELL de protection doit être STRICTEMENT sous le prix courant :
    // un stop >= marché serait déclenché immédiatement — c'est-à-dire une
    // vente market déguisée, jamais l'intention d'un ordre de protection.
    logger.warn({ signalId, symbol, stopPrice, livePrice: risk.livePrice }, "orderEngine: stop order rejected — stopPrice >= live price");
    await db.insert(rejectedSignalsTable).values({
      signalId,
      symbol: symbol.toUpperCase(),
      reason: "stop_above_market",
      details: { stopPrice, livePrice: risk.livePrice, side, quantity, source: source ?? "manual", mode },
    });
    return {
      status: "rejected",
      reason: "stop_above_market",
      message: `Le prix de stop (${stopPrice}) doit être strictement inférieur au prix courant (${risk.livePrice}) — sinon l'ordre se déclencherait immédiatement.`,
      details: { stopPrice, livePrice: risk.livePrice },
    };
  }
  if (!risk.ok) {
    await db.insert(rejectedSignalsTable).values({
      signalId,
      symbol: symbol.toUpperCase(),
      reason: risk.reason,
      details: { ...risk.details, side, quantity, source: source ?? "manual", mode },
    });
    logger.warn({ signalId, symbol, side, quantity, reason: risk.reason }, "orderEngine: order rejected by risk guardrails");
    return { status: "rejected", reason: risk.reason, message: risk.message, details: risk.details };
  }

  // Final shared passage before arming, reservation, or broker dispatch.
  const riskAccount = accountId ?? "default";
  const riskSettings: RiskSettingsRepo = {
    async get(id) {
      const [row] = await db.select().from(riskSettingsTable).where(eq(riskSettingsTable.accountId, id)).limit(1);
      if (row) return { accountId: id, mode: row.mode as "dry_run" | "live", maxPositionPct: Number(row.maxPositionPct), maxDailyLossPct: Number(row.maxDailyLossPct), maxOrdersPerHour: row.maxOrdersPerHour, killSwitchActive: row.killSwitchActive, killSwitchReason: row.killSwitchReason };
      const [created] = await db.insert(riskSettingsTable).values({ accountId: id }).returning();
      return { accountId: id, mode: "dry_run" as const, maxPositionPct: Number(created.maxPositionPct), maxDailyLossPct: Number(created.maxDailyLossPct), maxOrdersPerHour: created.maxOrdersPerHour, killSwitchActive: created.killSwitchActive, killSwitchReason: created.killSwitchReason };
    },
    async activateKillSwitch(id, reason) {
      await db.update(riskSettingsTable).set({ killSwitchActive: true, killSwitchReason: reason, updatedAt: new Date() }).where(eq(riskSettingsTable.accountId, id));
      void notifyKillSwitchActivated(reason).catch((error) => logger.error({ error }, "risk kill-switch notification failed"));
    },
  };
  const riskMode = (await riskSettings.get(riskAccount)).mode;
  const audit: AuditRepo = {
    async record(req, decision, reason, result) {
      await db.insert(orderAuditLogTable).values({ accountId: req.accountId, clientOrderId: req.clientOrderId, mode: riskMode, decision, reason, request: req as unknown as Record<string, unknown>, result: result ?? null });
    },
  };
  const gateDecision = await new RiskGate(riskSettings, audit).evaluate({
    accountId: riskAccount, symbol: symbol.toUpperCase(), side: side.toLowerCase() as "buy" | "sell",
    type: orderType, quantity, clientOrderId: signalId, ...(stopPrice != null ? { stopPrice } : {}),
  }, {
    totalEquity: Math.max(risk.orderValue, 1) / 0.05, dayStartEquity: Math.max(risk.orderValue, 1) / 0.05,
    currentEquity: Math.max(risk.orderValue, 1) / 0.05, ordersLastHour: 0,
    limits: { minQuantity: 0.0001, quantityStep: 0.0001, priceStep: 0.0001 }, referencePrice: risk.livePrice,
  });
  if (!gateDecision.allowed) return { status: "rejected", reason: "risk_gate", message: gateDecision.reason ?? "Ordre bloqué par le garde-fou de risque.", details: { gateReason: gateDecision.reason } };
  const gatedQuantity = gateDecision.adjustedQuantity ?? quantity;

  // Persist a complete simulation and return before live-arm/adapter creation.
  // This is the hard network boundary for persisted dry-run accounts.
  if (riskMode === "dry_run" && mode === "live") {
    const [simulated] = await db.insert(ordersTable).values({
      signalId, symbol: symbol.toUpperCase(), side, quantity: String(gatedQuantity),
      orderType, mode: "paper", status: "simulated",
      expectedPrice: orderType === "stop" ? String(stopPrice) : String(risk.livePrice),
      brokerAccountId: accountId ?? null, submittedAt: new Date(),
    }).returning();
    return { status: "accepted", order: simulated };
  }

  // ── 4b) Temporary LIVE arm — final authorization before broker dispatch ─────
  // This is intentionally after quote/risk validation so the cap is checked
  // against the same notional used for the order, and before any DB reservation
  // or SnapTrade call. A missing/expired/malformed arm always fails closed.
  if (mode === "live") {
    let arm;
    try {
      arm = await getLiveArm();
    } catch (err) {
      logger.error({ err, signalId }, "orderEngine: unable to read live arm");
      return { status: "rejected", reason: "live_arm_unavailable", message: "Armement LIVE impossible à vérifier; aucun ordre n'a été envoyé.", details: {} };
    }
    if (!arm) {
      return { status: "rejected", reason: "live_not_armed", message: "Le trading LIVE n'est pas armé; aucun ordre n'a été envoyé.", details: {} };
    }
    if (arm.expiresAt.getTime() <= Date.now()) {
      return { status: "rejected", reason: "live_arm_expired", message: "L'armement LIVE a expiré; réarmez explicitement le compte.", details: { expiresAt: arm.expiresAt.toISOString() } };
    }
    if (accountId !== arm.accountId) {
      return { status: "rejected", reason: "live_arm_account_mismatch", message: "Cet armement LIVE ne couvre pas ce compte.", details: { armedAccountId: arm.accountId } };
    }
    if (risk.orderValue > arm.maxOrderValue) {
      return { status: "rejected", reason: "live_arm_max_order_value_exceeded", message: "La valeur de l'ordre dépasse le plafond de l'armement LIVE.", details: { orderValue: risk.orderValue, maxOrderValue: arm.maxOrderValue } };
    }
    let realizedPnL: number;
    try {
      realizedPnL = await getTodayLiveRealizedPnL(accountId);
    } catch (err) {
      logger.error({ err, signalId, accountId }, "orderEngine: unable to calculate daily live P&L");
      return { status: "rejected", reason: "live_arm_daily_loss_unavailable", message: "La perte journalière LIVE est impossible à vérifier; aucun ordre n'a été envoyé.", details: {} };
    }
    if (-realizedPnL >= arm.dailyLossCap) {
      return { status: "rejected", reason: "live_arm_daily_loss_cap_reached", message: "La limite de perte journalière de l'armement LIVE est atteinte.", details: { realizedPnL, dailyLossCap: arm.dailyLossCap } };
    }
  }

  // ── 5a) Mode PAPER ──────────────────────────────────────────────────────────
  if (mode === "paper") {
    try {
      const [order] = await db
        .insert(ordersTable)
        .values({
          signalId,
          symbol: symbol.toUpperCase(),
          side,
          quantity: String(quantity),
          orderType,
          mode: "paper",
          status: "simulated",
          expectedPrice: orderType === "stop" ? String(stopPrice) : String(risk.livePrice),
          brokerAccountId: accountId ?? null,
          submittedAt: new Date(),
        })
        .returning();
      logger.info({ signalId, symbol, side, quantity, source: source ?? "manual" }, "orderEngine: paper order recorded");
      await notifyIfLargeOrder({ symbol: symbol.toUpperCase(), side, quantity, orderValue: risk.orderValue, currency: risk.currency, mode: "paper" });
      return { status: "accepted", order };
    } catch (err) {
      if (isUniqueViolation(err)) {
        const [dup] = await db.select().from(ordersTable).where(eq(ordersTable.signalId, signalId)).limit(1);
        if (dup) return { status: "duplicate", order: dup };
      }
      throw err;
    }
  }

  // ── 5b) Mode LIVE ───────────────────────────────────────────────────────────
  // Le garde-fou ci-dessus garantit ces deux valeurs (fail closed).
  if (!brokerConnection || !accountId) throw new Error("invariant: connexion courtier et accountId requis après validation live");

  // ÉTAPE A — Réserver le signalId en base AVANT d'appeler le courtier.
  // La contrainte unique est le verrou : si une requête concurrente a déjà
  // réservé ce signalId, on lève 23505 → retour "duplicate" sans appel SnapTrade.
  let pendingOrder: (typeof ordersTable.$inferSelect);
  try {
    const [inserted] = await db
      .insert(ordersTable)
      .values({
        signalId,
        symbol: symbol.toUpperCase(),
        side,
        quantity: String(gatedQuantity),
        orderType,
        mode: "live",
        status: "pending",
        expectedPrice: orderType === "stop"
          ? String(stopPrice)
          : expectedPrice != null ? String(expectedPrice) : String(risk.livePrice),
        brokerAccountId: accountId,
        submittedAt: new Date(),
      })
      .returning();
    pendingOrder = inserted;
    logger.info({ signalId, symbol, side, quantity }, "orderEngine: live order slot reserved (pending)");
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Requête concurrente a gagné la course — retourner son ordre sans appeler le courtier
      logger.info({ signalId }, "orderEngine: unique constraint race (live slot) — returning existing order");
      const [dup] = await db.select().from(ordersTable).where(eq(ordersTable.signalId, signalId)).limit(1);
      if (dup) return { status: "duplicate", order: dup };
    }
    throw err;
  }

  // ÉTAPE B — Appel SnapTrade UNIQUEMENT si la réservation a réussi.
  // À ce stade, toute requête concurrente avec le même signalId lèvera 23505
  // et retournera "duplicate" sans passer ici.
  let snaptradeOrderId: string | null = null;
  let orderStatus = "submitted";
  let errorMessage: string | null = null;

  // Valider la quantité minimale (fractions supportées selon le courtier/instrument)
  if (quantity < 0.0001) {
    await db
      .update(ordersTable)
      .set({ status: "error", errorMessage: "La quantité doit être supérieure à 0.0001." })
      .where(eq(ordersTable.id, pendingOrder.id));
    return { status: "accepted", order: { ...pendingOrder, status: "error", errorMessage: "La quantité doit être supérieure à 0.0001." } as typeof pendingOrder };
  }

  try {
    const result = await resolveBrokerAdapter(brokerConnection).placeOrder({
      accountId,
      symbol: symbol.toUpperCase(),
      side: side.toLowerCase() as "buy" | "sell",
      type: orderType,
       quantity: gatedQuantity,
      clientOrderId: signalId,
      ...(orderType === "stop" ? { stopPrice, timeInForce: "gtc" as const } : {}),
    });
    snaptradeOrderId = result.brokerOrderId || extractSnaptradeOrderId(result.raw);
    if (!snaptradeOrderId) {
      logger.warn({ signalId, resultKeys: result && typeof result === "object" ? Object.keys(result) : null }, "orderEngine: aucun brokerage_order_id dans la réponse SnapTrade — la synchronisation des fills ne pourra pas rapprocher cet ordre");
    }
    logger.info({ signalId, symbol, side, quantity, snaptradeOrderId, source: source ?? "manual" }, "orderEngine: live order submitted to broker");
  } catch (err) {
    errorMessage = String(err);
    orderStatus = "error";
    logger.error({ err, signalId }, "orderEngine: live order failed at broker");
  }

  // ÉTAPE C — Mettre à jour la ligne "pending" avec le résultat du courtier.
  const [order] = await db
    .update(ordersTable)
    .set({ status: orderStatus, snaptradeOrderId, errorMessage })
    .where(eq(ordersTable.id, pendingOrder.id))
    .returning();

  if (orderStatus !== "error") {
    await notifyIfLargeOrder({ symbol: symbol.toUpperCase(), side, quantity, orderValue: risk.orderValue, currency: risk.currency, mode: "live" });
  }

  return { status: "accepted", order };
}

/** Envoie une notification externe si l'ordre exécuté dépasse le seuil de confirmation renforcée. */
async function notifyIfLargeOrder(params: {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  orderValue: number;
  currency: string;
  mode: "paper" | "live";
}): Promise<void> {
  try {
    const settings = await getRiskSettings();
    const threshold = settings.maxOrderValue * settings.largeOrderFrictionPct;
    if (params.orderValue > threshold) {
      await notifyLargeOrderExecuted(params);
    }
  } catch (err) {
    logger.error({ err }, "orderEngine: failed to evaluate/send large-order notification");
  }
}

export async function listRecentOrders(limit = 50) {
  return db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(limit);
}
