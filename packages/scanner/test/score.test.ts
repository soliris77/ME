import { describe, it, expect } from 'vitest';
import { computeMomentum, MAX_ENTRY_EXTENSION_ATR, median, pctChange } from '../src/score';
import { buildUniverse, splitSymbol, spreadAcceptable } from '../src/universe';
import type { ScanCandidate, UniverseFilter } from '../src/types';

/** Série de base : prix plat à 100, volume plat à 10. */
function flatCandles(n = 150, price = 100, volume = 10) {
  return Array.from({ length: n }, () => ({ close: price, volume }));
}

/** Série qui oscille de `amplitudePct` à chaque bougie — une paire "agitée". */
function choppyCandles(n = 150, price = 100, amplitudePct = 10) {
  return Array.from({ length: n }, (_, i) => ({
    close: price * (1 + (i % 2 === 0 ? amplitudePct / 100 : -amplitudePct / 100)),
    volume: 10,
  }));
}

describe('computeMomentum', () => {
  it("s'abstient quand l'historique est trop court", () => {
    expect(computeMomentum('BTC-USD', flatCandles(50), 1)).toBeNull();
  });

  it("s'abstient quand l'ATR est absent ou nul", () => {
    expect(computeMomentum('BTC-USD', flatCandles(), 0)).toBeNull();
    expect(computeMomentum('BTC-USD', flatCandles(), Number.NaN)).toBeNull();
  });

  it('note haut une paire calme qui se met à bouger', () => {
    const candles = flatCandles();
    // Les 4 dernières bougies montent de 6 %, avec du volume.
    for (let i = candles.length - 4; i < candles.length; i++) {
      candles[i] = { close: 100 + (i - (candles.length - 5)) * 1.5, volume: 60 };
    }
    const result = computeMomentum('SOL-USD', candles, 1);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(50);
    expect(result!.volumeRatio).toBeGreaterThan(2);
  });

  it("note bas une paire agitée qui fait son mouvement habituel", () => {
    const candles = choppyCandles();
    const result = computeMomentum('DOGE-USD', candles, 20);
    expect(result).not.toBeNull();
    // Le mouvement est dans la norme de la paire : l'accélération reste faible.
    expect(result!.score).toBeLessThan(50);
  });

  it('marque comme trop étendue une paire déjà très au-dessus de sa cassure', () => {
    const candles = flatCandles();
    // Strictement au-delà du seuil : le seuil exact ne doit pas déclencher.
    candles[candles.length - 1] = { close: 100 + 10 * (MAX_ENTRY_EXTENSION_ATR + 1), volume: 10 };
    const result = computeMomentum('PEPE-USD', candles, 10);
    expect(result!.tooExtended).toBe(true);
    expect(result!.reasons).toContain('trop étendu pour entrer');
  });

  it("n'est pas trop étendue exactement au seuil", () => {
    const candles = flatCandles();
    candles[candles.length - 1] = { close: 100 + 10 * MAX_ENTRY_EXTENSION_ATR, volume: 10 };
    const result = computeMomentum('PEPE-USD', candles, 10);
    expect(result!.tooExtended).toBe(false);
  });

  it('borne le score entre 0 et 100', () => {
    const candles = flatCandles();
    candles[candles.length - 1] = { close: 10000, volume: 100000 };
    const result = computeMomentum('X-USD', candles, 0.01);
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(100);
  });
});

describe('helpers', () => {
  it('pctChange gère un point de départ nul sans exploser', () => {
    expect(pctChange(0, 10)).toBe(0);
  });

  it('median sur un nombre pair de valeurs', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('buildUniverse', () => {
  const filter: UniverseFilter = {
    quoteCurrency: 'USD',
    minQuoteVolume24h: 500_000,
    maxSpreadPct: 0.5,
    excludedSymbols: ['SCAM-USD'],
  };

  const candidate = (symbol: string, vol: number, spread = 0.1): ScanCandidate => ({
    symbol, lastPrice: 1, quoteVolume24h: vol, spreadPct: spread,
  });

  it('écarte les paires sous le plancher de liquidité', () => {
    const { retained, rejected } = buildUniverse([candidate('TINY-USD', 1000)], filter);
    expect(retained).toHaveLength(0);
    expect(rejected[0].reason).toBe('volume_trop_faible');
  });

  it('écarte les produits à effet de levier', () => {
    const { rejected } = buildUniverse([candidate('BTC3L-USD', 10_000_000)], filter);
    expect(rejected[0].reason).toBe('leveraged');
  });

  it('écarte une autre devise de cotation', () => {
    const { rejected } = buildUniverse([candidate('BTC-EUR', 10_000_000)], filter);
    expect(rejected[0].reason).toBe('quote_currency');
  });

  it('écarte un carnet trop large', () => {
    const { rejected } = buildUniverse([candidate('THIN-USD', 10_000_000, 2)], filter);
    expect(rejected[0].reason).toBe('spread_trop_large');
  });

  it('respecte la liste d\'exclusion manuelle', () => {
    const { rejected } = buildUniverse([candidate('SCAM-USD', 10_000_000)], filter);
    expect(rejected[0].reason).toBe('exclu_manuellement');
  });

  it('retient une paire liquide et propre', () => {
    const { retained } = buildUniverse([candidate('SOL-USD', 10_000_000)], filter);
    expect(retained.map(c => c.symbol)).toEqual(['SOL-USD']);
  });
});

describe('spreadAcceptable', () => {
  it('refuse un écart au-dessus du maximum', () => {
    expect(spreadAcceptable(1.2, 0.5)).toBe(false);
  });
  it('accepte un écart sous le maximum', () => {
    expect(spreadAcceptable(0.2, 0.5)).toBe(true);
  });
  it('refuse une valeur aberrante', () => {
    expect(spreadAcceptable(Number.NaN, 0.5)).toBe(false);
  });
});

describe('splitSymbol', () => {
  it('sépare base et cotation', () => {
    expect(splitSymbol('BTC-USD')).toEqual(['BTC', 'USD']);
  });
});
