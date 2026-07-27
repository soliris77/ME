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
import { db, ordersTable, rejectedSignalsTable, brokerConnectionsTable } from "@workspace/db";
import { and, eq, gte, desc } from "drizzle-orm";
import { getTradingMode, placeOrder as placeSnaptradeOrder, listPositions } from "./snaptrade";
import { checkOrderRisk, BrokerPosition } from "./risk";
import { getRiskSettings } from "./settings";
import { notifyLargeOrderExecuted } from "./notifications";
import { logger } from "./logger";

export interface SubmitOrderInput {
  signalId: string;
  symbol: string;
  side: string;
  quantity: number;
  accountId?: string;
  expectedPrice?: number;
  /** Provenance : "manual" | "auto-signal" | autre libellé libre */
  source?: string;
  /** Connexion courtier — requise uniquement en mode live */
  brokerConnection?: { snaptradeUserId: string; snaptradeUserSecret: string } | null;
}

export type SubmitOrderResult =
  | { status: "accepted" | "duplicate"; order: Record<string, unknown> }
  | { status: "rejected"; reason: string; message: string; details: Record<string, unknown> };

export class OrderValidationError extends Error {}

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
function mapSnaptradePositions(raw: unknown[]): BrokerPosition[] {
  const positions: BrokerPosition[] = [];
  for (const pos of raw) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = pos as any;
    const symbol: string = p?.symbol?.symbol?.ticker ?? p?.symbol?.ticker ?? p?.symbol ?? "";
    const units = Number(p?.units ?? p?.quantity ?? 0);
    const price = Number(p?.price ?? p?.current_price ?? 0);
    const currency = (p?.symbol?.currency?.code ?? p?.currency ?? "USD").toUpperCase();
    if (symbol && units > 0 && price > 0) {
      positions.push({ symbol: symbol.toUpperCase(), units, price, currency });
    }
  }
  return positions;
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

  const mode = getTradingMode();

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

  // ── 3) Positions réelles du courtier ────────────────────────────────────────
  let brokerPositions: BrokerPosition[] | null = null;
  if (mode === "live" && brokerConnection && accountId) {
    try {
      const rawPositions = await listPositions(
        brokerConnection.snaptradeUserId,
        brokerConnection.snaptradeUserSecret,
        accountId,
      );
      brokerPositions = mapSnaptradePositions(rawPositions as unknown[]);
    } catch (err) {
      logger.warn({ err, accountId }, "orderEngine: failed to fetch broker positions, falling back to order-based exposure");
    }
  }

  // ── 4) Garde-fous de risque ─────────────────────────────────────────────────
  const risk = await checkOrderRisk({ signalId, symbol: symbol.toUpperCase(), side, quantity, mode, brokerPositions });
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
          orderType: "market",
          mode: "paper",
          status: "simulated",
          expectedPrice: String(risk.livePrice),
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
  if (!brokerConnection) {
    return { status: "rejected", reason: "broker_not_connected", message: "Aucune connexion courtier configurée. Rendez-vous dans /courtier.", details: {} };
  }
  if (!accountId) {
    return { status: "rejected", reason: "account_required", message: "accountId requis en mode live.", details: {} };
  }

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
        quantity: String(quantity),
        orderType: "market",
        mode: "live",
        status: "pending",
        expectedPrice: expectedPrice != null ? String(expectedPrice) : String(risk.livePrice),
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

  // Wealthsimple ne supporte pas les fractions (code 1141) — on arrondit
  // à l'entier inférieur. Si ça donne 0, on rejette proprement.
  const wholeQty = Math.floor(quantity);
  if (wholeQty < 1) {
    await db
      .update(ordersTable)
      .set({ status: "error", errorMessage: "La quantité doit être d'au moins 1 action entière. Wealthsimple ne supporte pas les fractions." })
      .where(eq(ordersTable.id, pendingOrder.id));
    return { status: "accepted", order: { ...pendingOrder, status: "error", errorMessage: "La quantité doit être d'au moins 1 action entière." } as typeof pendingOrder };
  }

  try {
    const result = await placeSnaptradeOrder({
      userId: brokerConnection.snaptradeUserId,
      userSecret: brokerConnection.snaptradeUserSecret,
      accountId,
      symbol: symbol.toUpperCase(),
      side,
      quantity: wholeQty,
      clientOrderId: signalId,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    snaptradeOrderId = (result as any)?.id ?? (result as any)?.brokerage_order_id ?? null;
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
