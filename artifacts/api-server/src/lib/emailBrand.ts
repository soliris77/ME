/**
 * Identité visuelle des courriels Soliris.
 *
 * Un seul endroit décide de quoi ont l'air les courriels, pour qu'ils se
 * ressemblent tous et ressemblent au site.
 *
 * Le logo est la vraie image du site (soliris-logo.png), envoyée en pièce
 * jointe « en ligne » et référencée par `cid:`. C'est la seule façon de
 * montrer le logo tel quel : les clients de messagerie bloquent les `data:`
 * en <img> et ne rendent pas le SVG, et une URL publique supposerait un
 * domaine vérifié. Si le fichier est introuvable, on retombe sur un
 * mot-marque en texte — le courriel part quand même.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const BRAND = {
  /** Fond du logo, échantillonné dans soliris-logo.png — le bandeau doit être exactement de cette couleur pour que l'image s'y fonde. */
  maroon: "#3A0910",
  /** Or du logo, repris de --sidebar-primary (42 70% 52%). */
  gold: "#DAA72F",
  /** Or plus profond, repris de --primary (42 70% 44%) — traits et accents. */
  goldDeep: "#BF9022",
  ink: "#0B0C0F",
  paper: "#FFFFFF",
  text: "#1A1C20",
  muted: "#6B7280",
  hairline: "#E5E7EB",
  positive: "#12805C",
  negative: "#B42318",
} as const;

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', Times, serif";

/** Identifiant de la pièce jointe du logo, partagé avec emailClient. */
export const LOGO_CONTENT_ID = "soliris-logo";

/** Dimensions réelles de soliris-logo.png : 1200 × 367. */
const LOGO_WIDTH = 240;
const LOGO_HEIGHT = 73;

export interface EmailAttachment {
  filename: string;
  /** Contenu encodé en base64. */
  content: string;
  contentType: string;
  contentId: string;
}

/**
 * Chemins où chercher le logo, depuis le dossier du service (artifacts/api-server).
 * Le premier qui existe gagne ; le fichier n'est lu qu'une fois.
 */
const LOGO_CANDIDATES = [
  "../wealthsimple-tracker/public/soliris-logo.png",
  "../wealthsimple-tracker/dist/public/soliris-logo.png",
  "assets/soliris-logo.png",
  "../../artifacts/wealthsimple-tracker/public/soliris-logo.png",
];

let logoCache: EmailAttachment | null | undefined;

/** Le logo en pièce jointe, ou null s'il est introuvable. Lu une seule fois. */
export function logoAttachment(): EmailAttachment | null {
  if (logoCache !== undefined) return logoCache;
  for (const candidate of LOGO_CANDIDATES) {
    try {
      const bytes = readFileSync(resolve(process.cwd(), candidate));
      logoCache = {
        filename: "soliris-logo.png",
        content: bytes.toString("base64"),
        contentType: "image/png",
        contentId: LOGO_CONTENT_ID,
      };
      return logoCache;
    } catch {
      // chemin suivant
    }
  }
  logoCache = null;
  return logoCache;
}

export interface SolirisEmailParams {
  /** Titre affiché en haut du contenu. */
  title: string;
  /** Une ligne d'introduction, sous le titre. Optionnelle. */
  intro?: string;
  /** Le corps, en HTML déjà échappé par l'appelant. */
  bodyHtml: string;
  /** Mention discrète en pied de courriel. */
  footnote?: string;
}

/**
 * Enveloppe un contenu dans la mise en page Soliris.
 *
 * Tout est en styles en ligne et en tableaux : c'est la seule chose sur
 * laquelle les clients de messagerie s'accordent encore.
 */
export function solirisEmail({ title, intro, bodyHtml, footnote }: SolirisEmailParams): string {
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#F4F5F7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.paper};border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

        <!-- Bandeau de marque : fond exactement au ton du logo, pour que l'image s'y fonde -->
        <tr><td style="background:${BRAND.maroon};padding:26px 24px 24px;text-align:center;">
          ${brandMark()}
        </td></tr>

        <!-- Filet or -->
        <tr><td style="height:2px;background:linear-gradient(90deg,rgba(191,144,34,0) 0%,${BRAND.goldDeep} 50%,rgba(191,144,34,0) 100%);font-size:0;line-height:2px;">&nbsp;</td></tr>

        <!-- Contenu -->
        <tr><td style="padding:28px 26px 8px;">
          <h1 style="margin:0;font-family:${FONT};font-size:18px;line-height:1.35;color:${BRAND.text};font-weight:700;">${escapeHtml(title)}</h1>
          ${intro ? `<p style="margin:8px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(intro)}</p>` : ""}
        </td></tr>
        <tr><td style="padding:18px 26px 26px;font-family:${FONT};color:${BRAND.text};">${bodyHtml}</td></tr>

        <!-- Pied -->
        <tr><td style="border-top:1px solid ${BRAND.hairline};padding:18px 26px 24px;">
          ${footnote ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:11px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(footnote)}</p>` : ""}
          <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1.6;color:#9AA0A6;">
            Envoyé par Soliris Market. Ceci n'est pas un conseil financier.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Le logo du site. Image réelle quand le fichier est là, mot-marque en
 * texte sinon — et dans les deux cas quelque chose s'affiche si le client
 * bloque les images (l'attribut alt).
 */
function brandMark(): string {
  if (logoAttachment() !== null) {
    return `<img src="cid:${LOGO_CONTENT_ID}" alt="Soliris Market" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" style="display:block;margin:0 auto;width:${LOGO_WIDTH}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">`;
  }
  return `<div style="font-family:${SERIF};color:#F0E6D2;font-size:26px;letter-spacing:0.06em;font-weight:400;">Soliris</div>
    <div style="font-family:${FONT};color:#7FA8E8;font-size:11px;letter-spacing:0.42em;margin-top:6px;text-indent:0.42em;font-weight:600;">MARKET</div>`;
}

/**
 * Table simple, lisible sur mobile comme sur bureau.
 *
 * Les colonnes de droite portent une marge à gauche : sans elle, deux
 * nombres alignés à droite se touchent presque (le pourcentage et le volume
 * finissaient collés).
 */
export function emailTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const pad = (i: number) => (i === 0 ? "0 14px 8px 0" : "0 0 8px 18px");
  const padCell = (i: number) => (i === 0 ? "10px 14px 10px 0" : "10px 0 10px 18px");
  const head = headers
    .map((h, i) => `<th style="text-align:${i === 0 ? "left" : "right"};padding:${pad(i)};font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.muted};font-weight:700;border-bottom:1px solid ${BRAND.hairline};white-space:nowrap;">${escapeHtml(h)}</th>`)
    .join("");
  const body = rows
    .map((row) => `<tr>${row
      .map((cell, i) => `<td style="text-align:${i === 0 ? "left" : "right"};padding:${padCell(i)};font-size:14px;color:${BRAND.text};border-bottom:1px solid ${BRAND.hairline};${i === 0 ? "font-weight:600;" : "font-variant-numeric:tabular-nums;white-space:nowrap;"}">${cell}</td>`)
      .join("")}</tr>`)
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Encadré d'avertissement discret, ton ambre. */
export function emailNotice(text: string): string {
  return `<p style="margin:18px 0 0;padding:11px 13px;background:#FFF8E8;border-left:3px solid ${BRAND.goldDeep};border-radius:0 6px 6px 0;font-size:12px;line-height:1.6;color:#7A5B10;">${escapeHtml(text)}</p>`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
