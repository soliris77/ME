/**
 * Tests de la vue « risque global » — calculs purs (lib/globalRisk).
 * Vérifie le prix stop effectif (fixe vs trailing), la perte si tous les
 * stops sautent, les positions non protégées et l'agrégation d'exposition.
 */
import { describe, it, expect } from "vitest";
import {
  effectiveStopPrice, riskIfStopHit, computePositionRisk,
  computeGlobalRisk, aggregateExposure, guessCurrency,
  type StopPositionInput,
} from "../globalRisk";

function autoPos(over: Partial<StopPositionInput> = {}): StopPositionInput {
  return {
    source: "auto_trader",
    refId: 1,
    symbol: "AAPL",
    quantity: 10,
    entryPrice: 100,
    currentPrice: 110,
    stopLossPct: 5,
    trailingStopPct: null,
    highWaterMark: null,
    stopPrice: null,
    ...over,
  };
}

describe("effectiveStopPrice", () => {
  it("stop-loss fixe : entry × (1 − pct/100)", () => {
    expect(effectiveStopPrice(autoPos())).toBeCloseTo(95);
  });

  it("trailing armé (hwm > entry) : retient le plus haut des deux stops", () => {
    const p = autoPos({ trailingStopPct: 4, highWaterMark: 120 });
    // fixe = 95, trailing = 120 × 0.96 = 115.2 → 115.2
    expect(effectiveStopPrice(p)).toBeCloseTo(115.2);
  });

  it("trailing non armé (hwm ≤ entry) : seul le stop fixe compte", () => {
    const p = autoPos({ trailingStopPct: 4, highWaterMark: 100 });
    expect(effectiveStopPrice(p)).toBeCloseTo(95);
  });

  it("aucun stop → null (position non protégée)", () => {
    expect(effectiveStopPrice(autoPos({ stopLossPct: null }))).toBeNull();
  });

  it("ordre stop courtier : utilise le stopPrice explicite", () => {
    const p = autoPos({ source: "stop_order", stopPrice: 92, stopLossPct: null });
    expect(effectiveStopPrice(p)).toBe(92);
  });
});

describe("riskIfStopHit", () => {
  it("perte = (prix actuel − stop) × quantité", () => {
    expect(riskIfStopHit(110, 95, 10)).toBeCloseTo(150);
  });
  it("prix déjà sous le stop → perte restante 0 (jamais négative)", () => {
    expect(riskIfStopHit(90, 95, 10)).toBe(0);
  });
  it("cotation absente → null", () => {
    expect(riskIfStopHit(null, 95, 10)).toBeNull();
  });
});

describe("computePositionRisk", () => {
  it("position sans stop = non protégée avec valeur de marché", () => {
    const r = computePositionRisk(autoPos({ stopLossPct: null }));
    expect(r.unprotected).toBe(true);
    expect(r.riskAmount).toBeNull();
    expect(r.marketValue).toBeCloseTo(1100);
  });
});

describe("computeGlobalRisk", () => {
  it("somme les risques et compte les positions non protégées", () => {
    const result = computeGlobalRisk(
      [
        autoPos(), // risque 150
        autoPos({ refId: 2, symbol: "MSFT", quantity: 5, entryPrice: 200, currentPrice: 210, stopLossPct: 10 }), // stop 180 → risque 150
        autoPos({ refId: 3, symbol: "SHOP.TO", stopLossPct: null, currentPrice: 50, quantity: 4 }), // non protégée, valeur 200
      ],
      [
        { symbol: "AAPL", value: 1100, currency: "USD" },
        { symbol: "MSFT", value: 1050, currency: "USD" },
        { symbol: "SHOP.TO", value: 200, currency: "CAD" },
      ],
    );
    expect(result.totalRiskIfAllStopsHit).toBeCloseTo(300);
    expect(result.unprotectedCount).toBe(1);
    expect(result.unprotectedValue).toBeCloseTo(200);
    expect(result.exposure.total).toBeCloseTo(2350);
    expect(result.exposure.bySymbol[0].symbol).toBe("AAPL");
    const cad = result.exposure.byCurrency.find((c) => c.currency === "CAD");
    expect(cad?.value).toBeCloseTo(200);
    expect(cad?.pct).toBeCloseTo((200 / 2350) * 100);
  });
});

describe("aggregateExposure", () => {
  it("fusionne les doublons de symbole et ignore les valeurs nulles/négatives", () => {
    const e = aggregateExposure([
      { symbol: "AAPL", value: 100, currency: "USD" },
      { symbol: "AAPL", value: 50, currency: "USD" },
      { symbol: "X", value: 0, currency: "USD" },
      { symbol: "Y", value: -5, currency: "USD" },
    ]);
    expect(e.bySymbol).toHaveLength(1);
    expect(e.bySymbol[0].value).toBe(150);
    expect(e.bySymbol[0].pct).toBe(100);
  });
});

describe("guessCurrency", () => {
  it("suffixes canadiens → CAD, sinon USD", () => {
    expect(guessCurrency("SHOP.TO")).toBe("CAD");
    expect(guessCurrency("wcp.v")).toBe("CAD");
    expect(guessCurrency("AAPL")).toBe("USD");
  });
});
