import nodemailer from "nodemailer";
import { logger } from "./logger";

/**
 * Client email via Gmail SMTP (nodemailer).
 *
 * Variables d'environnement requises :
 * - GMAIL_USER   : adresse Gmail expéditrice (ex. moncompte@gmail.com)
 * - GMAIL_APP_PASSWORD : mot de passe d'application Google (16 caractères,
 *   généré sur myaccount.google.com → Sécurité → Mots de passe des applications)
 *
 * Best-effort : si les identifiants sont absents, sendEmail() log un avertissement
 * et retourne false — un échec d'email ne doit jamais faire échouer l'action
 * critique qu'il documente.
 */

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<boolean> {
  const transporter = getTransporter();
  const from = process.env.GMAIL_USER;

  if (!transporter || !from) {
    logger.warn(
      { to, subject },
      "GMAIL_USER ou GMAIL_APP_PASSWORD non configuré — envoi email ignoré (l'alerte est quand même enregistrée en DB)",
    );
    return false;
  }

  try {
    await transporter.sendMail({ from, to, subject, html });
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
