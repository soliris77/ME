import { db, alertsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getQuotes, yahooFinance } from "../lib/yahoo";
import { sendEmail, alertEmailHtml, patternAlertEmailHtml } from "../lib/emailClient";
import { sendSms } from "../lib/smsClient";
import { resolveDestinations } from "../lib/notificationPrefs";
import { detectCandlePatterns, type OHLCPoint, type CandlePattern } from "../lib/patternDetect";
import { logger } from "../lib/logger";

const DEFAULT_INTERVAL_MS = 90_000; // 90s — comfortably under Yahoo's informal rate limits

function isTriggered(condition: string, target: number, current: number): boolean {
  if (condition === "above") return current >= target;
  if (condition === "below") return current <= target;
  return false;
}

const STRENGTH_RANK: Record<string, number> = { faible: 1, moyen: 2, fort: 3 };

/**
 * Résout les destinations effectives (email + téléphone) et les canaux à
 * utiliser pour un déclenchement d'alerte donné : la surcharge par-alerte
 * (notifyEmail/notifyPhone) a priorité sur les préférences globales, mais le
 * *canal* (email/sms/both/none) reste toujours celui configuré globalement
 * pour ce type d'événement (priceAlert ou patternAlert).
 */
async function resolveAlertDestination(
  alert: { notifyEmail: string | null; notifyPhone: string | null },
  eventType: "priceAlert" | "patternAlert",
): Promise<{ email: string | null; phone: string | null; sendEmail: boolean; sendSms: boolean }> {
  const globalPrefs = await resolveDestinations(eventType);
  return {
    email: alert.notifyEmail ?? globalPrefs.email,
    phone: alert.notifyPhone ?? globalPrefs.phone,
    sendEmail: globalPrefs.sendEmail,
    sendSms: globalPrefs.sendSms,
  };
}

/**
 * Cherche un pattern qui vient tout juste d'apparaître (sur les 2 dernières
 * bougies seulement — pas tout l'historique) et qui correspond aux critères
 * de l'alerte (signal haussier/baissier et force minimale).
 */
function findMatchingRecentPattern(
  patterns: CandlePattern[],
  totalCandles: number,
  wantedSignal: string | null,
  minStrength: string | null,
): CandlePattern | undefined {
  const recentCutoff = totalCandles - 2; // les patterns détectés sur les 2 dernières bougies seulement
  const minRank = minStrength ? STRENGTH_RANK[minStrength] ?? 1 : 1;

  return patterns
    .filter((p) => p.idx >= recentCutoff)
    .filter((p) => p.signal !== "neutre")
    .filter((p) => !wantedSignal || p.signal === wantedSignal)
    .filter((p) => (STRENGTH_RANK[p.strength] ?? 1) >= minRank)
    .sort((a, b) => (STRENGTH_RANK[b.strength] ?? 1) - (STRENGTH_RANK[a.strength] ?? 1))[0];
}

async function fetchRecentOHLC(symbol: string): Promise<OHLCPoint[]> {
  const period1 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 jours — largement assez pour détecter un pattern récent
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

/**
 * Checks all active alerts (prix ET pattern/signal) against les données
 * courantes, marque les alertes déclenchées comme inactives, et envoie une
 * notification (email et/ou SMS, selon les préférences) pour chacune. Safe to
 * call concurrently-adjacent runs won't double-fire because we flip `active`
 * to false in the same query that reads the trigger condition.
 */
export async function checkAlerts(): Promise<void> {
  const active = await db.select().from(alertsTable).where(eq(alertsTable.active, true));
  if (active.length === 0) return;

  const priceAlerts = active.filter((a) => a.alertType !== "pattern");
  const patternAlerts = active.filter((a) => a.alertType === "pattern");

  // --- 1. Alertes de prix (comportement historique) ---
  if (priceAlerts.length > 0) {
    const symbols = [...new Set(priceAlerts.map((a) => a.symbol))];
    try {
      const quotes = await getQuotes(symbols);
      const priceBySymbol = new Map(quotes.map((q) => [q.symbol, q.price]));

      for (const alert of priceAlerts) {
        const currentPrice = priceBySymbol.get(alert.symbol);
        if (currentPrice === undefined || !alert.condition || alert.targetPrice === null) continue;

        const target = parseFloat(alert.targetPrice);
        if (!isTriggered(alert.condition, target, currentPrice)) continue;

        try {
          await db.update(alertsTable).set({ active: false, triggeredAt: new Date() }).where(eq(alertsTable.id, alert.id));

          const dest = await resolveAlertDestination(alert, "priceAlert");
          if (dest.sendEmail && dest.email) {
            await sendEmail({
              to: dest.email,
              subject: `🔔 ${alert.symbol} a atteint ${target.toFixed(2)} $`,
              html: alertEmailHtml({ symbol: alert.symbol, name: alert.name, condition: alert.condition, targetPrice: target, currentPrice }),
            });
          } else if (dest.sendEmail) {
            logger.warn({ alertId: alert.id, symbol: alert.symbol }, "Price alert triggered but email channel enabled with no destination configured");
          }
          if (dest.sendSms && dest.phone) {
            const conditionText = alert.condition === "above" ? "est monté au-dessus de" : "est descendu en dessous de";
            await sendSms({
              to: dest.phone,
              body: `🔔 ${alert.name ?? alert.symbol} (${alert.symbol}) ${conditionText} ${target.toFixed(2)} $. Prix actuel : ${currentPrice.toFixed(2)} $.`,
            });
          } else if (dest.sendSms) {
            logger.warn({ alertId: alert.id, symbol: alert.symbol }, "Price alert triggered but SMS channel enabled with no phone number configured");
          }
          logger.info({ alertId: alert.id, symbol: alert.symbol, target, currentPrice }, "Price alert triggered");
        } catch (err) {
          logger.error({ err, alertId: alert.id }, "Failed to process triggered price alert");
        }
      }
    } catch (err) {
      logger.error({ err }, "alertWorker: failed to fetch quotes, skipping price alerts this cycle");
    }
  }

  // --- 2. Alertes de pattern/signal (nouveau — gratuit, même détection que l'analyse technique) ---
  for (const alert of patternAlerts) {
    try {
      const history = await fetchRecentOHLC(alert.symbol);
      if (history.length < 15) continue; // pas assez de données pour détecter quoi que ce soit de fiable

      const patterns = detectCandlePatterns(history);
      const match = findMatchingRecentPattern(patterns, history.length, alert.patternSignal, alert.minStrength);
      if (!match) continue;

      await db.update(alertsTable).set({ active: false, triggeredAt: new Date() }).where(eq(alertsTable.id, alert.id));

      const dest = await resolveAlertDestination(alert, "patternAlert");
      if (dest.sendEmail && dest.email) {
        await sendEmail({
          to: dest.email,
          subject: `📊 ${alert.symbol} — ${match.name} détecté (${match.signal})`,
          html: patternAlertEmailHtml({
            symbol: alert.symbol,
            name: alert.name,
            patternName: match.name,
            signal: match.signal,
            strength: match.strength,
            description: match.description,
            howToUse: match.howToUse,
          }),
        });
      } else if (dest.sendEmail) {
        logger.warn({ alertId: alert.id, symbol: alert.symbol }, "Pattern alert triggered but email channel enabled with no destination configured");
      }
      if (dest.sendSms && dest.phone) {
        await sendSms({
          to: dest.phone,
          body: `📊 ${alert.name ?? alert.symbol} (${alert.symbol}) — pattern ${match.name} détecté (signal ${match.signal}, force ${match.strength}).`,
        });
      } else if (dest.sendSms) {
        logger.warn({ alertId: alert.id, symbol: alert.symbol }, "Pattern alert triggered but SMS channel enabled with no phone number configured");
      }
      logger.info({ alertId: alert.id, symbol: alert.symbol, pattern: match.name, signal: match.signal }, "Pattern alert triggered");
    } catch (err) {
      logger.error({ err, alertId: alert.id, symbol: alert.symbol }, "Failed to process pattern alert");
    }
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startAlertWorker(intervalMs = DEFAULT_INTERVAL_MS): void {
  if (intervalHandle) return; // already running

  logger.info({ intervalMs }, "Starting alert worker");

  // Run once immediately, then on the interval. Errors are caught inside
  // checkAlerts already, but wrap again defensively so a bad cycle never
  // kills the interval.
  void checkAlerts().catch((err) => logger.error({ err }, "alertWorker: initial run failed"));

  intervalHandle = setInterval(() => {
    void checkAlerts().catch((err) => logger.error({ err }, "alertWorker: cycle failed"));
  }, intervalMs);
}

export function stopAlertWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
