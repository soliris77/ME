import { Resend } from "resend";
import { logger } from "./logger";
import { logoAttachment, LOGO_CONTENT_ID, type EmailAttachment } from "./emailBrand";

/** Nom affiche dans la boite de reception du destinataire. */
const BRAND_NAME = "Soliris Market";
const FALLBACK_ADDRESS = "onboarding@resend.dev";

/**
 * Resend accepte « Nom <adresse> » aussi bien qu'une adresse nue. Quand le
 * secret ne contient qu'une adresse, la boite de reception affiche le debut
 * de celle-ci — « onboarding » — au lieu du nom de l'application. On ajoute
 * donc le nom nous-memes plutot que de dependre du format du secret.
 */
export function formatSender(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (value === "") return `${BRAND_NAME} <${FALLBACK_ADDRESS}>`;
  return value.includes("<") ? value : `${BRAND_NAME} <${value}>`;
}

/**
 * Client email via Resend (resend.com).
 *
 * Variables d'environnement :
 *   RESEND_API_KEY      — clé API Resend (obligatoire pour l'envoi réel)
 *   RESEND_FROM_EMAIL   — adresse expéditeur (doit appartenir à un domaine
 *                         vérifié dans Resend ; ex. notifications@tondomaine.com)
 *   RESEND_TO_EMAIL     — adresse destinataire par défaut (fallback si le
 *                         paramètre `to` n'est pas fourni)
 *
 * ⚠️  Resend exige un domaine vérifié pour l'adresse d'expédition.
 *     Pour les tests sans domaine propre, utilise "onboarding@resend.dev"
 *     comme FROM — cela fonctionne sans vérification sur le plan gratuit.
 */

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  /** Pieces jointes. Le logo Soliris s'ajoute tout seul, voir resolveAttachments. */
  attachments?: readonly EmailAttachment[];
}

let _resend: Resend | null = null;

function getClient(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY non configuré — email impossible.");
  _resend = new Resend(key);
  return _resend;
}

/**
 * Les pieces jointes reellement envoyees.
 *
 * Le logo n'est joint que si le HTML y fait reference : les gabarits Soliris
 * le font, un courriel en texte simple non. Personne n'a donc a y penser a
 * l'appel, et rien d'inutile ne part.
 */
function resolveAttachments(
  html: string,
  extra: readonly EmailAttachment[] | undefined,
): EmailAttachment[] {
  const files = extra ? [...extra] : [];
  const referenced = html.includes("cid:" + LOGO_CONTENT_ID);
  if (referenced && !files.some((f) => f.contentId === LOGO_CONTENT_ID)) {
    const logo = logoAttachment();
    if (logo !== null) files.push(logo);
  }
  return files;
}

export async function sendEmail({ to, subject, html, attachments }: SendEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn({ to, subject }, "emailClient: RESEND_API_KEY absent — email ignoré");
    return false;
  }

  const from = formatSender(process.env.RESEND_FROM_EMAIL);

  try {
    const client = getClient();
    const files = resolveAttachments(html, attachments);
    const { error } = await client.emails.send(
      files.length > 0
        ? { from, to, subject, html, attachments: files }
        : { from, to, subject, html },
    );
    if (error) {
      logger.error({ to, subject, error }, "emailClient: Resend a refusé l'envoi");
      return false;
    }
    logger.info({ to, subject }, "emailClient: email envoyé via Resend");
    return true;
  } catch (err) {
    logger.error({ err, to, subject }, "emailClient: exception lors de l'envoi Resend");
    return false;
  }
}

// ─── Templates HTML ──────────────────────────────────────────────────────────

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
