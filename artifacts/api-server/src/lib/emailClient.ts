import { logger } from "./logger";

/**
 * Client email — placeholder.
 * Le canal email n'est pas configuré pour l'instant ; les notifications
 * passent par SMS (Twilio). sendEmail() est gardé pour que le reste du
 * code compile sans modification.
 */

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject }: SendEmailParams): Promise<boolean> {
  logger.warn(
    { to, subject },
    "Canal email non configuré — notification ignorée (l'événement est quand même enregistré en DB)",
  );
  return false;
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

export function signalAlertEmailHtml(params: {
  symbol: string;
  name: string | null;
  overall: string;
  score: number;
  topSignals: string[];
}): string {
  const { symbol, name, overall, score, topSignals } = params;
  const isBuy = overall === "ACHAT" || overall === "FORT ACHAT";
  const isSell = overall === "VENTE" || overall === "FORTE VENTE";
  const tagColor = isBuy ? "#10b981" : isSell ? "#ef4444" : "#6b7280";
  const signalList = topSignals.map((s) => `<li style="margin: 4px 0;">${s}</li>`).join("");
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">📈 Signal technique composite</h2>
      <p style="font-size: 16px; color: #333;">
        <strong>${name ?? symbol} (${symbol})</strong> — signal
        <strong style="color: ${tagColor}; background: ${tagColor}1a; padding: 2px 8px; border-radius: 4px;">${overall}</strong>
        (score ${score > 0 ? "+" : ""}${score}).
      </p>
      ${signalList ? `<ul style="font-size: 14px; color: #555; padding-left: 20px;">${signalList}</ul>` : ""}
      <p style="font-size: 12px; color: #999; margin-top: 24px;">
        Envoyé par Soliris Market. Cette alerte a été désactivée automatiquement.
        ⚠️ Ce n'est pas un conseil financier.
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
        Envoyé par Soliris Market. Cette alerte a été désactivée automatiquement.
        ⚠️ Ce n'est pas un conseil financier.
      </p>
    </div>
  `;
}
