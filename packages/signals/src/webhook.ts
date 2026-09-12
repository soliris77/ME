/**
 * Vérification des webhooks entrants.
 *
 * Trois contrôles, tous nécessaires :
 *   1. la signature HMAC-SHA256 du corps brut, comparée en temps constant ;
 *   2. l'horodatage, pour qu'un ancien appel capté ne puisse pas être rejoué ;
 *   3. l'unicité de l'identifiant de signal, assurée côté base par la
 *      contrainte UNIQUE (source_id, source_signal_id).
 *
 * Le corps BRUT est indispensable : re-sérialiser du JSON change les octets et
 * casse la signature.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Tolérance par défaut sur l'horodatage d'un webhook. */
export const DEFAULT_TOLERANCE_SECONDS = 300;

export type WebhookVerdict =
  | { ok: true }
  | { ok: false; reason: 'secret_absent' | 'signature_absente' | 'signature_invalide' | 'horodatage_absent' | 'horodatage_invalide' | 'horodatage_hors_tolerance' };

export interface VerifyOptions {
  rawBody: Buffer | string;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
  secret: string | undefined;
  now: number;
  toleranceSeconds?: number;
}

/**
 * Signature attendue : HMAC-SHA256 de `<timestamp>.<corps brut>`, en hexadécimal.
 * Inclure l'horodatage dans le message signé empêche de rejouer un corps valide
 * avec un horodatage neuf.
 */
export function computeSignature(secret: string, timestamp: string, rawBody: Buffer | string): string {
  const mac = createHmac('sha256', secret);
  mac.update(timestamp);
  mac.update('.');
  mac.update(rawBody);
  return mac.digest('hex');
}

export function verifyWebhook(options: VerifyOptions): WebhookVerdict {
  const { rawBody, signatureHeader, timestampHeader, secret, now } = options;
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;

  if (!secret) return { ok: false, reason: 'secret_absent' };
  if (!signatureHeader) return { ok: false, reason: 'signature_absente' };
  if (!timestampHeader) return { ok: false, reason: 'horodatage_absent' };

  const seconds = Number(timestampHeader);
  if (!Number.isFinite(seconds)) return { ok: false, reason: 'horodatage_invalide' };

  // Fenêtre symétrique : un horodatage trop dans le futur est aussi suspect
  // qu'un horodatage trop vieux.
  if (Math.abs(now / 1000 - seconds) > tolerance) {
    return { ok: false, reason: 'horodatage_hors_tolerance' };
  }

  const expected = computeSignature(secret, timestampHeader, rawBody);
  const provided = stripPrefix(signatureHeader);

  // timingSafeEqual exige des longueurs égales : on compare d'abord la
  // longueur, ce qui ne révèle rien d'exploitable.
  if (provided.length !== expected.length) return { ok: false, reason: 'signature_invalide' };
  const equal = timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
  return equal ? { ok: true } : { ok: false, reason: 'signature_invalide' };
}

/** Accepte « sha256=abc… » aussi bien que « abc… ». */
function stripPrefix(signature: string): string {
  const trimmed = signature.trim();
  const index = trimmed.indexOf('=');
  return index >= 0 && trimmed.slice(0, index).toLowerCase() === 'sha256'
    ? trimmed.slice(index + 1)
    : trimmed;
}
