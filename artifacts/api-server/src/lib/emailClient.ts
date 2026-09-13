import { Resend } from "resend";
import { logger } from "./logger";
import {
  logoAttachment,
  LOGO_CONTENT_ID,
  solirisEmail,
  emailNotice,
  escapeHtml,
  BRAND,
  type EmailAttachment,
} from "./emailBrand";

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
  const above = condition === "above";
  const conditionText = above ? "est monté au-dessus de" : "est descendu en dessous de";
  const color = above ? BRAND.positive : BRAND.negative;

  const body = `<p style="margin:0;font-size:15px;line-height:1.6;">
      <strong>${escapeHtml(name ?? symbol)}</strong> <span style="color:${BRAND.muted};">(${escapeHtml(symbol)})</span>
      ${conditionText} <strong style="color:${color};">${targetPrice.toFixed(2)} $</strong>.
    </p>
    <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:${BRAND.muted};">
      Prix actuel : <strong style="color:${BRAND.text};">${currentPrice.toFixed(2)} $</strong>
    </p>`
    + emailNotice("Cette alerte a été désactivée automatiquement — crée-en une nouvelle si tu veux continuer à suivre ce titre.");

  return solirisEmail({
    title: `${name ?? symbol} ${conditionText} ${targetPrice.toFixed(2)} $`,
    intro: "Alerte de prix déclenchée.",
    bodyHtml: body,
  });
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
  const tagColor = isBuy ? BRAND.positive : isSell ? BRAND.negative : BRAND.muted;

  const list = topSignals.length > 0
    ? `<ul style="margin:14px 0 0;padding-left:18px;font-size:14px;line-height:1.7;color:${BRAND.text};">${topSignals
        .map((s) => `<li style="margin:4px 0;">${escapeHtml(s)}</li>`)
        .join("")}</ul>`
    : "";

  const body = `<p style="margin:0;font-size:15px;line-height:1.6;">
      <strong>${escapeHtml(name ?? symbol)}</strong> <span style="color:${BRAND.muted};">(${escapeHtml(symbol)})</span> —
      <strong style="color:${tagColor};">${escapeHtml(overall)}</strong>, score ${score > 0 ? "+" : ""}${score}.
    </p>${list}`
    + emailNotice("Cette alerte a été désactivée automatiquement.");

  return solirisEmail({
    title: `${name ?? symbol} — signal ${overall}`,
    intro: "Signal technique composite.",
    bodyHtml: body,
    footnote: "Le score agrège plusieurs indicateurs ; il ne dit rien du risque de la position.",
  });
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
  const signalColor = signal === "haussier" ? BRAND.positive : signal === "baissier" ? BRAND.negative : BRAND.muted;

  const body = `<p style="margin:0;font-size:15px;line-height:1.6;">
      <strong>${escapeHtml(name ?? symbol)}</strong> <span style="color:${BRAND.muted};">(${escapeHtml(symbol)})</span>
      vient de former <strong style="color:${signalColor};">${escapeHtml(patternName)}</strong>
      (signal ${escapeHtml(signal)}, force ${escapeHtml(strength)}).
    </p>
    <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(description)}</p>
    <p style="margin:14px 0 0;padding-left:12px;border-left:3px solid ${signalColor};font-size:13px;line-height:1.6;font-style:italic;color:${BRAND.muted};">${escapeHtml(howToUse)}</p>`
    + emailNotice("Cette alerte a été désactivée automatiquement.");

  return solirisEmail({
    title: `${name ?? symbol} — ${patternName}`,
    intro: "Motif technique détecté.",
    bodyHtml: body,
  });
}
