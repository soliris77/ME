/**
 * Auto-Trade Worker — Moteur d'automatisation du trading
 * ─────────────────────────────────────────────────────────────────────────────
 * Toutes les 60 secondes :
 *   1. réconciliation des protections côté courtier
 *   2. checkDailyLossCircuitBreaker() — coupe-circuit de perte journalière
 *   3. processRule() — évalue chaque règle active (signal → ordre ou notif)
 */
import { db, autoTradeRulesTable, autoTradeLogsTable, brokerConnectionsTable, ordersTable, appSettingsTable, auditLogTable, autoTradeCopyBindingsTable } from "@workspace/db";
import { eq, and, gte, sql, inArray } from "drizzle-orm";
import { yahooFinance, getQuotes } from "../lib/yahoo";
import { computeIndicators, analyzeTradingSignals } from "@workspace/indicators";
import type { OHLCPoint } from "../lib/patternDetect";
import { submitOrder } from "../lib/orderEngine";
import { sendSms } from "../lib/smsClient";
import { sendEmail } from "../lib/emailClient";
import { resolveDestinations } from "../lib/notificationPrefs";
import { logger } from "../lib/logger";
import { getTradingMode } from "../lib/tradingMode";
import { notifyKillSwitchActivated, notifyDailyLossWarning } from "../lib/notifications";
import { getAiSecondOpinion, type AiReviewResult } from "../lib/aiReview";
import { isMarketOpen } from "../lib/risk";
import { computeClosureWarnings } from "../routes/market";
import { resolveBrokerAdapter } from "../lib/brokerAdapter";
import type { OrderResult } from "@workspace/broker";
import { protectiveOrderService } from "../lib/protectiveOrders";

const WORKER_INTERVAL_MS = 60_000;

export interface ClosureContext {
  /** La bourse du symbole est-elle ouverte en ce moment ? */
  open: boolean;
  /** Message d'isMarketOpen (raison de la fermeture) quand open === false. */
  closedMessage: string | null;
  /** Note lisible sur une fermeture imminente (demi-journée / férié), sinon null. */
  closureNote: string | null;
}
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
  /** Note de fermeture imminente (demi-journée / férié) à inclure dans le message. */
  closureNote?: string | null;
}) {
  const { symbol, side, verdict, score, price, quantity, triggerType, orderMode, closureNote } = params;

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
    ...(closureNote ? [`⏰ ${closureNote}`] : []),
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
          ${closureNote ? `<p style="font-size:14px;color:#b45309;">⏰ ${closureNote}</p>` : ""}
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
    case "EXPIRED": return "cancelled";
    default: return null; // PENDING/ACCEPTED/QUEUED... → toujours en attente
  }
}

// Clés d'appariement d'un enregistrement SnapTrade : selon le courtier, l'ID
// persisté à la soumission peut être le `brokerage_order_id` OU l'`id` interne
// SnapTrade. On indexe donc les deux formes pour un rapprochement déterministe.
export function brokerOrderRecordKeys(rec: { brokerage_order_id?: string | null; id?: string | null }): string[] {
  const keys: string[] = [];
  if (rec.brokerage_order_id) keys.push(String(rec.brokerage_order_id));
  if (rec.id && String(rec.id) !== String(rec.brokerage_order_id ?? "")) keys.push(String(rec.id));
  return keys;
}

/** @deprecated Compatibility alias for callers that used the old provider name. */
export const snaptradeRecordKeys = brokerOrderRecordKeys;

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

  for (const accountId of accountIds) {
    let records: OrderResult[];
    try {
      records = await resolveBrokerAdapter({
        snaptradeUserId: conn.snaptradeUserId,
        snaptradeUserSecret: conn.snaptradeUserSecret,
      }).listOrders(accountId, {
        days: syncWindowDays(
          submitted.reduce<Date | null>((min, o) => (!min || o.createdAt < min ? o.createdAt : min), null),
          new Date(),
        ),
      });
    } catch (err) {
      logger.warn({ err, accountId }, "autoTradeWorker: syncLiveOrderFills — lecture des ordres SnapTrade échouée");
      continue;
    }

    const byBrokerageId = new Map<string, (typeof records)[number]>();
    for (const r of records ?? []) {
      const raw = r.raw as { brokerage_order_id?: string | null; id?: string | null } | undefined;
      for (const key of [r.brokerOrderId, ...brokerOrderRecordKeys(raw ?? {})]) {
        if (!key) continue;
        byBrokerageId.set(key, r);
      }
    }

    for (const o of submitted) {
      if (o.brokerAccountId !== accountId || !o.snaptradeOrderId) continue;
      const rec = byBrokerageId.get(o.snaptradeOrderId);
      if (!rec) continue;
      const newStatus = ["filled", "partially_filled", "rejected", "cancelled"].includes(rec.status)
        ? rec.status
        : null;
      if (!newStatus) continue;

      await db.update(ordersTable)
        .set({
          status: newStatus,
          fillPrice: rec.averagePrice != null ? String(rec.averagePrice) : o.fillPrice,
          filledQuantity: rec.filledQuantity != null ? String(rec.filledQuantity) : o.filledQuantity,
        })
        .where(eq(ordersTable.id, o.id));
      if ((newStatus === "filled" || newStatus === "partially_filled") && o.side === "BUY" && o.brokerAccountId) {
        const rule = (await db.select().from(autoTradeRulesTable)
          .where(eq(autoTradeRulesTable.symbol, o.symbol))).find((r) => r.accountId === o.brokerAccountId);
        if (rule) {
          try {
            await protectiveOrderService.protectFilledEntry({
              accountId: o.brokerAccountId, symbol: o.symbol, parentOrderId: String(o.id),
              quantity: Number(rec.filledQuantity ?? o.filledQuantity ?? o.quantity),
              entryPrice: Number(rec.averagePrice ?? o.fillPrice ?? o.expectedPrice),
              stopLossPct: rule.stopLossPct ? Number(rule.stopLossPct) : null,
              takeProfitPct: rule.takeProfitPct ? Number(rule.takeProfitPct) : null,
              adapter: resolveBrokerAdapter({ snaptradeUserId: conn.snaptradeUserId, snaptradeUserSecret: conn.snaptradeUserSecret }),
            });
          } catch (error) {
            logger.error({ error, orderId: o.id }, "autoTradeWorker: failed to install broker protection");
          }
        }
      }
      logger.info(
        { orderId: o.id, symbol: o.symbol, newStatus, executionPrice: rec.averagePrice, filledQuantity: rec.filledQuantity },
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
    // Un notifyFn qui LÈVE (panne réseau/fournisseur) est un échec d'envoi comme
    // un autre : on libère la réclamation, sinon plus aucune re-tentative du jour.
    let delivered = false;
    try {
      delivered = await notifyFn({ loss, maxLoss, pct });
    } catch (sendErr) {
      logger.warn({ err: sendErr }, "autoTradeWorker: exception lors de l'envoi de l'avertissement de perte");
    }
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

// ── Garde-fous d'ENTRÉE au niveau de la règle (partagés) ──────────────────────
// Cooldown + quota journalier. Utilisés à l'identique par les signaux techniques
// (processRule) ET les signaux copy-trading (processCopySignal) : une source de
// signal ne doit JAMAIS contourner ces garde-fous propres à la règle.
export type RuleEntryCheck =
  | { ok: true; todayReset: boolean; tradesToday: number }
  | { ok: false; reason: "cooldown" | "daily_quota" };

export function checkRuleEntryGuardrails(
  rule: typeof autoTradeRulesTable.$inferSelect,
  now: Date,
): RuleEntryCheck {
  // Cooldown minimum entre deux ordres auto.
  if (rule.lastTriggeredAt) {
    const elapsed = now.getTime() - rule.lastTriggeredAt.getTime();
    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    if (elapsed < cooldownMs) return { ok: false, reason: "cooldown" };
  }

  // Quota journalier (réinitialisé à minuit UTC).
  const todayReset = isTodayReset(rule.tradesTodayResetAt);
  const tradesToday = todayReset ? rule.tradesToday : 0;
  if (tradesToday >= rule.maxTradesPerDay) return { ok: false, reason: "daily_quota" };

  return { ok: true, todayReset, tradesToday };
}

// ── Dimensionnement de la position au niveau de la règle (partagé) ────────────
// "fixed" : quantité fixe. "risk" : quantité = montant risqué ÷ (prix × SL%).
// Le mode "risk" ne s'applique qu'aux ACHATS (dimensionnement d'entrée) et
// requiert un prix courant fiable + un stop-loss configuré ; sinon repli sur la
// quantité fixe. Pur (testable) et identique pour les deux sources de signal.
export function computeRuleQuantity(
  rule: typeof autoTradeRulesTable.$inferSelect,
  currentPrice: number,
  side: "BUY" | "SELL",
): number {
  let quantity = parseFloat(rule.quantity as string) || 1;
  if (rule.sizingMode === "risk" && rule.riskAmount && rule.stopLossPct && side === "BUY") {
    const riskAmount = parseFloat(rule.riskAmount as string);
    const slPct = parseFloat(rule.stopLossPct as string) / 100;
    if (riskAmount > 0 && slPct > 0 && currentPrice > 0) {
      const riskPerShare = currentPrice * slPct;
      quantity = Math.max(Math.floor((riskAmount / riskPerShare) * 10000) / 10000, 0.0001);
    }
  }
  return quantity;
}

// Classe un log d'auto-trade en résultat pour le réviseur local :
// - "loss"    : stop-loss touché, OU ordre non passé (rejeté/bloqué/erreur/échec)
// - "win"     : take-profit atteint
// - "neutral" : autre (ordre passé sans issue connue, trailing-stop, notif…)
export function classifyOutcome(l: typeof autoTradeLogsTable.$inferSelect): "win" | "loss" | "neutral" {
  if (l.triggerType === "stop_loss") return "loss";
  if (l.triggerType === "take_profit") return "win";
  // Ordres non exécutés / bloqués : détectés via le verdict IA ou les notes.
  if (l.aiVerdict === "block") return "loss";
  const notes = (l.notes ?? "").toLowerCase();
  if (/(rejet|bloqu|erreur|échec|echec)/.test(notes)) return "loss";
  return "neutral";
}

// ── Second avis IA (hook partagé) ─────────────────────────────────────────────
// Appelé juste avant submitOrder par les DEUX chemins de soumission (signaux
// techniques et copy-trading). Une règle sans second avis retourne null. Quand
// le second avis est activé, toute erreur interne produit un verdict de blocage
// afin qu'un garde-fou indisponible n'autorise jamais silencieusement un ordre.
export async function runAiSecondOpinion(params: {
  rule: typeof autoTradeRulesTable.$inferSelect;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  changePercent?: number | null;
  signalScore?: number | null;
  signalVerdict?: string | null;
  source?: "technical" | "copy";
}): Promise<AiReviewResult | null> {
  const { rule, side, quantity, price, changePercent, signalScore, signalVerdict, source } = params;
  if (!rule.aiReview) return null;

  let recentOutcomes: string[] = [];
  let recentTradeOutcomes: ("win" | "loss" | "neutral")[] = [];
  try {
    const recent = await db.select().from(autoTradeLogsTable)
      .where(eq(autoTradeLogsTable.ruleId, rule.id))
      .orderBy(sql`created_at DESC`)
      .limit(5);
    recentOutcomes = recent.map((l) => {
      const parts = [
        l.side,
        l.triggerType,
        l.signalVerdict ? `signal ${l.signalVerdict}` : null,
        l.signalScore != null ? `score ${l.signalScore}` : null,
        l.price != null ? `@ ${l.price}` : null,
      ].filter(Boolean);
      return parts.join(" ");
    });
    // Classification structurée (du plus récent au plus ancien) pour le réviseur
    // local : perte = stop-loss touché OU ordre rejeté/bloqué/en erreur ;
    // gain = take-profit ; sinon neutre.
    recentTradeOutcomes = recent.map((l) => classifyOutcome(l));
  } catch (err) {
    // Contexte historique optionnel : une lecture échouée ne doit pas empêcher l'avis.
    logger.warn({ err, ruleId: rule.id }, "aiReview: lecture des logs récents échouée — avis sans historique");
  }

  try {
    return await getAiSecondOpinion({
      symbol: rule.symbol,
      side,
      quantity,
      price,
      changePercent: changePercent ?? null,
      signalScore: signalScore ?? null,
      signalVerdict: signalVerdict ?? null,
      ruleName: rule.name ?? null,
      sideMode: rule.sideMode ?? null,
      minScore: rule.minScore ?? null,
      recentOutcomes,
      recentTradeOutcomes,
      source,
    });
  } catch (err) {
    logger.error({ err, ruleId: rule.id }, "aiReview: exception inattendue — ordre bloqué par sécurité");
    return {
      verdict: "block",
      reason: "Le second avis n'a pas pu être vérifié. Ordre bloqué par sécurité.",
    };
  }
}

// ── Traitement d'une règle active ─────────────────────────────────────────────
export async function processRule(
  rule: typeof autoTradeRulesTable.$inferSelect,
  conn: typeof brokerConnectionsTable.$inferSelect | null,
): Promise<void> {
  const now = new Date();

  // ── Garde-fous d'entrée (cooldown + quota) — partagés avec le copy-trading ──
  const entry = checkRuleEntryGuardrails(rule, now);
  if (!entry.ok) {
    if (entry.reason === "daily_quota") {
      logger.info({ ruleId: rule.id, symbol: rule.symbol }, "autoTradeWorker: quota journalier atteint, skip");
    }
    return;
  }
  const { todayReset, tradesToday } = entry;

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

  // ── Calendrier boursier : différer si la bourse du symbole est fermée ──────
  // Un SMS « agir maintenant » quand la bourse est fermée (soirée, week-end,
  // férié, après 13h00 un jour de demi-séance) est trompeur : aucune action
  // n'est possible. On journalise le signal comme DIFFÉRÉ, sans ordre ni SMS ;
  // le cooldown/quota ne sont pas consommés — le signal sera réévalué à la
  // réouverture s'il tient toujours.
  const closure = getClosureContext(rule.symbol, now);
  if (!closure.open) {
    logger.info(
      { ruleId: rule.id, symbol: rule.symbol, side, score: analysis.score, closedMessage: closure.closedMessage },
      "autoTradeWorker: signal différé — bourse fermée",
    );
    await db.insert(autoTradeLogsTable).values({
      ruleId: rule.id,
      symbol: rule.symbol,
      side,
      triggerType: "notification_only",
      signalScore: analysis.score,
      signalVerdict: analysis.overall,
      price: String(currentPrice),
      quantity: null,
      orderId: null,
      notificationSent: false,
      notes: `Signal différé : bourse fermée — ${closure.closedMessage ?? "marché fermé"}`,
    }).catch((err) => logger.error({ err, ruleId: rule.id }, "autoTradeWorker: insertion du log (signal différé) échouée"));
    return;
  }

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

  // ── Dimensionnement de la position (politique partagée) ────────────────────
  const quantity = computeRuleQuantity(rule, currentPrice, side);

  // ── Passer l'ordre ou juste notifier ───────────────────────────────────────
  const signalId = `auto-${rule.id}-${Date.now()}`;
  let orderId: number | undefined;
  let notificationSent = false;
  let triggerType: "order" | "notification_only" = "notification_only";
  let orderMode: "paper" | "live" = "paper";

  const killSwitchActive = conn?.tradingHalted ?? false;

  // ── Second avis IA (opt-in) — juste avant la soumission ────────────────────
  let aiVerdict: string | null = null;
  let aiReason: string | null = null;
  let aiBlocked = false;
  if (!killSwitchActive && rule.aiReview) {
    const opinion = await runAiSecondOpinion({
      rule, side, quantity, price: currentPrice,
      changePercent: null,
      signalScore: analysis.score, signalVerdict: analysis.overall,
      source: "technical",
    });
    // Le réviseur (local ou OpenAI) rend toujours un avis ; null n'arrive que
    // sur exception totalement inattendue → fail-open (l'ordre passe, aiVerdict null).
    if (opinion) {
      aiVerdict = opinion.verdict;
      aiReason = opinion.reason;
      if (opinion.verdict === "block") {
        aiBlocked = true;
        logger.info({ ruleId: rule.id, symbol: rule.symbol, side, reason: opinion.reason }, "autoTradeWorker: ordre bloqué par le second avis");
      }
    }
  }

  // ── Décision de BLOCAGE IA : persistance dédiée et DURABLE ──────────────────
  // Un trade bloqué par l'IA DOIT laisser une trace, même si l'insert échoue.
  // On journalise ici (try/catch propre) puis on sort — pas de soumission, pas
  // d'incrément de quota. En cas d'échec d'insertion : ce n'est PAS un skip
  // normal → console.error haute-sévérité distincte pour qu'il ne passe jamais
  // inaperçu.
  if (aiBlocked) {
    const baseNotesBlocked = analysis.signals.filter(s => s.verdict !== "neutral").slice(0, 3).map(s => `${s.name}: ${s.value}`).join(", ");
    try {
      await db.insert(autoTradeLogsTable).values({
        ruleId: rule.id,
        symbol: rule.symbol,
        side,
        triggerType: "notification_only",
        signalScore: analysis.score,
        signalVerdict: analysis.overall,
        price: String(currentPrice),
        quantity: String(quantity),
        orderId: null,
        notificationSent: false,
        notes: `Ordre bloqué par le second avis IA : ${aiReason}${baseNotesBlocked ? ` | ${baseNotesBlocked}` : ""}`,
        aiVerdict,
        aiReason,
      });
    } catch (err) {
      // Perte de la trace d'un BLOCAGE — anomalie grave, pas un simple skip.
      console.error(
        "[autoTradeWorker] ALERTE: échec de l'enregistrement d'un BLOCAGE IA — décision non tracée en base",
        { ruleId: rule.id, symbol: rule.symbol, side, aiVerdict, aiReason, err: String(err) },
      );
    }
    return;
  }

  if (!killSwitchActive && !aiBlocked) {
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
    await sendAutoTradeNotification({ symbol: rule.symbol, side, verdict: analysis.overall, score: analysis.score, price: currentPrice, quantity, triggerType, orderMode, closureNote: closure.closureNote });
    notificationSent = true;
  }

  // ── Log en base ──────────────────────────────────────────────────────────────
  const baseNotes = analysis.signals.filter(s => s.verdict !== "neutral").slice(0, 3).map(s => `${s.name}: ${s.value}`).join(", ");
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
    notes: [
      baseNotes,
      closure.closureNote ? `⏰ ${closure.closureNote}` : "",
    ].filter(Boolean).join(" | "),
    aiVerdict,
    aiReason,
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

// ── Pont copy-trading → auto-trader ───────────────────────────────────────────
// Signal normalisé émis par le sync copy-trading (metatrader/sync.ts) lorsqu'un
// NOUVEAU trade copié est détecté chez un trader suivi.
export interface CopySignalEvent {
  followedTraderId: number;
  externalTradeId: string;
  symbol: string;
  side: "buy" | "sell";
  openedAt: Date | null;
  source: "copy-trading";
}

/**
 * Traite un signal copy-trading : cherche les liaisons ACTIVES pour ce trader
 * suivi, jointes aux règles d'auto-trading ACTIVES dont le symbole correspond
 * EXACTEMENT à celui du trade. Pour chaque correspondance, soumet un ordre via
 * le MÊME pipeline de risque que les signaux techniques (submitOrder du moteur
 * central : kill-switch, idempotence, garde-fous de risque, heures de marché,
 * tailles max, fail-closed live).
 *
 * ⚠️  Aucune évaluation de score technique ici — le signal EST la copie du trade.
 *
 * Idempotence : signalId = copy-${followedTraderId}-${externalTradeId}-${ruleId}
 * (l'idempotence par signalId de submitOrder empêche le double passage même si
 * le sync ré-émet le même trade).
 *
 * Fail closed : sans connexion courtier connectée (ou en mode live sans
 * prérequis), submitOrder refuse et rien n'est placé — on journalise le rejet.
 */
export async function processCopySignal(event: CopySignalEvent): Promise<void> {
  const { followedTraderId, externalTradeId, symbol, side } = event;

  // Liaisons actives pour ce trader, jointes aux règles actives correspondant
  // EXACTEMENT au symbole du trade copié.
  let matches: {
    rule: typeof autoTradeRulesTable.$inferSelect;
    bindingId: number;
  }[];
  try {
    const rows = await db
      .select({ rule: autoTradeRulesTable, bindingId: autoTradeCopyBindingsTable.id })
      .from(autoTradeCopyBindingsTable)
      .innerJoin(
        autoTradeRulesTable,
        eq(autoTradeCopyBindingsTable.ruleId, autoTradeRulesTable.id),
      )
      .where(
        and(
          eq(autoTradeCopyBindingsTable.followedTraderId, followedTraderId),
          eq(autoTradeCopyBindingsTable.enabled, true),
          eq(autoTradeRulesTable.enabled, true),
          eq(autoTradeRulesTable.symbol, symbol.toUpperCase()),
        ),
      );
    matches = rows.map((r) => ({ rule: r.rule, bindingId: r.bindingId }));
  } catch (err) {
    logger.error({ err, followedTraderId, symbol }, "copySignal: lookup des liaisons échoué");
    return;
  }

  if (matches.length === 0) {
    logger.debug({ followedTraderId, symbol }, "copySignal: aucune liaison active correspondante — ignoré");
    return;
  }

  const orderSide: "BUY" | "SELL" = side === "buy" ? "BUY" : "SELL";

  // Connexion courtier (comme processRule). Fail closed : pas de connexion
  // connectée → submitOrder refusera l'ordre live (aucun placement).
  const conn = await resolveConnection();
  const now = new Date();

  // Cotation courante du symbole — nécessaire au dimensionnement "risk". On la
  // récupère une seule fois. getQuotes n'échoue jamais (il avale les erreurs
  // Yahoo) : une cotation ABSENTE est traitée comme un fail-closed pour toute
  // règle dont la taille dépend du prix (cf. .agents/memory/quotes-fail-closed.md).
  let currentPrice: number | null = null;
  try {
    const quotes = await getQuotes([symbol.toUpperCase()]);
    const q = quotes.find((x) => x.symbol?.toUpperCase() === symbol.toUpperCase());
    if (q && Number.isFinite(q.price) && q.price > 0) currentPrice = q.price;
  } catch (err) {
    logger.warn({ err, symbol }, "copySignal: getQuotes échoué — cotation absente");
  }

  for (const { rule } of matches) {
    // ── Respect de la direction configurée sur la règle ──────────────────────
    const modeAllowsBuy = rule.sideMode === "buy" || rule.sideMode === "both";
    const modeAllowsSell = rule.sideMode === "sell" || rule.sideMode === "both";
    if ((orderSide === "BUY" && !modeAllowsBuy) || (orderSide === "SELL" && !modeAllowsSell)) {
      logger.info(
        { ruleId: rule.id, symbol: rule.symbol, orderSide, sideMode: rule.sideMode },
        "copySignal: direction du trade non autorisée par la règle — ignoré",
      );
      continue;
    }

    // Idempotence : un même trade copié ne déclenche qu'un seul ordre par règle.
    const signalId = `copy-${followedTraderId}-${externalTradeId}-${rule.id}`;

    // ── Garde-fous d'ENTRÉE de la règle (cooldown + quota) — mêmes que technique
    // Une source copy-trading ne doit JAMAIS contourner ces limites.
    const entry = checkRuleEntryGuardrails(rule, now);
    if (!entry.ok) {
      logger.info(
        { ruleId: rule.id, symbol: rule.symbol, reason: entry.reason, signalId },
        "copySignal: garde-fou d'entrée de la règle — ignoré",
      );
      await db.insert(autoTradeLogsTable).values({
        ruleId: rule.id,
        symbol: rule.symbol,
        side: orderSide,
        triggerType: "notification_only",
        signalScore: null,
        signalVerdict: "COPY-TRADING",
        price: currentPrice != null ? String(currentPrice) : null,
        quantity: null,
        orderId: null,
        notificationSent: false,
        notes: `Signal copy-trading bloqué (${entry.reason === "cooldown" ? "cooldown" : "quota journalier"})`,
        source: "copy-trading",
        followedTraderId,
        externalTradeId,
      }).catch((err) => logger.error({ err, ruleId: rule.id }, "copySignal: insertion du log (garde-fou) échouée"));
      continue;
    }
    const { todayReset, tradesToday } = entry;

    // ── Dimensionnement de la position (politique partagée avec processRule) ──
    // Fail closed : si le mode "risk" est requis (BUY + riskAmount + SL) mais la
    // cotation est absente, on NE dimensionne PAS sur rule.quantity (risque non
    // borné) — on refuse ce déclenchement.
    const needsPriceForSizing =
      rule.sizingMode === "risk" && !!rule.riskAmount && !!rule.stopLossPct && orderSide === "BUY";
    if (needsPriceForSizing && currentPrice == null) {
      logger.warn(
        { ruleId: rule.id, symbol: rule.symbol, signalId },
        "copySignal: dimensionnement 'risk' impossible sans cotation — rejet (fail closed)",
      );
      await db.insert(autoTradeLogsTable).values({
        ruleId: rule.id,
        symbol: rule.symbol,
        side: orderSide,
        triggerType: "notification_only",
        signalScore: null,
        signalVerdict: "COPY-TRADING",
        price: null,
        quantity: null,
        orderId: null,
        notificationSent: false,
        notes: "Signal copy-trading rejeté : cotation absente pour dimensionnement 'risk' (fail closed)",
        source: "copy-trading",
        followedTraderId,
        externalTradeId,
      }).catch((err) => logger.error({ err, ruleId: rule.id }, "copySignal: insertion du log (sizing) échouée"));
      continue;
    }
    const quantity = computeRuleQuantity(rule, currentPrice ?? 0, orderSide);

    const brokerConnection = conn?.status === "connected"
      ? { snaptradeUserId: conn.snaptradeUserId!, snaptradeUserSecret: conn.snaptradeUserSecret! }
      : null;

    let orderId: number | undefined;
    let triggerType: "order" | "notification_only" = "notification_only";
    let orderStatus: string | null = null;
    let rejectReason: string | null = null;

    // ── Second avis IA (opt-in) — juste avant la soumission ──────────────────
    let aiVerdict: string | null = null;
    let aiReason: string | null = null;
    if (rule.aiReview) {
      const opinion = await runAiSecondOpinion({
        rule, side: orderSide, quantity, price: currentPrice ?? 0,
        signalScore: null, signalVerdict: "COPY-TRADING",
        source: "copy",
      });
      // Un avis est toujours rendu (local ou OpenAI) ; null = exception
      // inattendue → fail-open (l'ordre passe, aiVerdict null).
      if (opinion) {
        aiVerdict = opinion.verdict;
        aiReason = opinion.reason;
      }
    }

    if (aiVerdict === "block") {
      // Trade refusé par l'IA : aucun ordre soumis, on journalise et on continue.
      // Persistance dédiée et DURABLE : un blocage DOIT laisser une trace.
      logger.info({ ruleId: rule.id, symbol: rule.symbol, signalId, reason: aiReason }, "copySignal: ordre bloqué par le second avis IA");
      try {
        await db.insert(autoTradeLogsTable).values({
          ruleId: rule.id,
          symbol: rule.symbol,
          side: orderSide,
          triggerType: "notification_only",
          signalScore: null,
          signalVerdict: "COPY-TRADING",
          price: currentPrice != null ? String(currentPrice) : null,
          quantity: String(quantity),
          orderId: null,
          notificationSent: false,
          notes: `Signal copy-trading bloqué par le second avis IA : ${aiReason}`,
          source: "copy-trading",
          followedTraderId,
          externalTradeId,
          aiVerdict,
          aiReason,
        });
      } catch (err) {
        // Perte de la trace d'un BLOCAGE — anomalie grave, pas un simple skip.
        console.error(
          "[copySignal] ALERTE: échec de l'enregistrement d'un BLOCAGE IA — décision non tracée en base",
          { ruleId: rule.id, symbol: rule.symbol, signalId, aiVerdict, aiReason, err: String(err) },
        );
      }
      continue;
    }

    try {
      const result = await submitOrder({
        signalId,
        symbol: rule.symbol,
        side: orderSide,
        quantity,
        accountId: rule.accountId ?? undefined,
        expectedPrice: currentPrice ?? undefined,
        source: "copy-trading",
        brokerConnection,
      });

      if (result.status !== "rejected") {
        const order = result.order as { id?: number; status?: string };
        orderStatus = order.status ?? null;
        // « accepted » peut masquer un ordre en erreur côté courtier (mode live).
        if (order.status === "error") {
          rejectReason = "broker_error";
          logger.warn(
            { ruleId: rule.id, symbol: rule.symbol, signalId },
            "copySignal: ordre en erreur côté courtier — aucun ordre confirmé",
          );
        } else {
          orderId = order.id;
          triggerType = "order";
          if (result.status === "duplicate") {
            logger.info({ ruleId: rule.id, signalId }, "copySignal: ordre déjà passé pour ce trade copié (idempotence) — ignoré");
            continue; // ne pas re-journaliser un doublon
          }
          logger.info(
            { ruleId: rule.id, symbol: rule.symbol, orderSide, quantity, orderId, signalId },
            "copySignal: ordre copy-trading soumis via le pipeline de risque",
          );
        }
      } else {
        // status === "rejected" : kill-switch, garde-fous de risque, heures de
        // marché, cotation manquante (fail closed), prérequis live manquants…
        rejectReason = result.reason;
        logger.warn(
          { ruleId: rule.id, symbol: rule.symbol, reason: result.reason, signalId },
          "copySignal: ordre copy-trading rejeté par les garde-fous",
        );
      }
    } catch (err) {
      rejectReason = "exception";
      logger.error({ err, ruleId: rule.id, symbol: rule.symbol, signalId }, "copySignal: erreur lors de la soumission");
    }

    // ── Log en base (source distinguable + traçabilité du trade copié) ────────
    await db.insert(autoTradeLogsTable).values({
      ruleId: rule.id,
      symbol: rule.symbol,
      side: orderSide,
      triggerType,
      signalScore: null,
      signalVerdict: "COPY-TRADING",
      price: currentPrice != null ? String(currentPrice) : null,
      quantity: String(quantity),
      orderId: orderId ?? null,
      notificationSent: false,
      notes: rejectReason
        ? `Signal copy-trading rejeté : ${rejectReason}`
        : `Signal copy-trading du trader #${followedTraderId} (trade ${externalTradeId})`,
      source: "copy-trading",
      followedTraderId,
      externalTradeId,
      aiVerdict,
      aiReason,
    }).catch((err) => logger.error({ err, ruleId: rule.id }, "copySignal: insertion du log échouée"));

    // Mettre à jour le compteur/dernier déclenchement uniquement si un ordre a
    // été passé. Réutilise le todayReset/tradesToday du garde-fou d'entrée pour
    // que le quota reste cohérent (pas de recalcul divergent).
    if (triggerType === "order") {
      await db.update(autoTradeRulesTable)
        .set({
          lastTriggeredAt: now,
          tradesToday: tradesToday + 1,
          tradesTodayResetAt: todayReset ? rule.tradesTodayResetAt : now,
          updatedAt: now,
        })
        .where(eq(autoTradeRulesTable.id, rule.id))
        .catch((err) => logger.error({ err, ruleId: rule.id }, "copySignal: mise à jour de la règle échouée"));
    }

    void orderStatus; // conservé pour lisibilité/debug
  }
}

// ── Verrou d'exécution en cours (in-flight) ──────────────────────────────────
// Un cycle peut être LENT (attentes IA de 10 s × plusieurs règles) et dépasser
// l'intervalle de 60 s : sans verrou, un second tick de setInterval (ou un run
// forcé/manuel via l'API) démarrerait en parallèle. Or le signalId technique
// est basé sur l'horodatage → l'idempotence de submitOrder ne peut PAS
// dédoublonner deux évaluations concurrentes de la même règle → DOUBLE ORDRE.
// Politique : coalescer (skip) — si un cycle tourne déjà, on ignore la nouvelle
// demande. Le prochain tick reprendra normalement une fois le cycle terminé.
let cycleInFlight = false;

/**
 * Point d'entrée public : sérialise les cycles. Toute demande (tick périodique,
 * cycle initial, run forcé/manuel) qui arrive pendant qu'un cycle tourne déjà
 * est ignorée (coalescée) pour empêcher tout double passage d'ordre.
 */
export async function runAutoTradeCheck(): Promise<void> {
  if (cycleInFlight) {
    logger.warn("autoTradeWorker: cycle déjà en cours — nouvelle demande ignorée (anti-chevauchement)");
    return;
  }
  cycleInFlight = true;
  try {
    await runAutoTradeCycle();
  } finally {
    cycleInFlight = false;
  }
}

/** Corps réel d'un cycle. Ne JAMAIS appeler directement : passer par runAutoTradeCheck (verrou). */
async function runAutoTradeCycle(): Promise<void> {
  const [rules, conn] = await Promise.all([
    db.select().from(autoTradeRulesTable).where(eq(autoTradeRulesTable.enabled, true)),
    resolveConnection(),
  ]);

  // 1. Broker-side protection reconciliation — always before new decisions.
  // Exécutée avant le coupe-circuit pour que les pertes réalisées par les
  // protections côté courtier soient comptées dans le même cycle.
  if (conn?.status === "connected") {
    try {
      const adapter = resolveBrokerAdapter({ snaptradeUserId: conn.snaptradeUserId, snaptradeUserSecret: conn.snaptradeUserSecret });
      const accountIds = [...new Set(rules.map((r) => r.accountId).filter((id): id is string => !!id))];
      for (const accountId of accountIds) {
        await protectiveOrderService.reconcile(accountId, adapter);
        const positions = await adapter.getPositions(accountId);
        for (const position of positions) {
          const rule = rules.find((candidate) => candidate.accountId === accountId && candidate.symbol === position.symbol);
          if (!rule || (!rule.stopLossPct && !rule.takeProfitPct)) continue;
          await protectiveOrderService.reconcileOpenPosition({
            accountId, symbol: position.symbol, parentOrderId: `position-${accountId}-${position.symbol}`,
            quantity: position.quantity, entryPrice: position.averagePrice || position.currentPrice || 0,
            stopLossPct: rule.stopLossPct ? Number(rule.stopLossPct) : null,
            takeProfitPct: rule.takeProfitPct ? Number(rule.takeProfitPct) : null, adapter,
          });
        }
      }
    } catch (err) {
      logger.error({ err }, "autoTradeWorker: broker protection reconciliation failed");
    }
  }

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

/**
 * Runtime state for diagnostics only.  This deliberately contains no rule,
 * account, or credential data, and does not start or run a cycle.
 */
export function getAutoTradeWorkerStatus(): { running: boolean; cycleInFlight: boolean } {
  return { running: intervalHandle !== null, cycleInFlight };
}

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

export function getClosureContext(symbol: string, now: Date = new Date()): ClosureContext {
  const hours = isMarketOpen(symbol, now);
  const notes: string[] = [];
  try {
    for (const w of computeClosureWarnings(symbol, now)) {
      if (w.kind === "early_close_today") {
        notes.push(`Demi-journée aujourd'hui : ${w.exchangeLabel} ferme à ${w.closesAt ?? "13:00"} ET`);
      } else {
        notes.push(`Férié le ${w.date} : ${w.exchangeLabel} fermée le prochain jour ouvrable`);
      }
    }
  } catch (err) {
    logger.warn({ err, symbol }, "autoTradeWorker: computeClosureWarnings échoué — note de fermeture omise");
  }
  return {
    open: hours.open,
    closedMessage: hours.open ? null : hours.message,
    closureNote: notes.length > 0 ? notes.join(" | ") : null,
  };
}
