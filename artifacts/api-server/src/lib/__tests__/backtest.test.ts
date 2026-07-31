/**
 * Tests du moteur de backtest — chronologie intrabar et priorité des sorties.
 * Le module signals est mocké : le score de chaque barre est contrôlé par son close.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { scoreByClose } = vi.hoisted(() => ({ scoreByClose: new Map<number, number>() }));

vi.mock("../signals", () => ({
  computeIndicators: (h: unknown) => h,
  analyzeTradingSignals: (_data: unknown, close: number) => ({
    score: scoreByClose.get(close) ?? 0,
    overall: "NEUTRE",
    signals: [],
  }),
}));

import { runBacktest, type BacktestParams } from "../backtest";
import type { OHLCPoint } from "../patternDetect";

const WARMUP = 55;

function bar(i: number, close: number, low?: number, high?: number, open?: number): OHLCPoint {
  return {
    date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
    open: open ?? close,
    high: high ?? close,
    low: low ?? close,
    close,
    volume: 1000,
  };
}

/** 55 barres de warmup à close=10 (score 0), puis les barres du scénario. */
function makeHistory(scenario: OHLCPoint[]): OHLCPoint[] {
  const warmup = Array.from({ length: WARMUP }, (_, i) => bar(i, 10));
  return [...warmup, ...scenario.map((b, j) => ({ ...b, date: bar(WARMUP + j, 0).date }))];
}

function run(scenario: OHLCPoint[], overrides: Partial<BacktestParams> = {}) {
  return runBacktest({
    history: makeHistory(scenario),
    minScore: 60,
    sideMode: "buy",
    ...overrides,
  });
}

beforeEach(() => {
  scoreByClose.clear();
});

describe("runBacktest — entrées et sorties de base", () => {
  it("ouvre une position longue au close quand le score atteint minScore", () => {
    scoreByClose.set(100, 70);
    const res = run([bar(0, 100), bar(1, 101), bar(2, 102)]);
    expect(res.totalTrades).toBe(1);
    expect(res.trades[0].side).toBe("long");
    expect(res.trades[0].entryPrice).toBe(100);
    expect(res.trades[0].exitReason).toBe("end"); // clôturée au dernier prix
    expect(res.trades[0].exitPrice).toBe(102);
  });

  it("n'ouvre rien sous le seuil", () => {
    scoreByClose.set(100, 59);
    const res = run([bar(0, 100), bar(1, 101)]);
    expect(res.totalTrades).toBe(0);
  });

  it("sort sur signal inverse fort", () => {
    scoreByClose.set(100, 70);
    scoreByClose.set(95, -70);
    const res = run([bar(0, 100), bar(1, 95), bar(2, 96)]);
    expect(res.totalTrades).toBe(1);
    expect(res.trades[0].exitReason).toBe("signal");
    expect(res.trades[0].exitPrice).toBe(95);
    expect(res.trades[0].pnlPct).toBeCloseTo(-5);
  });
});

describe("runBacktest — stop-loss intrabar", () => {
  it("déclenche le stop au prix du stop quand le low le franchit", () => {
    scoreByClose.set(100, 70);
    // SL 5% → stop à 95 ; barre suivante low=94
    const res = run([bar(0, 100), bar(1, 97, 94, 98)], { stopLossPct: 5 });
    expect(res.totalTrades).toBe(1);
    expect(res.trades[0].exitReason).toBe("stop_loss");
    expect(res.trades[0].exitPrice).toBeCloseTo(95);
    expect(res.trades[0].pnlPct).toBeCloseTo(-5);
  });

  it("priorité pessimiste : stop avant take-profit sur la même barre", () => {
    scoreByClose.set(100, 70);
    // stop 95, TP 103 ; la barre touche les deux (low 94, high 104)
    const res = run([bar(0, 100), bar(1, 100, 94, 104)], { stopLossPct: 5, takeProfitPct: 3 });
    expect(res.trades[0].exitReason).toBe("stop_loss");
    expect(res.trades[0].exitPrice).toBeCloseTo(95);
  });

  it("take-profit déclenché seul au prix cible", () => {
    scoreByClose.set(100, 70);
    const res = run([bar(0, 100), bar(1, 102, 100, 104)], { stopLossPct: 5, takeProfitPct: 3 });
    expect(res.trades[0].exitReason).toBe("take_profit");
    expect(res.trades[0].exitPrice).toBeCloseTo(103);
  });
});

describe("runBacktest — trailing stop (chronologie sans lookahead)", () => {
  it("n'utilise PAS le high du jour même : le mark est mis à jour après l'évaluation", () => {
    scoreByClose.set(100, 70);
    // Entrée à 100 (mark=100). Barre 1 : high 120, low 96 — trailing inactif
    // (mark pas encore > entrée) → pas de sortie ; mark devient 120 APRÈS.
    // Barre 2 : low 115 ≤ 120×0.96 = 115.2 → trailing à 115.2.
    const res = run(
      [bar(0, 100), bar(1, 118, 96, 120), bar(2, 117, 115, 118)],
      { trailingStopPct: 4 },
    );
    expect(res.totalTrades).toBe(1);
    expect(res.trades[0].exitReason).toBe("trailing_stop");
    expect(res.trades[0].exitPrice).toBeCloseTo(115.2);
  });

  it("ne se déclenche pas tant que le mark n'a pas dépassé le prix d'entrée", () => {
    scoreByClose.set(100, 70);
    // Le prix ne fait que baisser : trailing jamais armé (mark = entrée), pas de SL → "end"
    const res = run([bar(0, 100), bar(1, 98, 97, 99), bar(2, 96, 95, 97)], { trailingStopPct: 2 });
    expect(res.trades[0].exitReason).toBe("end");
  });

  it("priorité : stop-loss avant trailing sur la même barre", () => {
    scoreByClose.set(100, 70);
    // Barre 1 monte à 110 (arme le trailing). Barre 2 : low 89 franchit
    // le stop (90) ET le trailing (110×0.96=105.6) → stop_loss gagne.
    const res = run(
      [bar(0, 100), bar(1, 109, 100, 110), bar(2, 92, 89, 106)],
      { stopLossPct: 10, trailingStopPct: 4 },
    );
    expect(res.trades[0].exitReason).toBe("stop_loss");
    expect(res.trades[0].exitPrice).toBeCloseTo(90);
  });

  it("priorité : trailing avant take-profit sur la même barre", () => {
    scoreByClose.set(100, 70);
    // Barre 1 monte à 110 (arme le trailing, trail=105.6). TP 12% → 112.
    // Barre 2 : low 105 ≤ 105.6 ET high 113 ≥ 112 → trailing gagne.
    const res = run(
      [bar(0, 100), bar(1, 109, 100, 110), bar(2, 110, 105, 113)],
      { trailingStopPct: 4, takeProfitPct: 12 },
    );
    expect(res.trades[0].exitReason).toBe("trailing_stop");
    expect(res.trades[0].exitPrice).toBeCloseTo(105.6);
  });
});

describe("runBacktest — positions short", () => {
  it("ouvre un short sur score fortement négatif et inverse le pnl", () => {
    scoreByClose.set(100, -70);
    const res = run([bar(0, 100), bar(1, 90), bar(2, 90)], { sideMode: "sell" });
    expect(res.trades[0].side).toBe("short");
    expect(res.trades[0].pnlPct).toBeCloseTo(10); // baisse de 10 % = gain de 10 %
  });

  it("le stop d'un short est AU-DESSUS de l'entrée et se déclenche sur le high", () => {
    scoreByClose.set(100, -70);
    // SL 5% short → stop à 105 ; high 106 le franchit
    const res = run([bar(0, 100), bar(1, 103, 101, 106)], { sideMode: "sell", stopLossPct: 5 });
    expect(res.trades[0].exitReason).toBe("stop_loss");
    expect(res.trades[0].exitPrice).toBeCloseTo(105);
    expect(res.trades[0].pnlPct).toBeCloseTo(-5);
  });

  it("le trailing d'un short suit le plus-bas et sort sur le rebond", () => {
    scoreByClose.set(100, -70);
    // Barre 1 : low 90 (mark → 90 après évaluation). Barre 2 : high 94 ≥ 90×1.04=93.6.
    const res = run(
      [bar(0, 100), bar(1, 91, 90, 100), bar(2, 93, 91, 94)],
      { sideMode: "sell", trailingStopPct: 4 },
    );
    expect(res.trades[0].exitReason).toBe("trailing_stop");
    expect(res.trades[0].exitPrice).toBeCloseTo(93.6);
    expect(res.trades[0].pnlPct).toBeCloseTo(((100 - 93.6) / 100) * 100);
  });
});

describe("runBacktest — cooldown et statistiques", () => {
  it("respecte cooldownBars entre deux entrées", () => {
    scoreByClose.set(100, 70);
    scoreByClose.set(95, -70); // sortie signal
    scoreByClose.set(101, 70); // ré-entrée potentielle
    // Sortie à la barre i, ré-entrée bloquée pendant cooldownBars barres
    const res = run(
      [bar(0, 100), bar(1, 95), bar(2, 101), bar(3, 101), bar(4, 101), bar(5, 102)],
      { cooldownBars: 2 },
    );
    // barre 2 (i-lastExit=1 < 2) refusée ; barre 3 (=2) acceptée
    expect(res.totalTrades).toBe(2);
    expect(res.trades[1].entryPrice).toBe(101);
  });

  it("calcule winRate et rendement cumulé", () => {
    scoreByClose.set(100, 70);
    scoreByClose.set(110, -70); // sortie +10 %
    const res = run([bar(0, 100), bar(1, 110), bar(2, 110)]);
    expect(res.wins).toBe(1);
    expect(res.winRate).toBe(1);
    expect(res.totalReturnPct).toBeCloseTo(10);
  });
});
