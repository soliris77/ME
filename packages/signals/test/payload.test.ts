import { describe, it, expect } from 'vitest';
import { parseSignalBody, normalizeSymbol, parseTimestamp } from '../src/payload';

describe('normalizeSymbol', () => {
  it('laisse intact un symbole déjà au format interne', () => {
    expect(normalizeSymbol('BTC-USD')).toBe('BTC-USD');
  });
  it('convertit la barre oblique', () => {
    expect(normalizeSymbol('eth/usd')).toBe('ETH-USD');
  });
  it('sépare une paire collée', () => {
    expect(normalizeSymbol('BTCUSD')).toBe('BTC-USD');
  });
  it('préfère USDT à USD sur une paire collée', () => {
    expect(normalizeSymbol('BTCUSDT')).toBe('BTC-USDT');
  });
  it('laisse tel quel ce qu\'il ne sait pas découper', () => {
    expect(normalizeSymbol('XYZ')).toBe('XYZ');
  });
});

describe('parseTimestamp', () => {
  it('lit des secondes epoch', () => {
    expect(parseTimestamp('1767268800')).toBe(1767268800000);
  });
  it('lit des millisecondes epoch', () => {
    expect(parseTimestamp('1767268800000')).toBe(1767268800000);
  });
  it('lit une date ISO', () => {
    expect(parseTimestamp('2026-01-01T12:00:00Z')).toBe(Date.UTC(2026, 0, 1, 12, 0, 0));
  });
  it('retourne null sur du charabia plutôt qu\'une fausse date', () => {
    expect(parseTimestamp('hier après-midi')).toBeNull();
    expect(parseTimestamp(undefined)).toBeNull();
  });
});

describe('parseSignalBody', () => {
  const base = { id: 'sig-1', symbol: 'BTC/USD', action: 'buy' };

  it('lit un corps minimal', () => {
    const r = parseSignalBody(base);
    expect(r).toEqual({
      sourceSignalId: 'sig-1', symbol: 'BTC-USD', action: 'buy',
      emittedAt: null, referencePrice: null,
    });
  });

  it('accepte les noms de champs alternatifs', () => {
    const r = parseSignalBody({ alert_id: 42, ticker: 'ETHUSD', side: 'SELL', price: '3000.5' });
    expect(r).toMatchObject({
      sourceSignalId: '42', symbol: 'ETH-USD', action: 'SELL', referencePrice: 3000.5,
    });
  });

  it('refuse un corps sans identifiant', () => {
    expect(parseSignalBody({ symbol: 'BTC-USD', action: 'buy' })).toEqual({ error: 'identifiant de signal manquant' });
  });

  it('refuse un corps sans symbole', () => {
    expect(parseSignalBody({ id: 'x', action: 'buy' })).toEqual({ error: 'symbole manquant' });
  });

  it('refuse un corps sans action', () => {
    expect(parseSignalBody({ id: 'x', symbol: 'BTC-USD' })).toEqual({ error: 'action manquante' });
  });

  it('refuse ce qui n\'est pas un objet', () => {
    expect(parseSignalBody('buy BTC')).toEqual({ error: 'corps JSON attendu' });
    expect(parseSignalBody(null)).toEqual({ error: 'corps JSON attendu' });
    expect(parseSignalBody([base])).toEqual({ error: 'corps JSON attendu' });
  });

  it('ignore un prix aberrant plutôt que de l\'enregistrer', () => {
    expect(parseSignalBody({ ...base, price: '-5' })).toMatchObject({ referencePrice: null });
    expect(parseSignalBody({ ...base, price: 'gratuit' })).toMatchObject({ referencePrice: null });
  });

  it('tronque un identifiant démesuré au lieu de refuser', () => {
    const r = parseSignalBody({ ...base, id: 'x'.repeat(500) });
    expect('error' in r).toBe(false);
    expect((r as { sourceSignalId: string }).sourceSignalId).toHaveLength(200);
  });
});
