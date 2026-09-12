import { describe, it, expect } from 'vitest';
import { computeSignature, verifyWebhook, DEFAULT_TOLERANCE_SECONDS } from '../src/webhook';

const SECRET = 'un-secret-de-test';
const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const TS = String(Math.floor(NOW / 1000));
const BODY = JSON.stringify({ id: 'sig-1', symbol: 'BTC-USD', action: 'buy' });

function verdict(overrides: Partial<Parameters<typeof verifyWebhook>[0]> = {}) {
  return verifyWebhook({
    rawBody: BODY,
    signatureHeader: computeSignature(SECRET, TS, BODY),
    timestampHeader: TS,
    secret: SECRET,
    now: NOW,
    ...overrides,
  });
}

describe('verifyWebhook', () => {
  it('accepte une signature correcte', () => {
    expect(verdict()).toEqual({ ok: true });
  });

  it('accepte le préfixe sha256=', () => {
    expect(verdict({ signatureHeader: 'sha256=' + computeSignature(SECRET, TS, BODY) })).toEqual({ ok: true });
  });

  it('refuse quand le secret est absent', () => {
    expect(verdict({ secret: undefined })).toEqual({ ok: false, reason: 'secret_absent' });
  });

  it('refuse quand la signature est absente', () => {
    expect(verdict({ signatureHeader: undefined })).toEqual({ ok: false, reason: 'signature_absente' });
  });

  it("refuse quand l'horodatage est absent", () => {
    expect(verdict({ timestampHeader: undefined })).toEqual({ ok: false, reason: 'horodatage_absent' });
  });

  it("refuse un horodatage illisible", () => {
    expect(verdict({ timestampHeader: 'hier' })).toEqual({ ok: false, reason: 'horodatage_invalide' });
  });

  it('refuse un appel rejoué trop tard', () => {
    const vieux = String(Math.floor(NOW / 1000) - DEFAULT_TOLERANCE_SECONDS - 1);
    const v = verifyWebhook({
      rawBody: BODY,
      signatureHeader: computeSignature(SECRET, vieux, BODY),
      timestampHeader: vieux,
      secret: SECRET,
      now: NOW,
    });
    expect(v).toEqual({ ok: false, reason: 'horodatage_hors_tolerance' });
  });

  it('refuse un horodatage trop dans le futur', () => {
    const futur = String(Math.floor(NOW / 1000) + DEFAULT_TOLERANCE_SECONDS + 1);
    const v = verifyWebhook({
      rawBody: BODY,
      signatureHeader: computeSignature(SECRET, futur, BODY),
      timestampHeader: futur,
      secret: SECRET,
      now: NOW,
    });
    expect(v).toEqual({ ok: false, reason: 'horodatage_hors_tolerance' });
  });

  it('refuse un corps modifié après signature', () => {
    const v = verdict({ rawBody: BODY.replace('buy', 'sell') });
    expect(v).toEqual({ ok: false, reason: 'signature_invalide' });
  });

  it("refuse la signature d'un autre secret", () => {
    const v = verdict({ signatureHeader: computeSignature('mauvais-secret', TS, BODY) });
    expect(v).toEqual({ ok: false, reason: 'signature_invalide' });
  });

  it('refuse une signature de longueur incorrecte sans planter', () => {
    expect(verdict({ signatureHeader: 'court' })).toEqual({ ok: false, reason: 'signature_invalide' });
  });

  it('signe le corps brut, pas du JSON re-sérialisé', () => {
    // Mêmes données, octets différents : la signature ne doit pas suivre.
    const autreOrdre = JSON.stringify({ action: 'buy', symbol: 'BTC-USD', id: 'sig-1' });
    expect(computeSignature(SECRET, TS, autreOrdre)).not.toBe(computeSignature(SECRET, TS, BODY));
  });

  it("lie la signature à l'horodatage", () => {
    const autreTs = String(Math.floor(NOW / 1000) - 10);
    expect(computeSignature(SECRET, autreTs, BODY)).not.toBe(computeSignature(SECRET, TS, BODY));
  });
});
