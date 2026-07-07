import { logger } from "./logger";

/**
 * Minimal email sender using the Resend HTTP API (https://resend.com).
 * No SDK dependency needed — it's a single POST call.
 *
 * Required env vars:
 * - RESEND_API_KEY: API key from resend.com
 * - RESEND_FROM: verified sender address, e.g. "WS Marchés <alerts@yourdomain.com>"
 * - ALERT_NOTIFY_EMAIL: default destination address for alert notifications
 *   (used when an alert doesn't specify its own notifyEmail)
 *
 * If RESEND_API_KEY is not set, sendEmail() logs a warning and no-ops instead
 * of throwing — so the alert worker keeps running (and still marks alerts as
 * triggered in the DB) even before email is configured.
 */

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    logger.warn(
      { to, subject },
      "RESEND_API_KEY or RESEND_FROM not set — skipping email send (alert will still be marked triggered in DB)",
    );
    return false;
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      logger.error({ status: resp.status, body }, "Resend API error while sending alert email");
      return false;
    }

    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send alert email");
    return false;
  }
}

export function alertEmailHtml(params: {
  symbol: string;
  name: string | null;
  condition: string;
  targetPrice: number;
  currentPrice: number;
}): string {
  const { symbol, name, condition, targetPrice, currentPrice } = params;
  const conditionText = condition === "above" ? "est monté au-dessus de" : "est descendu en dessous de";
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">🔔 Alerte de prix déclenchée</h2>
      <p style="font-size: 16px; color: #333;">
        <strong>${name ?? symbol} (${symbol})</strong> ${conditionText}
        <strong>${targetPrice.toFixed(2)} $</strong>.
      </p>
      <p style="font-size: 14px; color: #666;">Prix actuel : ${currentPrice.toFixed(2)} $</p>
      <p style="font-size: 12px; color: #999; margin-top: 24px;">
        Envoyé par WS Marchés. Cette alerte a été désactivée automatiquement —
        crée-en une nouvelle si tu veux continuer à suivre ce titre.
      </p>
    </div>
  `;
}

export function patternAlertEmailHtml(params: {
  symbol: string;
  name: string | null;
  patternName: string;
  signal: string;
  strength: string;
  description: string;
  howToUse: string;
}): string {
  const { symbol, name, patternName, signal, strength, description, howToUse } = params;
  const signalColor = signal === "haussier" ? "#10b981" : signal === "baissier" ? "#ef4444" : "#6b7280";
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">📊 Alerte intelligente déclenchée</h2>
      <p style="font-size: 16px; color: #333;">
        <strong>${name ?? symbol} (${symbol})</strong> vient de former un pattern
        <strong style="color: ${signalColor};">${patternName}</strong>
        (signal <strong style="color: ${signalColor};">${signal}</strong>, force ${strength}).
      </p>
      <p style="font-size: 14px; color: #666;">${description}</p>
      <p style="font-size: 13px; color: #666; font-style: italic; border-left: 3px solid ${signalColor}; padding-left: 10px;">${howToUse}</p>
      <p style="font-size: 12px; color: #999; margin-top: 24px;">
        Envoyé par WS Marchés. Cette alerte a été désactivée automatiquement —
        crée-en une nouvelle si tu veux continuer à suivre ce titre.
        ⚠️ Ce n'est pas un conseil financier — valide toujours par ton propre jugement.
      </p>
    </div>
  `;
}
