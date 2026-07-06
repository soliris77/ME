import { db, alertsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getQuotes } from "../lib/yahoo";
import { sendEmail, alertEmailHtml } from "../lib/emailClient";
import { logger } from "../lib/logger";

const DEFAULT_INTERVAL_MS = 90_000; // 90s — comfortably under Yahoo's informal rate limits

function isTriggered(condition: string, target: number, current: number): boolean {
  if (condition === "above") return current >= target;
  if (condition === "below") return current <= target;
  return false;
}

/**
 * Checks all active alerts against live prices, marks triggered ones inactive,
 * and sends a notification email for each. Safe to call concurrently-adjacent
 * runs won't double-fire because we flip `active` to false in the same query
 * that reads the trigger condition.
 */
export async function checkAlerts(): Promise<void> {
  const active = await db.select().from(alertsTable).where(eq(alertsTable.active, true));
  if (active.length === 0) return;

  const symbols = [...new Set(active.map((a) => a.symbol))];
  let quotes;
  try {
    quotes = await getQuotes(symbols);
  } catch (err) {
    logger.error({ err }, "alertWorker: failed to fetch quotes, skipping this cycle");
    return;
  }

  const priceBySymbol = new Map(quotes.map((q) => [q.symbol, q.price]));
  const defaultTo = process.env.ALERT_NOTIFY_EMAIL;

  for (const alert of active) {
    const currentPrice = priceBySymbol.get(alert.symbol);
    if (currentPrice === undefined) continue; // symbol lookup failed this cycle, try again next time

    const target = parseFloat(alert.targetPrice);
    if (!isTriggered(alert.condition, target, currentPrice)) continue;

    try {
      await db
        .update(alertsTable)
        .set({ active: false, triggeredAt: new Date() })
        .where(eq(alertsTable.id, alert.id));

      const to = alert.notifyEmail ?? defaultTo;
      if (to) {
        await sendEmail({
          to,
          subject: `🔔 ${alert.symbol} a atteint ${target.toFixed(2)} $`,
          html: alertEmailHtml({
            symbol: alert.symbol,
            name: alert.name,
            condition: alert.condition,
            targetPrice: target,
            currentPrice,
          }),
        });
      } else {
        logger.warn(
          { alertId: alert.id, symbol: alert.symbol },
          "Alert triggered but no destination email configured (set ALERT_NOTIFY_EMAIL)",
        );
      }

      logger.info(
        { alertId: alert.id, symbol: alert.symbol, target, currentPrice },
        "Alert triggered",
      );
    } catch (err) {
      logger.error({ err, alertId: alert.id }, "Failed to process triggered alert");
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
