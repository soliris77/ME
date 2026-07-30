/**
 * Auto-Trade Worker — Moteur d'automatisation du trading
 * ─────────────────────────────────────────────────────────────────────────────
 * Toutes les 60 secondes :
 *   1. Charge toutes les règles actives
 *   2. Pour chaque règle, calcule les indicateurs techniques (RSI, MACD, SMA, BB)
 *   3. Si le score atteint le seuil → passe un ordre via orderEngine OU notifie seulement
 *   4. Respecte : kill-switch, cooldown, max_trades_per_day, stop-loss, take-profit
 */
import { db, autoTradeRulesTable, autoTradeLogsTable, brokerConnectionsTable, ordersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { yahooFinance, getQuotes } from "../lib/yahoo";
import { computeIndicators, analyzeTradingSignals } from "../lib/signals";
import type { OHLCPoint } from "../lib/patternDetect";
import { submitOrder } from "../lib/orderEngine";
import { sendSms } from "../lib/smsClient";
import { resolveDestinations } from "../lib/notificationPrefs";
import { logger } from "../lib/logger";

const WORKER_INTERVAL_MS = 60_000; // 60s
const OHLC_DAYS = 90; // assez pour SMA50 + tous les indicateurs

async function fetchOHLC(symbol: string): Promise<OHLCPoint[]> {
  const period1 = new Date(Date.now() - OHLC_DAYS * 24 * 60 * 60 * 1000);
  const result = await yahooFinance.chart(symbol, { period1, interval: "1d" });
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
  triggerType: "order" | "notification_only" | "stop_loss" | "take_profit";
  orderMode?: "paper" | "live";
}) {
  const { symbol, side, verdict, score, price, quantity, triggerType, orderMode } = params;

  const sideEmoji = side === "BUY" ? "🟢" : "🔴";
  const action = side === "BUY" ? "ACHAT" : "VENTE";
  const typeLabel =
    triggerType === "stop_loss" ? "⛔ Stop-Loss déclenché" :
    triggerType === "take_profit" ? "✅ Take-Profit déclenché" :
    triggerType === "order" ? `${sideEmoji} Ordre automatique ${orderMode === "live" ? "(LIVE)" : "(paper)"}` :
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
  } catch (err) {
    logger.error({ err, symbol }, "autoTradeWorker: SMS notification failed");
  }
}

async function processRule(
  rule: typeof autoTradeRulesTable.$inferSelect,
  conn: typeof brokerConnectionsTable.$inferSelect | null
): Promise<void> {
  const now = new Date();

  // ── Cooldown ────────────────────────────────────────────────────────────────
  if (rule.lastTriggeredAt) {
    const elapsed = now.getTime() - rule.lastTriggeredAt.getTime();
    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    if (elapsed < cooldownMs) return; // trop tôt
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
  if (history.length < 55) return; // pas assez pour SMA50

  const data = computeIndicators(history);
  const currentPrice = history[history.length - 1].close;
  const analysis = analyzeTradingSignals(data, currentPrice);

  // ── Mettre à jour le dernier score en base ──────────────────────────────────
  await db.update(autoTradeRulesTable)
    .set({ lastSignalScore: analysis.score, lastSignalVerdict: analysis.overall, updatedAt: now })
    .where(eq(autoTradeRulesTable.id, rule.id));

  // ── Vérifier si le score atteint le seuil ──────────────────────────────────
  const absScore = Math.abs(analysis.score);
  if (absScore < rule.minScore) return; // signal trop faible

  const isBuySignal = analysis.score > 0;
  const isSellSignal = analysis.score < 0;

  const modeAllowsBuy = rule.sideMode === "buy" || rule.sideMode === "both";
  const modeAllowsSell = rule.sideMode === "sell" || rule.sideMode === "both";

  const shouldBuy = isBuySignal && modeAllowsBuy;
  const shouldSell = isSellSignal && modeAllowsSell;

  if (!shouldBuy && !shouldSell) return; // direction non correspondante

  const side: "BUY" | "SELL" = shouldBuy ? "BUY" : "SELL";
  const quantity = parseFloat(rule.quantity as string) || 1;

  // ── Passer l'ordre ou juste notifier ───────────────────────────────────────
  const signalId = `auto-${rule.id}-${Date.now()}`;
  let orderId: number | undefined;
  let notificationSent = false;
  let triggerType: "order" | "notification_only" = "notification_only";
  let orderMode: "paper" | "live" = "paper";

  // Kill-switch check
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
      } else if (result.status === "duplicate") {
        logger.info({ ruleId: rule.id, symbol: rule.symbol }, "autoTradeWorker: ordre dupliqué, skip");
        return;
      } else {
        logger.warn({ ruleId: rule.id, symbol: rule.symbol, reason: result.reason }, "autoTradeWorker: ordre rejeté par garde-fous");
        // On notifie quand même si notifyOnSignal est activé
      }
    } catch (err) {
      logger.error({ err, ruleId: rule.id, symbol: rule.symbol }, "autoTradeWorker: erreur lors de la soumission de l'ordre");
    }
  }

  // ── Notification ─────────────────────────────────────────────────────────────
  if (rule.notifyOnSignal) {
    await sendAutoTradeNotification({
      symbol: rule.symbol,
      side,
      verdict: analysis.overall,
      score: analysis.score,
      price: currentPrice,
      quantity,
      triggerType,
      orderMode,
    });
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
      lastTriggeredAt: now,
      tradesToday: newTradesToday,
      tradesTodayResetAt: todayReset ? rule.tradesTodayResetAt : now,
      updatedAt: now,
    })
    .where(eq(autoTradeRulesTable.id, rule.id));
}

export async function runAutoTradeCheck(): Promise<void> {
  // Charger les règles actives + la connexion courtier en parallèle
  const [rules, conn] = await Promise.all([
    db.select().from(autoTradeRulesTable).where(eq(autoTradeRulesTable.enabled, true)),
    resolveConnection(),
  ]);

  if (rules.length === 0) return;

  logger.info({ count: rules.length }, "autoTradeWorker: cycle démarré");

  // Traiter les règles en séquence pour éviter de dépasser les rate-limits Yahoo
  for (const rule of rules) {
    try {
      await processRule(rule, conn);
    } catch (err) {
      logger.error({ err, ruleId: rule.id, symbol: rule.symbol }, "autoTradeWorker: erreur inattendue sur la règle");
    }
    // Petite pause pour respecter les rate limits Yahoo
    await new Promise((r) => setTimeout(r, 800));
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startAutoTradeWorker(intervalMs = WORKER_INTERVAL_MS): void {
  if (intervalHandle) return;
  logger.info({ intervalMs }, "autoTradeWorker: démarré");

  // Premier cycle différé de 30s pour laisser le serveur démarrer
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
