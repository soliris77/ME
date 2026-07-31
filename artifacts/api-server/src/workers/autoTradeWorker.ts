/**
 * Auto-Trade Worker — Moteur d'automatisation du trading
 * ─────────────────────────────────────────────────────────────────────────────
 * Toutes les 60 secondes :
 *   1. checkProtectiveExits() — surveille les positions ouvertes (SL/TP)
 *   2. checkDailyLossCircuitBreaker() — coupe-circuit de perte journalière
 *   3. processRule() — évalue chaque règle active (signal → ordre ou notif)
 */
import { db, autoTradeRulesTable, autoTradeLogsTable, brokerConnectionsTable, ordersTable, appSettingsTable, auditLogTable } from "@workspace/db";
import { eq, and, gte, sql, inArray } from "drizzle-orm";
import { yahooFinance, getQuotes } from "../lib/yahoo";
import { computeIndicators, analyzeTradingSignals } from "../lib/signals";
import type { OHLCPoint } from "../lib/patternDetect";
import { submitOrder } from "../lib/orderEngine";
import { sendSms } from "../lib/smsClient";
import { sendEmail } from "../lib/emailClient";
import { resolveDestinations } from "../lib/notificationPrefs";
import { logger } from "../lib/logger";
import { getTradingMode } from "../lib/tradingMode";
import { notifyKillSwitchActivated, notifyDailyLossWarning } from "../lib/notifications";

const WORKER_INTERVAL_MS = 60_000;
const OHLC_DAYS = 90;

async function fetchOHLC(symbol: string, interval: "1d" | "1wk" = "1d", days = OHLC_DAYS): Promise<OHLCPoint[]> {
  const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await yahooFinance.chart(symbol, { period1, interval });
  return (result.quotes ?? []).map((p: { date: string | number | Date; open?: number; high?: number; low?: number; close?: number; volume?: number }) => ({
    date: new Date(p.date).toISOString(),
    open: p.open ?? null,
    high: p.high ?? null,
    low: p.low ?? null,
    close: p.close ?? 0,
    volume: p.volume ?? null,
  }));
}

function isTodayReset(resetAt: Date | null): boolean {
  if (!resetAt) return false;
  const now = new Date();
  return (
    resetAt.getUTCFullYear() === now.getUTCFullYear() &&
    resetAt.getUTCMonth() === now.getUTCMonth() &&
    resetAt.getUTCDate() === now.getUTCDate()
  );
}

async function resolveConnection() {
  const [conn] = await db.select().from(brokerConnectionsTable).limit(1);
  return conn ?? null;
}

async function sendAutoTradeNotification(params: {
  symbol: string;
  side: "BUY" | "SELL";
  verdict: string;
  score: number;
  price: number;
  quantity: number;
  triggerType: "order" | "notification_only" | "stop_loss" | "take_profit" | "trailing_stop";
  orderMode?: "paper" | "live";
}) {
  const { symbol, side, verdict, score, price, quantity, triggerType, orderMode } = params;

  const sideEmoji = side === "BUY" ? "🟢" : "🔴";
  const action = side === "BUY" ? "ACHAT" : "VENTE";
  const typeLabel =
    triggerType === "stop_loss"   ? "⛔ Stop-Loss déclenché" :
    triggerType === "trailing_stop" ? "🔃 Trailing-Stop déclenché" :
    triggerType === "take_profit" ? "✅ Take-Profit déclenché" :
    triggerType === "order"       ? `${sideEmoji} Ordre automatique ${orderMode === "live" ? "(LIVE)" : "(paper)"}` :
    `${sideEmoji} Signal fort détecté (notification)`;

  const smsBody = [
    `${typeLabel} — ${symbol}`,
    `Signal : ${verdict} (score ${score > 0 ? "+" : ""}${score})`,
    `${action} ${quantity} action${Number(quantity) > 1 ? "s" : ""} @ ${price.toFixed(2)} $`,
    `⚠️ Pas un conseil financier.`,
  ].join("\n");

  try {
    const prefs = await resolveDestinations("signalAlert");

    if (prefs.sendSms && prefs.phone) {
      await sendSms({ to: prefs.phone, body: smsBody });
    }

    if (prefs.sendEmail && prefs.email) {
      const sideEmoji = side === "BUY" ? "🟢" : "🔴";
      const tagColor  = side === "BUY" ? "#10b981" : "#ef4444";
      const typeLabel =
        triggerType === "stop_loss"   ? "⛔ Stop-Loss déclenché" :
        triggerType === "trailing_stop" ? "🔃 Trailing-Stop déclenché" :
        triggerType === "take_profit" ? "✅ Take-Profit déclenché" :
        triggerType === "order"       ? `${sideEmoji} Ordre automatique${orderMode === "live" ? " (LIVE)" : " (paper)"}` :
        `${sideEmoji} Signal fort détecté`;
      const htmlBody = `
        <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;">
          <h2 style="color:#111;">${typeLabel} — ${symbol}</h2>
          <p style="font-size:16px;color:#333;">
            Signal : <strong style="color:${tagColor};">${verdict}</strong>
            (score ${score > 0 ? "+" : ""}${score})
          </p>
          <p style="font-size:15px;color:#333;">
            ${side === "BUY" ? "Achat" : "Vente"} de
            <strong>${quantity} action${Number(quantity) > 1 ? "s" : ""}</strong>
            à <strong>${price.toFixed(2)} $</strong>
          </p>
          <p style="font-size:12px;color:#999;margin-top:20px;">
            Envoyé par Soliris Market. ⚠️ Pas un conseil financier.
          </p>
        </div>`;
      await sendEmail({
        to: prefs.email,
        subject: `${typeLabel} — ${symbol}`,
        html: htmlBody,
      });
    }
  } catch (err) {
    logger.error({ err, symbol }, "autoTradeWorker: notification failed");
  }
}

// ── C3 — Surveillance stop-loss / take-profit ─────────────────────────────────
// Appelée à chaque cycle AVANT processRule(). Ignore cooldown et maxTradesPerDay —
// une sortie protectrice ne doit pas être bloquée par des garde-fous d'entrée.
export async function checkProtectiveExits(
  conn: typeof brokerConnectionsTable.$inferSelect | null,
): Promise<void> {
  const allRules = await db.select().from(autoTradeRulesTable)
    .where(eq(autoTradeRulesTable.enabled, true));

  const rulesWithPositions = allRules.filter(r =>
    r.openQuantity && parseFloat(r.openQuantity as string) > 0 &&
    r.openEntryPrice &&
    (r.stopLossPct || r.takeProfitPct || r.trailingStopPct),
  );

  if (rulesWithPositions.length === 0) return;

  const symbols = [...new Set(rulesWithPositions.map(r => r.symbol))];
  let quotesMap: Record<string, { price: number }> = {};
  try {
    const raw = await getQuotes(symbols);
    // getQuotes returns array — build map
    if (Array.isArray(raw)) {
      for (const q of raw as Array<{ symbol?: string; regularMarketPrice?: number }>) {
        if (q.symbol && q.regularMarketPrice) quotesMap[q.symbol] = { price: q.regularMarketPrice };
      }
    } else {
      quotesMap = raw as Record<string, { price: number }>;
    }
  } catch (err) {
    logger.warn({ err }, "autoTradeWorker: getQuotes failed in checkProtectiveExits");
    return;
  }

  for (const rule of rulesWithPositions) {
    const quote = quotesMap[rule.symbol];
    if (!quote?.price) continue;

    const currentPrice = quote.price;
    const entryPrice = parseFloat(rule.openEntryPrice as string);
    const openQty   = parseFloat(rule.openQuantity as string);

    let triggerType: "stop_loss" | "take_profit" | "trailing_stop" | null = null;

    // ── Trailing stop : mettre à jour le plus-haut, vendre si retracement ─────
    let hwm = rule.highWaterMark ? parseFloat(rule.highWaterMark as string) : entryPrice;
    if (rule.trailingStopPct) {
      if (currentPrice > hwm) {
        hwm = currentPrice;
        await db.update(autoTradeRulesTable)
          .set({ highWaterMark: String(hwm), updatedAt: new Date() })
          .where(eq(autoTradeRulesTable.id, rule.id));
      }
      const trailPrice = hwm * (1 - parseFloat(rule.trailingStopPct as string) / 100);
      // Le trailing ne se déclenche que si la position est au moins revenue au-dessus
      // de l'entrée une fois (hwm > entry), sinon le stop-loss fixe fait le travail.
      if (currentPrice <= trailPrice && hwm > entryPrice) triggerType = "trailing_stop";
    }

    if (!triggerType && rule.stopLossPct) {
      const stopPrice = entryPrice * (1 - parseFloat(rule.stopLossPct as string) / 100);
      if (currentPrice <= stopPrice) triggerType = "stop_loss";
    }
    if (!triggerType && rule.takeProfitPct) {
      const targetPrice = entryPrice * (1 + parseFloat(rule.takeProfitPct as string) / 100);
      if (currentPrice >= targetPrice) triggerType = "take_profit";
    }
    if (!triggerType) continue;

    logger.info(
      { ruleId: rule.id, symbol: rule.symbol, triggerType, currentPrice, entryPrice },
      "autoTradeWorker: sortie protectrice déclenchée",
    );

    // Identifiant STABLE par position (pas de Date.now) : si le processus est
    // interrompu après la soumission mais avant l'effacement de l'état, le cycle
    // suivant retombera sur "duplicate" au lieu de vendre une deuxième fois.
    const positionKey = rule.openSince ? new Date(rule.openSince).getTime() : "x";
    const signalId = `auto-${rule.id}-${triggerType}-${positionKey}`;
    const brokerConnection = conn?.status === "connected"
      ? { snaptradeUserId: conn.snaptradeUserId!, snaptradeUserSecret: conn.snaptradeUserSecret! }
      : null;

    let orderId: number | undefined;
    let orderMode: "paper" | "live" = "paper";
    let sellConfirmed = false;
    try {
      const submitExit = (id: string) => submitOrder({
        signalId: id,
        symbol: rule.symbol,
        side: "SELL",
        quantity: openQty,          // sortir la TOTALITÉ de la position
        accountId: rule.accountId ?? undefined,
        expectedPrice: currentPrice,
        source: "auto-signal",
        brokerConnection,
      });

      let result = await submitExit(signalId);

      // En mode live, submitOrder renvoie "duplicate" si le signalId existe déjà.
      // Si cette tentative précédente a ÉCHOUÉ au courtier (status "error"),
      // la position est toujours ouverte : re-soumettre avec un id de reprise unique.
      if (result.status === "duplicate" && (result.order as { status?: string }).status === "error") {
        logger.warn(
          { ruleId: rule.id, symbol: rule.symbol, signalId },
          "autoTradeWorker: tentative de sortie précédente en erreur — nouvelle soumission",
        );
        result = await submitExit(`${signalId}-r${Date.now()}`);
      }

      // Contrat de confirmation : la vente n'est confirmée QUE si l'ordre
      // renvoyé n'est PAS en erreur. submitOrder peut renvoyer "accepted" avec
      // un ordre status "error" (échec de l'appel courtier en mode live) :
      // dans ce cas la position réelle est toujours ouverte, il ne faut JAMAIS
      // effacer l'état de suivi.
      const orderRow = (result.status === "accepted" || result.status === "duplicate")
        ? (result.order as { id?: number; mode?: string; status?: string })
        : null;
      if (orderRow && orderRow.status !== "error") {
        orderId = orderRow.id;
        orderMode = orderRow.mode === "live" ? "live" : "paper";
        sellConfirmed = true;
      } else if (orderRow) {
        logger.warn(
          { ruleId: rule.id, symbol: rule.symbol, orderStatus: orderRow.status },
          "autoTradeWorker: vente protectrice en erreur côté courtier — position conservée, nouvelle tentative au prochain cycle",
        );
      } else {
        const failed = result as { status: string; reason?: string };
        logger.warn(
          { ruleId: rule.id, symbol: rule.symbol, status: failed.status, reason: failed.reason },
          "autoTradeWorker: vente protectrice rejetée — position conservée, nouvelle tentative au prochain cycle",
        );
      }
    } catch (err) {
      logger.error({ err, ruleId: rule.id }, "autoTradeWorker: submitOrder sortie protectrice échoué — position conservée");
    }

    // Ne JAMAIS effacer l'état de la position si la vente n'a pas été confirmée :
    // sinon le suivi SL/TP/trailing s'arrête alors que la position réelle reste ouverte.
    if (!sellConfirmed) continue;

    // Log en base
    const slNote  = rule.stopLossPct   ? `Stop : ${(entryPrice * (1 - parseFloat(rule.stopLossPct as string) / 100)).toFixed(2)} $` : "";
    const tpNote  = rule.takeProfitPct ? `Target : ${(entryPrice * (1 + parseFloat(rule.takeProfitPct as string) / 100)).toFixed(2)} $` : "";
    const trailNote = rule.trailingStopPct ? `Trail : -${rule.trailingStopPct}% depuis ${hwm.toFixed(2)} $` : "";
    const exitVerdict =
      triggerType === "stop_loss"     ? "FORTE VENTE" :
      triggerType === "trailing_stop" ? "PROTECTION GAINS" : "PRISE DE PROFIT";
    await db.insert(autoTradeLogsTable).values({
      ruleId: rule.id,
      symbol: rule.symbol,
      side: "SELL",
      triggerType,
      signalScore: null,
      signalVerdict: exitVerdict,
      price: String(currentPrice),
      quantity: String(openQty),
      orderId: orderId ?? null,
      notificationSent: false,
      notes: [
        `Entrée : ${entryPrice.toFixed(2)} $`,
        triggerType === "stop_loss" ? slNote : triggerType === "trailing_stop" ? trailNote : tpNote,
      ].filter(Boolean).join(" | "),
    });

    // Effacer la position (et le plus-haut du trailing)
    await db.update(autoTradeRulesTable)
      .set({ openEntryPrice: null, openQuantity: null, openSince: null, highWaterMark: null, updatedAt: new Date() })
      .where(eq(autoTradeRulesTable.id, rule.id));

    // Notification SMS
    if (rule.notifyOnSignal) {
      await sendAutoTradeNotification({
        symbol: rule.symbol,
        side: "SELL",
        verdict: exitVerdict,
        score: 0,
        price: currentPrice,
        quantity: openQty,
        triggerType,
        orderMode,
      }).catch((e) => logger.error({ e }, "autoTradeWorker: notification sortie protectrice échouée"));
    }
  }
}

// ── P&L réalisé du jour — appariement des lots (coût moyen) ──────────────────
// Rejoue l'historique chronologique des ordres exécutés pour reconstruire le
// coût moyen par symbole, puis ne comptabilise que le P&L réalisé par les
// ventes effectuées aujourd'hui : (prix de vente − coût moyen) × qté appariée.
// Exportée pure pour être testable sans DB.
export interface PnLOrder {
  symbol: string;
  side: string; // "BUY" | "SELL"
  quantity: string | null;
  filledQuantity: string | null;
  fillPrice: string | null;
  expectedPrice: string | null;
  createdAt: Date;
}

export interface DailyPnLResult {
  realizedPnL: number;
  /** Ventes d'aujourd'hui dont le coût de revient est inconnu (position acquise hors de l'app). */
  unmatchedSells: { symbol: string; quantity: number }[];
}

export function computeRealizedDailyPnL(orders: PnLOrder[], todayStart: Date): DailyPnLResult {
  const positions = new Map<string, { qty: number; avgCost: number }>();
  let realizedPnL = 0; // P&L réalisé des ventes d'aujourd'hui uniquement
  const unmatchedSells: { symbol: string; quantity: number }[] = [];

  for (const o of orders) {
    const price = parseFloat(o.fillPrice ?? o.expectedPrice ?? "0");
    const qty   = parseFloat(o.filledQuantity ?? o.quantity ?? "0");
    if (!isFinite(price) || !isFinite(qty) || price <= 0 || qty <= 0) continue;

    const sym = o.symbol.toUpperCase();
    const pos = positions.get(sym) ?? { qty: 0, avgCost: 0 };

    if (o.side === "BUY") {
      const totalCost = pos.qty * pos.avgCost + qty * price;
      pos.qty += qty;
      pos.avgCost = totalCost / pos.qty;
    } else {
      // Vente : seule la quantité appariée à une entrée connue réalise du P&L.
      const matchedQty = Math.min(qty, pos.qty);
      if (matchedQty > 0 && o.createdAt >= todayStart) {
        realizedPnL += (price - pos.avgCost) * matchedQty;
      }
      if (qty > pos.qty && o.createdAt >= todayStart) {
        // Base de coût inconnue (position externe / historique incomplet) —
        // impossible de calculer le P&L de cette portion : signalée à l'appelant.
        unmatchedSells.push({ symbol: sym, quantity: qty - pos.qty });
      }
      pos.qty = Math.max(0, pos.qty - qty);
      if (pos.qty === 0) pos.avgCost = 0;
    }
    positions.set(sym, pos);
  }
  return { realizedPnL, unmatchedSells };
}

// ── Synchronisation des exécutions live depuis SnapTrade ─────────────────────
// Les ordres live sont enregistrés "submitted" (le courtier a accepté la
// requête) sans donnée de fill. Avant de calculer le P&L réalisé, on interroge
// SnapTrade pour rapprocher chaque ordre submitted de son exécution réelle et
// persister status/fillPrice/filledQuantity. Ainsi le coupe-circuit ne compte
// que des transactions avérées.
export function mapSnaptradeStatus(status: string | null | undefined): string | null {
  switch (status) {
    case "EXECUTED": return "filled";
    case "PARTIAL":
    case "PARTIALLY_EXECUTED": return "partially_filled";
    case "REJECTED":
    case "FAILED": return "rejected";
    case "CANCELED":
    case "PARTIAL_CANCELED":
    case "EXPIRED": return "error";
    default: return null; // PENDING/ACCEPTED/QUEUED... → toujours en attente
  }
}

// Clés d'appariement d'un enregistrement SnapTrade : selon le courtier, l'ID
// persisté à la soumission peut être le `brokerage_order_id` OU l'`id` interne
// SnapTrade. On indexe donc les deux formes pour un rapprochement déterministe.
export function snaptradeRecordKeys(rec: { brokerage_order_id?: string | null; id?: string | null }): string[] {
  const keys: string[] = [];
  if (rec.brokerage_order_id) keys.push(String(rec.brokerage_order_id));
  if (rec.id && String(rec.id) !== String(rec.brokerage_order_id ?? "")) keys.push(String(rec.id));
  return keys;
}

// Fenêtre de requête (en jours) couvrant le plus ancien ordre non résolu,
// avec marge d'1 jour ; SnapTrade plafonne à 90.
export function syncWindowDays(oldestCreatedAt: Date | null, now: Date): number {
  if (!oldestCreatedAt) return 7;
  const age = Math.ceil((now.getTime() - oldestCreatedAt.getTime()) / 86400000) + 1;
  return Math.min(90, Math.max(7, age));
}

export async function syncLiveOrderFills(
  conn: typeof brokerConnectionsTable.$inferSelect,
): Promise<void> {
  if (!conn.snaptradeUserId || !conn.snaptradeUserSecret) return;

  // Tous les ordres live non terminaux : "submitted" (accepté, fill inconnu)
  // et "partially_filled" (fills incrémentaux — à re-synchroniser jusqu'à
  // l'état terminal pour capter la quantité/le prix final).
  const submitted = await db.select().from(ordersTable)
    .where(and(inArray(ordersTable.status, ["submitted", "partially_filled"]), eq(ordersTable.mode, "live")));
  if (submitted.length === 0) return;

  // Garde-fou : un ordre live sans brokerAccountId ou sans snaptradeOrderId ne
  // peut pas être rapproché — signalé bruyamment (ne devrait jamais arriver :
  // l'orderEngine rejette tout ordre live sans accountId avant insertion).
  const unsyncable = submitted.filter((o) => !o.brokerAccountId || !o.snaptradeOrderId);
  if (unsyncable.length > 0) {
    logger.error(
      { orders: unsyncable.map((o) => ({ id: o.id, symbol: o.symbol, hasAccount: !!o.brokerAccountId, hasSnaptradeId: !!o.snaptradeOrderId })) },
      "autoTradeWorker: ordres live non synchronisables (brokerAccountId ou snaptradeOrderId manquant) — exclus du P&L du coupe-circuit",
    );
  }

  const accountIds = [...new Set(submitted.map((o) => o.brokerAccountId).filter((a): a is string => !!a))];
  if (accountIds.length === 0) return;

  const { getSnaptradeClientAsync } = await import("../lib/snaptrade");
  const client = await getSnaptradeClientAsync();

  for (const accountId of accountIds) {
    let records: Awaited<ReturnType<typeof client.accountInformation.getUserAccountOrders>>["data"];
    try {
      const res = await client.accountInformation.getUserAccountOrders({
        userId: conn.snaptradeUserId,
        userSecret: conn.snaptradeUserSecret,
        accountId,
        state: "all",
        days: syncWindowDays(
          submitted.reduce<Date | null>((min, o) => (!min || o.createdAt < min ? o.createdAt : min), null),
          new Date(),
        ),
      });
      records = res.data;
    } catch (err) {
      logger.warn({ err, accountId }, "autoTradeWorker: syncLiveOrderFills — lecture des ordres SnapTrade échouée");
      continue;
    }

    const byBrokerageId = new Map<string, (typeof records extends (infer T)[] | undefined ? T : never)>();
    for (const r of records ?? []) {
      for (const key of snaptradeRecordKeys(r as { brokerage_order_id?: string | null; id?: string | null })) {
        byBrokerageId.set(key, r);
      }
    }

    for (const o of submitted) {
      if (o.brokerAccountId !== accountId || !o.snaptradeOrderId) continue;
      const rec = byBrokerageId.get(o.snaptradeOrderId);
      if (!rec) continue;
      const newStatus = mapSnaptradeStatus(rec.status as string | undefined);
      if (!newStatus) continue;

      await db.update(ordersTable)
        .set({
          status: newStatus,
          fillPrice: rec.execution_price != null ? String(rec.execution_price) : o.fillPrice,
          filledQuantity: rec.filled_quantity != null ? String(rec.filled_quantity) : o.filledQuantity,
        })
        .where(eq(ordersTable.id, o.id));
      logger.info(
        { orderId: o.id, symbol: o.symbol, newStatus, executionPrice: rec.execution_price, filledQuantity: rec.filled_quantity },
        "autoTradeWorker: exécution live synchronisée depuis SnapTrade",
      );
    }
  }
}

// Statuts d'ordre représentant une exécution avérée :
// - "simulated" : ordre paper enregistré avec expectedPrice (jamais "filled")
// - "filled" / "partially_filled" : exécution confirmée avec fillPrice
// "submitted" est volontairement EXCLU : le courtier a seulement accepté la
// requête — l'ordre peut rester non exécuté ou être rejeté/annulé ensuite.
// Compter un submitted fausserait la base de coût et pourrait déclencher (ou
// masquer) le coupe-circuit sur des transactions jamais exécutées.
export const EXECUTED_ORDER_STATUSES = ["filled", "partially_filled", "simulated"] as const;

// ── P&L réalisé du jour — statut partagé (worker + API) ──────────────────────
// Même calcul que le coupe-circuit : rejoue l'historique des ordres exécutés
// du mode courant (appariement des lots, coût moyen) et ne comptabilise que
// les ventes d'aujourd'hui. Utilisé par checkDailyLossCircuitBreaker et par
// la route GET /api/auto-trader/daily-pnl.
export async function getDailyRealizedPnLStatus(options?: {
  /** Connexion courtier — si fournie en mode live, les fills sont d'abord synchronisés. */
  conn?: typeof brokerConnectionsTable.$inferSelect | null;
}): Promise<{ realizedPnL: number; maxDailyLossAmount: number | null; mode: string }> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const mode = getTradingMode();

  // En mode live : rapprocher d'abord les ordres "submitted" de leurs
  // exécutions réelles côté SnapTrade (status/fillPrice/filledQuantity).
  if (mode === "live" && options?.conn) {
    await syncLiveOrderFills(options.conn).catch((err) =>
      logger.warn({ err }, "autoTradeWorker: syncLiveOrderFills échoué — P&L calculé sur les fills déjà confirmés"),
    );
  }

  const [settings] = await db.select().from(appSettingsTable).limit(1);
  const maxLossRaw = settings?.maxDailyLossAmount ? parseFloat(settings.maxDailyLossAmount) : NaN;
  const maxDailyLossAmount = isFinite(maxLossRaw) && maxLossRaw > 0 ? maxLossRaw : null;

  const executedOrders = await db.select().from(ordersTable)
    .where(and(
      inArray(ordersTable.status, [...EXECUTED_ORDER_STATUSES]),
      eq(ordersTable.mode, mode),
    ))
    .orderBy(ordersTable.createdAt, ordersTable.id);

  const { realizedPnL, unmatchedSells } = computeRealizedDailyPnL(executedOrders, todayStart);
  if (unmatchedSells.length > 0) {
    logger.warn(
      { unmatchedSells },
      "autoTradeWorker: ventes du jour sans coût de revient local — leur P&L est exclu du coupe-circuit (position acquise hors de l'app)",
    );
  }
  return { realizedPnL, maxDailyLossAmount, mode };
}

// ── Avertissement de perte journalière (80 % de la limite) ───────────────────
export const DAILY_LOSS_WARNING_RATIO = 0.8;
const DAILY_LOSS_WARNING_ACTION = "daily_loss.warning";

/** Vrai si la perte du jour mérite un avertissement : ≥ 80 % de la limite sans l'avoir dépassée. */
export function shouldWarnDailyLoss(realizedPnL: number, maxLoss: number): boolean {
  const loss = Math.max(0, -realizedPnL);
  return loss >= DAILY_LOSS_WARNING_RATIO * maxLoss && realizedPnL >= -maxLoss;
}

// Clé stable pour le verrou consultatif Postgres (sérialise la réclamation).
const DAILY_LOSS_WARNING_LOCK_KEY = 0x50414c57; // "PALW" — Perte Avertissement Lock Warning

// Envoie l'avertissement une seule fois par jour (UTC). L'anti-doublon est
// persisté dans audit_log (survit aux redémarrages) et rendu ATOMIQUE face aux
// cycles concurrents par un verrou consultatif transactionnel Postgres :
// un seul appelant peut réclamer le créneau du jour ; les autres voient la
// ligne déjà insérée et abandonnent. Si TOUS les envois échouent, la
// réclamation est libérée (ligne supprimée) pour permettre une nouvelle
// tentative au cycle suivant.
export async function maybeNotifyDailyLossWarning(
  loss: number,
  maxLoss: number,
  // Injectable pour les tests — retourne true si au moins un canal a livré.
  notifyFn: (p: { loss: number; maxLoss: number; pct: number }) => Promise<boolean> = notifyDailyLossWarning,
): Promise<void> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const pct = (loss / maxLoss) * 100;

  try {
    // ÉTAPE 1 — Réclamation atomique du créneau du jour.
    const claimedId = await db.transaction(async (tx) => {
      // Le verrou est relâché automatiquement à la fin de la transaction.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${DAILY_LOSS_WARNING_LOCK_KEY})`);

      const [existing] = await tx.select({ id: auditLogTable.id }).from(auditLogTable)
        .where(and(
          eq(auditLogTable.action, DAILY_LOSS_WARNING_ACTION),
          gte(auditLogTable.createdAt, todayStart),
        ))
        .limit(1);
      if (existing) return null; // déjà réclamé (envoyé ou en cours) aujourd'hui

      const [row] = await tx.insert(auditLogTable).values({
        action: DAILY_LOSS_WARNING_ACTION,
        summary: `Avertissement : perte du jour de ${loss.toFixed(2)} $ (${pct.toFixed(0)} % de la limite de ${maxLoss.toFixed(2)} $).`,
        details: { loss, maxLoss, pct },
      }).returning({ id: auditLogTable.id });
      return row.id;
    });
    if (claimedId == null) return;

    // ÉTAPE 2 — Envoi (hors transaction). En cas d'échec total, on libère la
    // réclamation pour qu'un cycle ultérieur puisse re-tenter.
    logger.warn({ loss, maxLoss, pct }, "autoTradeWorker: perte du jour proche de la limite — notification d'avertissement");
    const delivered = await notifyFn({ loss, maxLoss, pct });
    if (!delivered) {
      await db.delete(auditLogTable).where(eq(auditLogTable.id, claimedId));
      logger.warn({ claimedId }, "autoTradeWorker: envoi de l'avertissement échoué — réclamation libérée pour re-tentative");
    }
  } catch (err) {
    logger.error({ err }, "autoTradeWorker: échec de l'avertissement de perte journalière");
  }
}

// ── I2 — Coupe-circuit de perte journalière agrégée ───────────────────────────
// Si la perte réalisée du jour dépasse maxDailyLossAmount, le kill-switch s'active.
export async function checkDailyLossCircuitBreaker(
  conn: typeof brokerConnectionsTable.$inferSelect | null,
): Promise<void> {
  if (!conn || conn.tradingHalted) return; // déjà arrêté

  try {
    const { realizedPnL, maxDailyLossAmount } = await getDailyRealizedPnLStatus({ conn });
    if (maxDailyLossAmount == null) return; // désactivé
    const maxLoss = maxDailyLossAmount;

    // Avertissement proactif : perte ≥ 80 % de la limite (sans la dépasser).
    // Anti-doublon persistant via audit_log : une seule notification par jour
    // (survit aux redémarrages du serveur).
    if (shouldWarnDailyLoss(realizedPnL, maxLoss)) {
      await maybeNotifyDailyLossWarning(Math.max(0, -realizedPnL), maxLoss);
    }

    // pnl négatif = perte nette
    if (realizedPnL < -maxLoss) {
      logger.warn(
        { realizedPnL, maxLoss },
        "autoTradeWorker: perte journalière max atteinte — kill-switch automatique",
      );

      await db.update(brokerConnectionsTable)
        .set({ tradingHalted: true, haltedAt: new Date() })
        .where(eq(brokerConnectionsTable.id, conn.id));

      notifyKillSwitchActivated(
        `Coupe-circuit automatique : perte journalière de ${Math.abs(realizedPnL).toFixed(2)} $ dépasse le seuil de ${maxLoss.toFixed(2)} $.`,
      ).catch((e) => logger.error({ e }, "autoTradeWorker: notification kill-switch circuit breaker échouée"));
    }
  } catch (err) {
    logger.warn({ err }, "autoTradeWorker: checkDailyLossCircuitBreaker failed");
  }
}

// ── Traitement d'une règle active ─────────────────────────────────────────────
export async function processRule(
  rule: typeof autoTradeRulesTable.$inferSelect,
  conn: typeof brokerConnectionsTable.$inferSelect | null,
): Promise<void> {
  const now = new Date();

  // ── Cooldown ────────────────────────────────────────────────────────────────
  if (rule.lastTriggeredAt) {
    const elapsed = now.getTime() - rule.lastTriggeredAt.getTime();
    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    if (elapsed < cooldownMs) return;
  }

  // ── Quota journalier ────────────────────────────────────────────────────────
  const todayReset = isTodayReset(rule.tradesTodayResetAt);
  const tradesToday = todayReset ? rule.tradesToday : 0;
  if (tradesToday >= rule.maxTradesPerDay) {
    logger.info({ ruleId: rule.id, symbol: rule.symbol }, "autoTradeWorker: quota journalier atteint, skip");
    return;
  }

  // ── Calcul des indicateurs ──────────────────────────────────────────────────
  let history: OHLCPoint[];
  try {
    history = await fetchOHLC(rule.symbol);
  } catch (err) {
    logger.warn({ err, symbol: rule.symbol }, "autoTradeWorker: OHLC fetch failed");
    return;
  }
  if (history.length < 55) return;

  const data = computeIndicators(history);
  const currentPrice = history[history.length - 1].close;
  const analysis = analyzeTradingSignals(data, currentPrice);

  await db.update(autoTradeRulesTable)
    .set({ lastSignalScore: analysis.score, lastSignalVerdict: analysis.overall, updatedAt: now })
    .where(eq(autoTradeRulesTable.id, rule.id));

  // ── Vérifier si le score atteint le seuil ──────────────────────────────────
  const absScore = Math.abs(analysis.score);
  if (absScore < rule.minScore) return;

  const isBuySignal  = analysis.score > 0;
  const isSellSignal = analysis.score < 0;
  const modeAllowsBuy  = rule.sideMode === "buy"  || rule.sideMode === "both";
  const modeAllowsSell = rule.sideMode === "sell" || rule.sideMode === "both";
  const shouldBuy  = isBuySignal  && modeAllowsBuy;
  const shouldSell = isSellSignal && modeAllowsSell;
  if (!shouldBuy && !shouldSell) return;

  const side: "BUY" | "SELL" = shouldBuy ? "BUY" : "SELL";

  // ── Confirmation multi-timeframe (hebdomadaire) ────────────────────────────
  // Exige que le signal 1wk pointe dans la même direction avant d'agir.
  if (rule.confirmWeekly) {
    try {
      const weekly = await fetchOHLC(rule.symbol, "1wk", 730);
      if (weekly.length < 55) {
        // Pas assez d'historique pour un signal hebdo fiable : une règle qui EXIGE
        // la confirmation doit refuser le trade, pas le laisser passer.
        logger.info(
          { ruleId: rule.id, symbol: rule.symbol, weeklyBars: weekly.length },
          "autoTradeWorker: données hebdo insuffisantes pour confirmation — skip",
        );
        return;
      }
      const wData = computeIndicators(weekly);
      const wAnalysis = analyzeTradingSignals(wData, weekly[weekly.length - 1].close);
      const confirms = side === "BUY" ? wAnalysis.score > 0 : wAnalysis.score < 0;
      if (!confirms) {
        logger.info(
          { ruleId: rule.id, symbol: rule.symbol, dailyScore: analysis.score, weeklyScore: wAnalysis.score },
          "autoTradeWorker: signal hebdo ne confirme pas — skip",
        );
        return;
      }
    } catch (err) {
      logger.warn({ err, symbol: rule.symbol }, "autoTradeWorker: confirmation hebdo échouée — skip par prudence");
      return;
    }
  }

  // ── Dimensionnement de la position ─────────────────────────────────────────
  // "fixed" : quantité fixe. "risk" : quantité = montant risqué ÷ (prix × SL%).
  let quantity = parseFloat(rule.quantity as string) || 1;
  if (rule.sizingMode === "risk" && rule.riskAmount && rule.stopLossPct && side === "BUY") {
    const riskAmount = parseFloat(rule.riskAmount as string);
    const slPct = parseFloat(rule.stopLossPct as string) / 100;
    if (riskAmount > 0 && slPct > 0 && currentPrice > 0) {
      const riskPerShare = currentPrice * slPct;
      quantity = Math.max(Math.floor((riskAmount / riskPerShare) * 10000) / 10000, 0.0001);
    }
  }

  // ── Passer l'ordre ou juste notifier ───────────────────────────────────────
  const signalId = `auto-${rule.id}-${Date.now()}`;
  let orderId: number | undefined;
  let notificationSent = false;
  let triggerType: "order" | "notification_only" = "notification_only";
  let orderMode: "paper" | "live" = "paper";

  const killSwitchActive = conn?.tradingHalted ?? false;

  if (!killSwitchActive) {
    try {
      const brokerConnection = conn?.status === "connected"
        ? { snaptradeUserId: conn.snaptradeUserId!, snaptradeUserSecret: conn.snaptradeUserSecret! }
        : null;

      const result = await submitOrder({
        signalId,
        symbol: rule.symbol,
        side,
        quantity,
        accountId: rule.accountId ?? undefined,
        expectedPrice: currentPrice,
        source: "auto-signal",
        brokerConnection,
      });

      if (result.status === "accepted") {
        orderId = (result.order as { id?: number }).id;
        triggerType = "order";
        orderMode = (result.order as { mode?: string }).mode === "live" ? "live" : "paper";
        logger.info({ ruleId: rule.id, symbol: rule.symbol, side, quantity, orderId }, "autoTradeWorker: ordre auto exécuté");

        // ── Mise à jour de la position ouverte ──────────────────────────────
        if (side === "BUY") {
          const prevQty   = rule.openQuantity   ? parseFloat(rule.openQuantity as string)   : 0;
          const prevEntry = rule.openEntryPrice ? parseFloat(rule.openEntryPrice as string) : 0;
          const newQty    = prevQty + quantity;
          const newEntry  = prevQty === 0
            ? currentPrice
            : (prevQty * prevEntry + quantity * currentPrice) / newQty;

          await db.update(autoTradeRulesTable)
            .set({
              openEntryPrice: String(newEntry),
              openQuantity:   String(newQty),
              openSince:      rule.openSince ?? now,
              // Initialiser le plus-haut au prix d'entrée pour le trailing stop
              highWaterMark:  prevQty === 0 ? String(currentPrice) : rule.highWaterMark,
              updatedAt:      now,
            })
            .where(eq(autoTradeRulesTable.id, rule.id));
          // mise à jour locale pour le reste de la fonction
          (rule as typeof rule & { openQuantity: string; openEntryPrice: string }).openQuantity = String(newQty);
          (rule as typeof rule & { openEntryPrice: string }).openEntryPrice = String(newEntry);
        } else if (side === "SELL") {
          const prevQty = rule.openQuantity ? parseFloat(rule.openQuantity as string) : 0;
          const newQty  = Math.max(0, prevQty - quantity);
          await db.update(autoTradeRulesTable)
            .set({
              openQuantity:   newQty > 0 ? String(newQty) : null,
              openEntryPrice: newQty > 0 ? rule.openEntryPrice : null,
              openSince:      newQty > 0 ? rule.openSince : null,
              highWaterMark:  newQty > 0 ? rule.highWaterMark : null,
              updatedAt:      now,
            })
            .where(eq(autoTradeRulesTable.id, rule.id));
        }
      } else if (result.status === "duplicate") {
        logger.info({ ruleId: rule.id, symbol: rule.symbol }, "autoTradeWorker: ordre dupliqué, skip");
        return;
      } else {
        logger.warn({ ruleId: rule.id, symbol: rule.symbol, reason: (result as { reason?: string }).reason ?? "inconnu" }, "autoTradeWorker: ordre rejeté par garde-fous");
      }
    } catch (err) {
      logger.error({ err, ruleId: rule.id, symbol: rule.symbol }, "autoTradeWorker: erreur lors de la soumission de l'ordre");
    }
  }

  // ── Notification ─────────────────────────────────────────────────────────────
  if (rule.notifyOnSignal) {
    await sendAutoTradeNotification({ symbol: rule.symbol, side, verdict: analysis.overall, score: analysis.score, price: currentPrice, quantity, triggerType, orderMode });
    notificationSent = true;
  }

  // ── Log en base ──────────────────────────────────────────────────────────────
  await db.insert(autoTradeLogsTable).values({
    ruleId: rule.id,
    symbol: rule.symbol,
    side,
    triggerType,
    signalScore: analysis.score,
    signalVerdict: analysis.overall,
    price: String(currentPrice),
    quantity: String(quantity),
    orderId: orderId ?? null,
    notificationSent,
    notes: analysis.signals.filter(s => s.verdict !== "neutral").slice(0, 3).map(s => `${s.name}: ${s.value}`).join(", "),
  });

  // ── Mettre à jour la règle ───────────────────────────────────────────────────
  const newTradesToday = triggerType === "order" ? tradesToday + 1 : tradesToday;
  await db.update(autoTradeRulesTable)
    .set({
      lastTriggeredAt:    now,
      tradesToday:        newTradesToday,
      tradesTodayResetAt: todayReset ? rule.tradesTodayResetAt : now,
      updatedAt:          now,
    })
    .where(eq(autoTradeRulesTable.id, rule.id));
}

export async function runAutoTradeCheck(): Promise<void> {
  const [rules, conn] = await Promise.all([
    db.select().from(autoTradeRulesTable).where(eq(autoTradeRulesTable.enabled, true)),
    resolveConnection(),
  ]);

  // 1. Sorties protectrices (SL/TP/trailing) — toujours vérifiées en premier,
  // ignorent cooldown/quota. Exécutées avant le coupe-circuit pour que les
  // pertes réalisées par ces sorties soient comptées dans le même cycle.
  await checkProtectiveExits(conn).catch((err) =>
    logger.error({ err }, "autoTradeWorker: checkProtectiveExits échoué"),
  );

  // 2. Coupe-circuit de perte journalière — évalué à chaque cycle, même sans
  // règle active : des pertes peuvent provenir d'ordres manuels, de règles
  // désactivées entre-temps ou des sorties protectrices ci-dessus.
  await checkDailyLossCircuitBreaker(conn).catch((err) =>
    logger.error({ err }, "autoTradeWorker: checkDailyLossCircuitBreaker échoué"),
  );

  if (rules.length === 0) return;

  logger.info({ count: rules.length }, "autoTradeWorker: cycle démarré");

  // 3. Évaluation des règles actives
  for (const rule of rules) {
    try {
      await processRule(rule, conn);
    } catch (err) {
      logger.error({ err, ruleId: rule.id, symbol: rule.symbol }, "autoTradeWorker: erreur inattendue sur la règle");
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startAutoTradeWorker(intervalMs = WORKER_INTERVAL_MS): void {
  if (intervalHandle) return;
  logger.info({ intervalMs }, "autoTradeWorker: démarré");

  setTimeout(() => {
    void runAutoTradeCheck().catch((err) => logger.error({ err }, "autoTradeWorker: cycle initial échoué"));
  }, 30_000);

  intervalHandle = setInterval(() => {
    void runAutoTradeCheck().catch((err) => logger.error({ err }, "autoTradeWorker: cycle échoué"));
  }, intervalMs);
}

export function stopAutoTradeWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
