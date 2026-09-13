/**
 * Identité visuelle des courriels Soliris.
 *
 * Un seul endroit décide de quoi ont l'air les courriels, pour qu'ils se
 * ressemblent tous et ressemblent au site : fond sombre, or, sérif espacé.
 *
 * Pourquoi pas d'image de logo : les clients de messagerie les plus utilisés
 * bloquent les `data:` en <img> et ne rendent pas le SVG. Une image réelle
 * suppose donc soit une URL publique jointe à un domaine vérifié, soit une
 * pièce jointe en ligne. Le monogramme ci-dessous est dessiné en HTML : il
 * s'affiche partout, sans dépendre du réseau ni d'un domaine.
 */

export const BRAND = {
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

        <!-- Bandeau de marque -->
        <tr><td style="background:${BRAND.ink};padding:30px 24px 26px;text-align:center;">
          ${monogram()}
          <div style="font-family:${SERIF};color:${BRAND.gold};font-size:21px;letter-spacing:0.40em;font-weight:600;margin-top:14px;text-indent:0.40em;">SOLIRIS</div>
          <div style="font-family:${SERIF};color:rgba(255,255,255,0.34);font-size:9px;letter-spacing:0.52em;margin-top:7px;text-indent:0.52em;">MARKET</div>
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
 * Monogramme hexagonal, dessiné en CSS. Un hexagone or sur fond sombre avec
 * le S du logo — reconnaissable, et aucun octet d'image à charger.
 */
function monogram(): string {
  return `<div style="width:54px;height:54px;margin:0 auto;background:${BRAND.ink};border:2px solid ${BRAND.goldDeep};border-radius:14px;text-align:center;line-height:50px;">
    <span style="font-family:${SERIF};font-size:26px;color:${BRAND.gold};font-weight:600;line-height:50px;">S</span>
  </div>`;
}

/** Table simple, lisible sur mobile comme sur bureau. */
export function emailTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const head = headers
    .map((h, i) => `<th style="text-align:${i === 0 ? "left" : "right"};padding:0 0 8px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.muted};font-weight:700;border-bottom:1px solid ${BRAND.hairline};">${escapeHtml(h)}</th>`)
    .join("");
  const body = rows
    .map((row) => `<tr>${row
      .map((cell, i) => `<td style="text-align:${i === 0 ? "left" : "right"};padding:10px 0;font-size:14px;color:${BRAND.text};border-bottom:1px solid ${BRAND.hairline};${i === 0 ? "font-weight:600;" : "font-variant-numeric:tabular-nums;"}">${cell}</td>`)
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
