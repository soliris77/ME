/**
 * Notifications externes pour les événements critiques (au-delà des alertes
 * de prix/pattern, qui ont leur propre logique dans alertWorker.ts).
 * Lit les préférences de notification (email/SMS, canal par type d'événement)
 * plutôt que l'ancienne variable ALERT_NOTIFY_EMAIL — voir notificationPrefs.ts.
 * Best-effort : un échec d'envoi (email ou SMS) ne doit jamais faire échouer
 * l'action critique elle-même (kill-switch, ordre…) qu'elle documente.
 */
import { sendEmail } from "./emailClient";
import { sendSms } from "./smsClient";
import { resolveDestinations } from "./notificationPrefs";
import { logger } from "./logger";
import type { NotificationEventType } from "@workspace/db";

function wrapEmail(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">${title}</h2>
      ${bodyHtml}
      <p style="font-size: 12px; color: #999; margin-top: 24px;">
        Envoyé par Soliris Market — notification critique.
      </p>
    </div>
  `;
}

/**
 * Retourne `true` si au moins un canal configuré a livré la notification
 * (ou si aucun canal n'est configuré — rien à livrer), `false` si tous les
 * envois tentés ont échoué. Permet aux appelants critiques de re-tenter.
 */
async function notify(eventType: NotificationEventType, subject: string, html: string, smsText: string): Promise<boolean> {
  const { email, phone, sendEmail: shouldEmail, sendSms: shouldSms } = await resolveDestinations(eventType);

  if (!shouldEmail && !shouldSms) return true; // canal "none" pour ce type d'événement

  let attempted = 0;
  let delivered = 0;

  if (shouldEmail) {
    if (email) {
      attempted++;
      try {
        // sendEmail retourne false pour les échecs ordinaires (credentials
        // manquants, rejet du fournisseur…) sans lever d'exception.
        if (await sendEmail({ to: email, subject, html })) delivered++;
        else logger.error({ eventType, subject }, "notifications: l'email critique n'a pas été livré");
      } catch (err) {
        logger.error({ err, eventType, subject }, "notifications: échec de l'envoi de l'email critique");
      }
    } else {
      logger.warn({ eventType, subject }, "notifications: canal email configuré mais aucune adresse enregistrée — envoi ignoré");
    }
  }

  if (shouldSms) {
    if (phone) {
      attempted++;
      try {
        // sendSms retourne false pour les échecs ordinaires (numéro invalide,
        // rejet Twilio…) sans lever d'exception.
        if (await sendSms({ to: phone, body: smsText })) delivered++;
        else logger.error({ eventType, subject }, "notifications: le SMS critique n'a pas été livré");
      } catch (err) {
        logger.error({ err, eventType, subject }, "notifications: échec de l'envoi du SMS critique");
      }
    } else {
      logger.warn({ eventType, subject }, "notifications: canal SMS configuré mais aucun numéro enregistré — envoi ignoré");
    }
  }

  return attempted === 0 || delivered > 0;
}

export async function notifyKillSwitchActivated(reason?: string): Promise<void> {
  await notify(
    "killSwitch",
    "🛑 Kill-switch activé sur Soliris Market",
    wrapEmail(
      "🛑 Trading suspendu",
      `<p style="font-size:15px;color:#333;">Le kill-switch a été activé — plus aucun ordre live ne sera envoyé au courtier jusqu'à réactivation manuelle.</p>${
        reason ? `<p style="font-size:13px;color:#666;">${reason}</p>` : ""
      }`,
    ),
    `🛑 Soliris Market : kill-switch activé — trading suspendu.${reason ? ` ${reason}` : ""}`,
  );
}

/** Critical broker/protection notifications intentionally use the existing
 * kill-switch preference: deployments predating dedicated event columns still
 * have a configured, user-selected channel, and never silently fall back to SMS. */
export async function notifyProtectivePlacementFailure(params: {
  symbol: string; kind: string; error: string;
}): Promise<void> {
  await notify(
    "killSwitch",
    `⚠️ Échec de protection — ${params.symbol}`,
    wrapEmail("⚠️ Échec de placement d'une protection",
      `<p>La protection <strong>${params.kind}</strong> de ${params.symbol} n'a pas pu être placée.</p><p>${params.error}</p>`),
    `⚠️ Protection ${params.kind} échouée pour ${params.symbol} : ${params.error}`,
  );
}

export async function notifyBrokerAuthenticationError(error: unknown): Promise<void> {
  const message = String(error);
  await notify(
    "killSwitch",
    "🔐 Erreur d'authentification courtier",
    wrapEmail("🔐 Erreur d'authentification courtier", `<p>${message}</p>`),
    `🔐 Authentification courtier échouée : ${message}`,
  );
}

export async function notifyStaleData(symbol: string, ageMinutes: number): Promise<void> {
  await notify(
    "killSwitch",
    `⏳ Données périmées — ${symbol}`,
    wrapEmail("⏳ Données de marché périmées", `<p>Les données de ${symbol} sont périmées depuis ${ageMinutes} minutes.</p>`),
    `⏳ Données de ${symbol} périmées depuis ${ageMinutes} minutes.`,
  );
}

/** Avertissement : la perte du jour approche la limite du coupe-circuit (mêmes canaux que le kill-switch). */
export async function notifyDailyLossWarning(params: {
  loss: number;
  maxLoss: number;
  pct: number;
}): Promise<boolean> {
  const { loss, maxLoss, pct } = params;
  return notify(
    "killSwitch",
    "⚠️ Perte du jour proche de la limite — Soliris Market",
    wrapEmail(
      "⚠️ Perte du jour proche de la limite",
      `<p style="font-size:15px;color:#333;">
        La perte réalisée du jour atteint <strong>${loss.toFixed(2)} $</strong>,
        soit ${pct.toFixed(0)} % de la limite de <strong>${maxLoss.toFixed(2)} $</strong>.
        Si elle dépasse la limite, le coupe-circuit suspendra automatiquement le trading.
      </p>`,
    ),
    `⚠️ Soliris Market : perte du jour ${loss.toFixed(2)} $ (${pct.toFixed(0)} % de la limite de ${maxLoss.toFixed(2)} $). Le coupe-circuit suspendra le trading si elle est dépassée.`,
  );
}

export async function notifyLargeOrderExecuted(params: {
  symbol: string;
  side: string;
  quantity: number;
  orderValue: number;
  currency: string;
  mode: "paper" | "live";
}): Promise<void> {
  const { symbol, side, quantity, orderValue, currency, mode } = params;
  const sideText = side === "BUY" ? "Achat" : "Vente";
  await notify(
    "largeOrder",
    `💰 Ordre important exécuté — ${symbol}`,
    wrapEmail(
      "💰 Ordre important exécuté",
      `<p style="font-size:15px;color:#333;">
        ${sideText} de <strong>${quantity} ${symbol}</strong>
        pour <strong>${currency}${orderValue.toFixed(2)}</strong> (mode ${mode}).
      </p>`,
    ),
    `💰 Soliris Market : ${sideText.toLowerCase()} de ${quantity} ${symbol} pour ${currency}${orderValue.toFixed(2)} (mode ${mode}).`,
  );
}

export async function notifySettingsChanged(changes: Record<string, { from: number; to: number }>): Promise<void> {
  const entries = Object.entries(changes);
  const rows = entries.map(([key, { from, to }]) => `<li>${key} : ${from} → ${to}</li>`).join("");
  const smsLines = entries.map(([key, { from, to }]) => `${key} : ${from} → ${to}`).join(", ");
  await notify(
    "thresholdChange",
    "⚙️ Paramètres de risque modifiés",
    wrapEmail("⚙️ Paramètres de risque modifiés", `<ul style="font-size:14px;color:#333;">${rows}</ul>`),
    `⚙️ Soliris Market : paramètres de risque modifiés — ${smsLines}`,
  );
}
