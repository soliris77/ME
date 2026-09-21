/**
 * Daily Summary Worker — Bilan quotidien par SMS (Twilio)
 * ─────────────────────────────────────────────────────────────────────────────
 * Se déclenche une fois par jour autour de 16h35 heure de l'Est
 * (5 min après la clôture TSX / NASDAQ / NYSE).
 * N'envoie rien si déjà envoyé aujourd'hui, ou si aucun marché n'était ouvert.
 *
 * Contenu du SMS :
 *   1. Statut kill-switch (priorité absolue)
 *   2. Ordres du jour (total, auto vs manuel)
 *   3. Déclenchements auto-trader
 *   4. Positions ouvertes + distance SL/TP
 */
import { db, autoTradeRulesTable, autoTradeLogsTable, brokerConnectionsTable, ordersTable, appSettingsTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { sendSms } from "../lib/smsClient";
import { sendEmail } from "../lib/emailClient";
import { solirisEmail, emailTable, escapeHtml, BRAND } from "../lib/emailBrand";
import { resolveDestinations } from "../lib/notificationPrefs";
import { getQuotes } from "../lib/yahoo";
import { logger } from "../lib/logger";

const SUMMARY_HOUR_ET  = 16; // 16h00 ET
const SUMMARY_MINUTE_ET = 35; // 16h35 ET
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // vérification toutes les 5 min

/** Retourne la date ET courante au format "YYYY-MM-DD". */
function todayInET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

/** Retourne true si on est entre 16h35 et 16h45 ET (fenêtre d'envoi). */
function isInSummaryWindow(): boolean {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/Toronto", hour12: false,
    hour: "2-digit", minute: "2-digit" });
  // "HH:MM"
  const [hh, mm] = etStr.split(":").map(Number);
  return hh === SUMMARY_HOUR_ET && mm >= SUMMARY_MINUTE_ET && mm < SUMMARY_MINUTE_ET + 10;
}

/** Vérifie si le bilan a déjà été envoyé aujourd'hui. */
async function alreadySentToday(): Promise<boolean> {
  const [settings] = await db.select({ lastDailySummaryDate: appSettingsTable.lastDailySummaryDate })
    .from(appSettingsTable).limit(1);
  return settings?.lastDailySummaryDate === todayInET();
}

/** Marque le bilan comme envoyé (empêche les doublons). */
async function markSentToday(): Promise<void> {
  const [settings] = await db.select().from(appSettingsTable).limit(1);
  if (!settings) return;
  await db.update(appSettingsTable)
    .set({ lastDailySummaryDate: todayInET(), updatedAt: new Date() })
    .where(eq(appSettingsTable.id, settings.id));
}

export async function sendDailySummary(): Promise<void> {
  const prefs = await resolveDestinations("signalAlert");
  const canSms   = prefs.sendSms   && !!prefs.phone;
  const canEmail = prefs.sendEmail && !!prefs.email;
  if (!canSms && !canEmail) {
    logger.info("dailySummaryWorker: aucun canal configuré (SMS ni email) — bilan ignoré");
    return;
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // ── Données en parallèle ──────────────────────────────────────────────────
  const [conn, todayOrders, todayLogs, openRules] = await Promise.all([
    db.select().from(brokerConnectionsTable).limit(1).then(r => r[0] ?? null),
    db.select().from(ordersTable).where(gte(ordersTable.createdAt, todayStart)),
    db.select().from(autoTradeLogsTable).where(gte(autoTradeLogsTable.createdAt, todayStart)),
    db.select().from(autoTradeRulesTable).where(eq(autoTradeRulesTable.enabled, true)),
  ]);

  const killSwitchActive = conn?.tradingHalted ?? false;

  // Ordres du jour
  const totalOrders  = todayOrders.length;
  const autoOrders   = todayOrders.filter(o => o.signalId.startsWith("auto-")).length;
  const manualOrders = totalOrders - autoOrders;
  const liveOrders   = todayOrders.filter(o => o.mode === "live").length;

  // Déclenchements auto
  const totalTriggers   = todayLogs.length;
  const slTriggers      = todayLogs.filter(l => l.triggerType === "stop_loss").length;
  const tpTriggers      = todayLogs.filter(l => l.triggerType === "take_profit").length;
  const orderTriggers   = todayLogs.filter(l => l.triggerType === "order").length;
  const notifTriggers   = todayLogs.filter(l => l.triggerType === "notification_only").length;

  // Positions ouvertes avec prix courant
  const rulesWithPositions = openRules.filter(r =>
    r.openQuantity && parseFloat(r.openQuantity as string) > 0 && r.openEntryPrice,
  );

  let positionLines: string[] = [];
  if (rulesWithPositions.length > 0) {
    const symbols = [...new Set(rulesWithPositions.map(r => r.symbol))];
    let quotesMap: Record<string, number> = {};
    try {
      const raw = await getQuotes(symbols);
      if (Array.isArray(raw)) {
        for (const q of raw as Array<{ symbol?: string; regularMarketPrice?: number }>) {
          if (q.symbol && q.regularMarketPrice) quotesMap[q.symbol] = q.regularMarketPrice;
        }
      } else {
        for (const [sym, v] of Object.entries(raw as Record<string, { price?: number }>)) {
          if (v?.price) quotesMap[sym] = v.price;
        }
      }
    } catch (_) { /* best-effort */ }

    for (const r of rulesWithPositions) {
      const entry   = parseFloat(r.openEntryPrice as string);
      const current = quotesMap[r.symbol];
      const pctChange = current ? ((current - entry) / entry * 100).toFixed(1) : "?";
      const sign      = current && current >= entry ? "+" : "";

      const slInfo = r.stopLossPct
        ? ` | SL -${r.stopLossPct}%`
        : "";
      const tpInfo = r.takeProfitPct
        ? ` | TP +${r.takeProfitPct}%`
        : "";
      const name = r.name ? ` (${r.name})` : "";

      positionLines.push(
        `• ${r.symbol}${name}: entrée ${entry.toFixed(2)}$, now ${current ? current.toFixed(2) + "$" : "?"} (${sign}${pctChange}%)${slInfo}${tpInfo}`,
      );
    }
  }

  // ── Construire le SMS ──────────────────────────────────────────────────────
  const dateStr = new Date().toLocaleDateString("fr-CA", { timeZone: "America/Toronto",
    weekday: "short", month: "short", day: "numeric" });

  const lines: string[] = [
    `📊 Soliris — Bilan ${dateStr}`,
    killSwitchActive ? "🔴 Kill-switch : ACTIF" : "🟢 Kill-switch : inactif",
    "",
    `Ordres : ${totalOrders} (${autoOrders} auto, ${manualOrders} manuel${manualOrders > 1 ? "s" : ""}${liveOrders > 0 ? `, ${liveOrders} live` : ""})`,
  ];

  if (totalTriggers > 0) {
    const parts: string[] = [`${orderTriggers} ordre${orderTriggers > 1 ? "s" : ""}`];
    if (notifTriggers > 0)  parts.push(`${notifTriggers} notif`);
    if (slTriggers > 0)     parts.push(`⛔ ${slTriggers} SL`);
    if (tpTriggers > 0)     parts.push(`✅ ${tpTriggers} TP`);
    lines.push(`Auto-trader : ${totalTriggers} déclenchement${totalTriggers > 1 ? "s" : ""} (${parts.join(", ")})`);
  } else {
    lines.push("Auto-trader : aucun déclenchement");
  }

  if (positionLines.length > 0) {
    lines.push("", `Positions ouvertes (${positionLines.length}) :`);
    lines.push(...positionLines);
  } else {
    lines.push("Positions ouvertes : aucune");
  }

  if (totalOrders === 0 && totalTriggers === 0 && !positionLines.length) {
    lines.push("", "Journée calme — aucune activité.");
  }

  lines.push("", "⚠️ Pas un conseil financier.");

  const body = lines.join("\n");

  let sent = false;

  if (canSms) {
    const smsSent = await sendSms({ to: prefs.phone!, body });
    if (smsSent) {
      sent = true;
      logger.info("dailySummaryWorker: bilan envoyé par SMS");
    } else {
      logger.warn("dailySummaryWorker: échec de l'envoi du bilan SMS");
    }
  }

  if (canEmail) {
    const dateStr2 = new Date().toLocaleDateString("fr-CA", {
      timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric",
    });
    const triggerParts: string[] = [];
    if (orderTriggers > 0) triggerParts.push(`${orderTriggers} ordre${orderTriggers > 1 ? "s" : ""}`);
    if (notifTriggers > 0) triggerParts.push(`${notifTriggers} notification${notifTriggers > 1 ? "s" : ""}`);
    if (slTriggers > 0) triggerParts.push(`${slTriggers} stop-loss`);
    if (tpTriggers > 0) triggerParts.push(`${tpTriggers} take-profit`);

    const positionRows = positionLines.map((line) => [
      escapeHtml(line.replace(/^•\s*/, "")),
    ]);
    const statusLabel = killSwitchActive
      ? `<strong style="color:${BRAND.negative};">ACTIF</strong>`
      : `<strong style="color:${BRAND.positive};">Inactif</strong>`;
    const reportRows = [
      ["Sécurité", `Kill-switch : ${statusLabel}`],
      ["Ordres", escapeHtml(`${totalOrders} (${autoOrders} auto, ${manualOrders} manuel${manualOrders > 1 ? "s" : ""}${liveOrders > 0 ? `, ${liveOrders} live` : ""})`)],
      ["Auto-trader", escapeHtml(triggerParts.length > 0 ? triggerParts.join(" · ") : "Aucun déclenchement")],
      ["Positions", escapeHtml(positionLines.length > 0 ? `${positionLines.length} ouverte${positionLines.length > 1 ? "s" : ""}` : "Aucune")],
    ];
    const positionsHtml = positionRows.length > 0
      ? `<div style="margin-top:24px;">
          <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.muted};font-weight:700;">Positions ouvertes</p>
          ${emailTable(["Position"], positionRows)}
        </div>`
      : "";
    const htmlBody = solirisEmail({
      title: `Bilan du ${dateStr2}`,
      intro: "Résumé de l’activité de Soliris Market.",
      bodyHtml: emailTable(["Indicateur", "Valeur"], reportRows) + positionsHtml,
      footnote: "Les informations présentées sont indicatives et ne constituent pas un conseil financier.",
    });
    const emailSent = await sendEmail({
      to: prefs.email!,
      subject: `📊 Soliris — Bilan ${dateStr2}`,
      html: htmlBody,
    });
    if (emailSent) {
      sent = true;
      logger.info("dailySummaryWorker: bilan envoyé par email");
    } else {
      logger.warn("dailySummaryWorker: échec de l'envoi du bilan email");
    }
  }

  if (sent) await markSentToday();
}

// ── Worker loop ───────────────────────────────────────────────────────────────
let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startDailySummaryWorker(): void {
  if (intervalHandle) return;
  logger.info("dailySummaryWorker: démarré (vérification toutes les 5 min)");

  intervalHandle = setInterval(async () => {
    try {
      if (!isInSummaryWindow()) return;
      if (await alreadySentToday()) return;
      await sendDailySummary();
    } catch (err) {
      logger.error({ err }, "dailySummaryWorker: erreur inattendue");
    }
  }, CHECK_INTERVAL_MS);
}

export function stopDailySummaryWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
