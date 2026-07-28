import nodemailer from "nodemailer";
import { logger } from "./logger";
import { resolveCred } from "./persistCreds";

/**
 * Client email via Gmail SMTP (nodemailer).
 *
 * Credentials résolus dans cet ordre :
 *   1. DB (app_settings) — persistés au démarrage depuis les secrets Replit
 *   2. Variables d'environnement Replit (fallback)
 *
 * Best-effort : un échec email ne fait jamais échouer l'action critique qu'il documente.
 */

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<boolean> {
  const [user, pass] = await Promise.all([
    resolveCred("gmailUser",        "GMAIL_USER"),
    resolveCred("gmailAppPassword", "GMAIL_APP_PASSWORD"),
  ]);

  if (!user || !pass) {
    logger.warn(
      { to, subject },
      "Credentials Gmail absents (DB et env var) — envoi email ignoré (alerte enregistrée en DB)",
    );
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({ from: user, to, subject, html });
    logger.info({ to, subject }, "Email envoyé avec succès");
    return true;
  } catch (err) {
    logger.error({ err, to, subject }, "Échec de l'envoi de l'email");
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
        Envoyé par Soliris Market. Cette alerte a été désactivée automatiquement —
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
        Envoyé par Soliris Market. Cette alerte a été désactivée automatiquement —
        crée-en une nouvelle si tu veux continuer à suivre ce titre.
        ⚠️ Ce n'est pas un conseil financier — valide toujours par ton propre jugement.
      </p>
    </div>
  `;
}
