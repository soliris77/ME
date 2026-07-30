/**
 * Auto-Trade Worker — Moteur d'automatisation du trading
 * ─────────────────────────────────────────────────────────────────────────────
 * Toutes les 60 secondes :
 *   1. checkProtectiveExits() — surveille les positions ouvertes (SL/TP)
 *   2. checkDailyLossCircuitBreaker() — coupe-circuit de perte journalière
 *   3. processRule() — évalue chaque règle active (signal → ordre ou notif)
 */
import { db, autoTradeRulesTable, autoTradeLogsTable, brokerConnectionsTable, ordersTable, appSettingsTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { yahooFinance, getQuotes } from "../lib/yahoo";
import { computeIndicators, analyzeTradingSignals } from "../lib/signals";
import type { OHLCPoint } from "../lib/patternDetect";
import { submitOrder } from "../lib/orderEngine";
import { sendSms } from "../lib/smsClient";
import { sendEmail } from "../lib/emailClient";
import { resolveDestinations } from "../lib/notificationPrefs";
import { logger } from "../lib/logger";
import { notifyKillSwitchActivated } from "../lib/notifications";

const WORKER_INTERVAL_MS = 60_000;
const OHLC_DAYS = 90;

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
    triggerType === "stop_loss"   ? "⛔ Stop-Loss déclenché" :
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
async function checkProtectiveExits(
  conn: typeof brokerConnectionsTable.$inferSelect | null,
): Promise<void> {
  const allRules = await db.select().from(autoTradeRulesTable)
    .where(eq(autoTradeRulesTable.enabled, true));

  const rulesWithPositions = allRules.filter(r =>
    r.openQuantity && parseFloat(r.openQuantity as string) > 0 &&
    r.openEntryPrice &&
    (r.stopLossPct || r.takeProfitPct),
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

    let triggerType: "stop_loss" | "take_profit" | null = null;

    if (rule.stopLossPct) {
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

    const signalId = `auto-${rule.id}-${triggerType}-${Date.now()}`;
    const brokerConnection = conn?.status === "connected"
      ? { snaptradeUserId: conn.snaptradeUserId!, snaptradeUserSecret: conn.snaptradeUserSecret! }
      : null;

    let orderId: number | undefined;
    let orderMode: "paper" | "live" = "paper";
    try {
      const result = await submitOrder({
        signalId,
        symbol: rule.symbol,
        side: "SELL",
        quantity: openQty,          // sortir la TOTALITÉ de la position
        accountId: rule.accountId ?? undefined,
        expectedPrice: currentPrice,
        source: "auto-signal",
        brokerConnection,
      });
      if (result.status === "accepted") {
        orderId = (result.order as { id?: number }).id;
        orderMode = (result.order as { mode?: string }).mode === "live" ? "live" : "paper";
      }
    } catch (err) {
      logger.error({ err, ruleId: rule.id }, "autoTradeWorker: submitOrder sortie protectrice échoué");
    }

    // Log en base
    const slNote  = rule.stopLossPct   ? `Stop : ${(entryPrice * (1 - parseFloat(rule.stopLossPct as string) / 100)).toFixed(2)} $` : "";
    const tpNote  = rule.takeProfitPct ? `Target : ${(entryPrice * (1 + parseFloat(rule.takeProfitPct as string) / 100)).toFixed(2)} $` : "";
    await db.insert(autoTradeLogsTable).values({
      ruleId: rule.id,
      symbol: rule.symbol,
      side: "SELL",
      triggerType,
      signalScore: null,
      signalVerdict: triggerType === "stop_loss" ? "FORTE VENTE" : "PRISE DE PROFIT",
      price: String(currentPrice),
      quantity: String(openQty),
      orderId: orderId ?? null,
      notificationSent: false,
      notes: [
        `Entrée : ${entryPrice.toFixed(2)} $`,
        triggerType === "stop_loss" ? slNote : tpNote,
      ].filter(Boolean).join(" | "),
    });

    // Effacer la position
    await db.update(autoTradeRulesTable)
      .set({ openEntryPrice: null, openQuantity: null, openSince: null, updatedAt: new Date() })
      .where(eq(autoTradeRulesTable.id, rule.id));

    // Notification SMS
    if (rule.notifyOnSignal) {
      await sendAutoTradeNotification({
        symbol: rule.symbol,
        side: "SELL",
        verdict: triggerType === "stop_loss" ? "FORTE VENTE" : "PRISE DE PROFIT",
        score: 0,
        price: currentPrice,
        quantity: openQty,
        triggerType,
        orderMode,
      }).catch((e) => logger.error({ e }, "autoTradeWorker: notification sortie protectrice échouée"));
    }
  }
}

// ── I2 — Coupe-circuit de perte journalière agrégée ───────────────────────────
// Si la perte réalisée du jour dépasse maxDailyLossAmount, le kill-switch s'active.
async function checkDailyLossCircuitBreaker(
  conn: typeof brokerConnectionsTable.$inferSelect | null,
): Promise<void> {
  if (!conn || conn.tradingHalted) return; // déjà arrêté

  const [settings] = await db.select().from(appSettingsTable).limit(1);
  if (!settings?.maxDailyLossAmount) return; // désactivé

  const maxLoss = parseFloat(settings.maxDailyLossAmount);
  if (!isFinite(maxLoss) || maxLoss <= 0) return;

  // Calculer la perte réalisée du jour (ordres exécutés aujourd'hui, mode live, côté SELL)
  // Approximation : somme des (price × quantity) SELL − (price × quantity) BUY du jour
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  try {
    const todayOrders = await db.select().from(ordersTable)
      .where(and(
        gte(ordersTable.createdAt, todayStart),
        eq(ordersTable.status, "filled"),
      ));

    let realizedPnL = 0;
    for (const o of todayOrders) {
      const price = parseFloat(o.price as string ?? "0");
      const qty   = parseFloat(o.quantity as string ?? "0");
      const value = price * qty;
      realizedPnL += o.side === "SELL" ? value : -value;
    }

    // pnl négatif = perte nette
    if (realizedPnL < -maxLoss) {
      logger.warn(
        { realizedPnL, maxLoss },
        "autoTradeWorker: perte journalière max atteinte — kill-switch automatique",
      );

      await db.update(brokerConnectionsTable)
        .set({ tradingHalted: true, updatedAt: new Date() })
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
async function processRule(
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
  const quantity = parseFloat(rule.quantity as string) || 1;

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
              updatedAt:      now,
            })
            .where(eq(autoTradeRulesTable.id, rule.id));
        }
      } else if (result.status === "duplicate") {
        logger.info({ ruleId: rule.id, symbol: rule.symbol }, "autoTradeWorker: ordre dupliqué, skip");
        return;
      } else {
        logger.warn({ ruleId: rule.id, symbol: rule.symbol, reason: result.reason }, "autoTradeWorker: ordre rejeté par garde-fous");
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

  if (rules.length === 0) return;

  logger.info({ count: rules.length }, "autoTradeWorker: cycle démarré");

  // 1. Sorties protectrices (SL/TP) — toujours vérifiées, ignorent cooldown/quota
  await checkProtectiveExits(conn).catch((err) =>
    logger.error({ err }, "autoTradeWorker: checkProtectiveExits échoué"),
  );

  // 2. Coupe-circuit de perte journalière
  await checkDailyLossCircuitBreaker(conn).catch((err) =>
    logger.error({ err }, "autoTradeWorker: checkDailyLossCircuitBreaker échoué"),
  );

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
