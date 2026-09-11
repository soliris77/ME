import { describe, it, expect } from 'vitest';
import {
  HORIZONS_MINUTES,
  dueHorizons,
  evaluateHorizon,
  horizonAbandoned,
} from '../src/outcomes';
import type { OutcomeCandle } from '../src/outcomes';

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const MIN = 60_000;

function candle(minutesAfter: number, low: number, high: number, close: number): OutcomeCandle {
  return { timestamp: T0 + minutesAfter * MIN, low, high, close };
}

describe('dueHorizons', () => {
  it("ne retourne rien tant qu'aucun horizon n'est échu", () => {
    expect(dueHorizons(T0, T0 + 30 * MIN)).toEqual([]);
  });

  it("retourne l'horizon 1 h une fois échu", () => {
    expect(dueHorizons(T0, T0 + 61 * MIN)).toEqual([60]);
  });

  it('ne réévalue pas un horizon déjà écrit', () => {
    expect(dueHorizons(T0, T0 + 5 * 60 * MIN, [60])).toEqual([240]);
  });

  it('retourne tous les horizons après 24 h', () => {
    expect(dueHorizons(T0, T0 + 25 * 60 * MIN)).toEqual([...HORIZONS_MINUTES]);
  });
});

describe('evaluateHorizon', () => {
  it('mesure le meilleur et le pire point, pas seulement la clôture', () => {
    // Le prix monte à +20 %, retombe à -10 %, clôture à +5 %.
    const candles = [
      candle(15, 100, 120, 118),
      candle(30, 90, 119, 95),
      candle(45, 94, 106, 105),
    ];
    const result = evaluateHorizon(100, T0, 60, candles);
    expect(result).not.toBeNull();
    expect(result!.maxFavorablePct).toBeCloseTo(20, 4);
    expect(result!.maxAdversePct).toBeCloseTo(-10, 4);
    expect(result!.returnPct).toBeCloseTo(5, 4);
    expect(result!.priceAtHorizon).toBe(105);
    expect(result!.candlesUsed).toBe(3);
  });

  it("ignore les bougies hors de la fenêtre de l'horizon", () => {
    const candles = [
      candle(-15, 50, 200, 60),   // avant la détection
      candle(30, 98, 104, 102),
      candle(120, 10, 500, 400),  // après l'horizon 1 h
    ];
    const result = evaluateHorizon(100, T0, 60, candles);
    expect(result!.candlesUsed).toBe(1);
    expect(result!.maxFavorablePct).toBeCloseTo(4, 4);
    expect(result!.maxAdversePct).toBeCloseTo(-2, 4);
  });

  it('borne le meilleur point à 0 quand le prix ne monte jamais', () => {
    const result = evaluateHorizon(100, T0, 60, [candle(30, 80, 95, 85)]);
    expect(result!.maxFavorablePct).toBe(0);
    expect(result!.maxAdversePct).toBeCloseTo(-20, 4);
  });

  it('borne le pire point à 0 quand le prix ne descend jamais', () => {
    const result = evaluateHorizon(100, T0, 60, [candle(30, 101, 110, 108)]);
    expect(result!.maxAdversePct).toBe(0);
  });

  it('retourne null sans donnée dans la fenêtre', () => {
    expect(evaluateHorizon(100, T0, 60, [])).toBeNull();
    expect(evaluateHorizon(100, T0, 60, [candle(500, 90, 110, 100)])).toBeNull();
  });

  it('refuse un prix de détection aberrant', () => {
    expect(evaluateHorizon(0, T0, 60, [candle(30, 90, 110, 100)])).toBeNull();
    expect(evaluateHorizon(Number.NaN, T0, 60, [candle(30, 90, 110, 100)])).toBeNull();
  });
});

describe('horizonAbandoned', () => {
  it("n'abandonne pas un horizon récemment échu", () => {
    expect(horizonAbandoned(T0, 60, T0 + 3 * 60 * MIN)).toBe(false);
  });

  it('abandonne après le délai de grâce', () => {
    expect(horizonAbandoned(T0, 60, T0 + 8 * 24 * 60 * MIN)).toBe(true);
  });
});
