/**
 * Tests du score de discipline — calcul pur (computeDisciplineReport),
 * sans base de données : les ordres sont fournis directement.
 */
import { describe, it, expect } from "vitest";
import {
  computeDisciplineReport,
  type DisciplineOrderInput,
} from "../discipline";

const CAPITAL = 25_000;

let nextId = 1;
function order(partial: Partial<Omit<DisciplineOrderInput, "createdAt">> & { side: string; price: number; quantity: number; createdAt: string }): DisciplineOrderInput {
  return {
    id: partial.id ?? nextId++,
    symbol: partial.symbol ?? "AAPL",
    side: partial.side,
    orderType: partial.orderType ?? "market",
    mode: partial.mode ?? "paper",
    status: partial.status ?? "filled",
    quantity: partial.quantity,
    price: partial.price,
    fillPrice: partial.fillPrice ?? null,
    createdAt: new Date(partial.createdAt),
  };
}

function report(orders: DisciplineOrderInput[], autoStop = new Map<number, number>()) {
  return computeDisciplineReport({ orders, autoStopPctByOrderId: autoStop, capitalBase: CAPITAL });
}

describe("computeDisciplineReport", () => {
  it("renvoie un score null sans trade clôturé", () => {
    const r = report([order({ side: "buy", price: 100, quantity: 5, createdAt: "2026-07-01" })]);
    expect(r.totalTrades).toBe(0);
    expect(r.score).toBeNull();
    expect(r.components.every((c) => c.score === null)).toBe(true);
  });

  it("trade discipliné : stop en place, risque ≤ 1 %, petite position, gain ≥ 2R", () => {
    // Achat 10 × 100 $ (position 4 % du capital), stop à 75 $ → risque 250 $ = 1 % du capital.
    // Vente à 150 $ → gain 500 $ = 2R.
    const r = report([
      order({ id: 1, side: "buy", price: 100, quantity: 10, createdAt: "2026-07-01T10:00:00Z" }),
      order({ id: 2, side: "sell", orderType: "stop", status: "submitted", price: 75, quantity: 10, createdAt: "2026-07-01T10:05:00Z" }),
      order({ id: 3, side: "sell", price: 150, quantity: 10, createdAt: "2026-07-10T10:00:00Z" }),
    ]);
    expect(r.totalTrades).toBe(1);
    const t = r.trades[0];
    expect(t.stopPrice).toBe(75);
    expect(t.stopSource).toBe("stop_order");
    expect(t.initialRisk).toBe(250);
    expect(t.riskPct).toBeCloseTo(0.01);
    expect(t.realizedR).toBeCloseTo(2);
    expect(t.positionPct).toBeCloseTo(0.04);
    expect(t.reasons).toEqual([]);
    expect(t.score).toBe(100);
    expect(r.score).toBe(100);
    expect(r.disciplinedTrades).toBe(1);
  });

  it("vente sans stop connu → raison listée et composant stop à 0", () => {
    const r = report([
      order({ id: 1, side: "buy", price: 100, quantity: 5, createdAt: "2026-07-01" }),
      order({ id: 2, side: "sell", price: 110, quantity: 5, createdAt: "2026-07-05" }),
    ]);
    const t = r.trades[0];
    expect(t.stopPrice).toBeNull();
    expect(t.reasons.some((x) => x.includes("Aucun stop"))).toBe(true);
    const stopComponent = r.components.find((c) => c.key === "stop")!;
    expect(stopComponent.score).toBe(0);
    expect(r.undisciplinedTrades).toBe(1);
  });

  it("un stop soumis (GTC au repos) prouve la protection mais n'est pas une vente FIFO", () => {
    const r = report([
      order({ id: 1, side: "buy", price: 100, quantity: 5, createdAt: "2026-07-01" }),
      order({ id: 2, side: "sell", orderType: "stop", status: "submitted", price: 95, quantity: 5, createdAt: "2026-07-02" }),
    ]);
    // Pas de vente exécutée : aucune paire clôturée.
    expect(r.totalTrades).toBe(0);
  });

  it("une sortie par ordre stop exécuté = perte contrôlée ~1R, pas d'indiscipline R", () => {
    const r = report([
      order({ id: 1, side: "buy", price: 100, quantity: 10, createdAt: "2026-07-01" }),
      order({ id: 2, side: "sell", orderType: "stop", status: "filled", price: 90, quantity: 10, createdAt: "2026-07-03" }),
    ]);
    const t = r.trades[0];
    expect(t.stopPrice).toBe(90);
    expect(t.realizedR).toBeCloseTo(-1);
    expect(t.reasons.some((x) => x.includes("stop non respecté"))).toBe(false);
  });

  it("risque initial > 2 % du capital → indiscipliné", () => {
    // Achat 100 × 100 $, stop à 90 $ → risque 1000 $ = 4 % du capital.
    const r = report([
      order({ id: 1, side: "buy", price: 100, quantity: 100, createdAt: "2026-07-01T10:00:00Z" }),
      order({ id: 2, side: "sell", orderType: "stop", status: "submitted", price: 90, quantity: 100, createdAt: "2026-07-01T11:00:00Z" }),
      order({ id: 3, side: "sell", price: 120, quantity: 100, createdAt: "2026-07-08" }),
    ]);
    const t = r.trades[0];
    expect(t.riskPct).toBeCloseTo(0.04);
    expect(t.reasons.some((x) => x.includes("> 2 %"))).toBe(true);
    // Position 10 000 $ = 40 % du capital → aussi trop grosse.
    expect(t.reasons.some((x) => x.includes("> 20 %"))).toBe(true);
  });

  it("gain plus petit que le risque pris (0 ≤ R < 1) → raison R/R < 1", () => {
    // Risque 10 $/action, gain 5 $/action → R = 0.5
    const r = report([
      order({ id: 1, side: "buy", price: 100, quantity: 5, createdAt: "2026-07-01T10:00:00Z" }),
      order({ id: 2, side: "sell", orderType: "stop", status: "submitted", price: 90, quantity: 5, createdAt: "2026-07-01T11:00:00Z" }),
      order({ id: 3, side: "sell", price: 105, quantity: 5, createdAt: "2026-07-04" }),
    ]);
    const t = r.trades[0];
    expect(t.realizedR).toBeCloseTo(0.5);
    expect(t.reasons.some((x) => x.includes("< 1"))).toBe(true);
  });

  it("perte dépassant nettement le risque prévu → « stop non respecté »", () => {
    // Stop à 95 (risque 5 $/action) mais vente marché à 80 → R = −4.
    const r = report([
      order({ id: 1, side: "buy", price: 100, quantity: 5, createdAt: "2026-07-01T10:00:00Z" }),
      order({ id: 2, side: "sell", orderType: "stop", status: "cancelled", price: 95, quantity: 5, createdAt: "2026-07-01T11:00:00Z" }),
      order({ id: 3, side: "sell", price: 80, quantity: 5, createdAt: "2026-07-06" }),
    ]);
    const t = r.trades[0];
    expect(t.realizedR).toBeCloseTo(-4);
    expect(t.reasons.some((x) => x.includes("stop non respecté"))).toBe(true);
  });

  it("stop implicite via règle d'auto-trader (stopLossPct)", () => {
    const autoStop = new Map<number, number>([[1, 5]]); // règle : stop 5 % sous l'entrée
    const r = report(
      [
        order({ id: 1, side: "buy", price: 100, quantity: 10, createdAt: "2026-07-01" }),
        order({ id: 2, side: "sell", price: 112, quantity: 10, createdAt: "2026-07-09" }),
      ],
      autoStop,
    );
    const t = r.trades[0];
    expect(t.stopSource).toBe("auto_trader");
    expect(t.stopPrice).toBeCloseTo(95);
    expect(t.initialRisk).toBeCloseTo(50);
    expect(t.realizedR).toBeCloseTo(2.4);
  });

  it("ignore les stops d'un autre symbole ou hors fenêtre entrée→sortie", () => {
    const r = report([
      order({ id: 1, side: "sell", orderType: "stop", status: "submitted", price: 95, quantity: 5, createdAt: "2026-06-20" }), // avant l'achat
      order({ id: 2, side: "buy", price: 100, quantity: 5, createdAt: "2026-07-01" }),
      order({ id: 3, symbol: "TSLA", side: "sell", orderType: "stop", status: "submitted", price: 95, quantity: 5, createdAt: "2026-07-02" }),
      order({ id: 4, side: "sell", price: 110, quantity: 5, createdAt: "2026-07-05" }),
    ]);
    expect(r.trades[0].stopPrice).toBeNull();
  });

  it("un « stop » au-dessus de l'entrée ne compte pas comme protection valide", () => {
    const r = report([
      order({ id: 1, side: "buy", price: 100, quantity: 5, createdAt: "2026-07-01T10:00:00Z" }),
      order({ id: 2, side: "sell", orderType: "stop", status: "submitted", price: 120, quantity: 5, createdAt: "2026-07-01T11:00:00Z" }),
      order({ id: 3, side: "sell", price: 130, quantity: 5, createdAt: "2026-07-05" }),
    ]);
    const t = r.trades[0];
    expect(t.initialRisk).toBeNull();
    expect(t.reasons.some((x) => x.includes("au-dessus du prix d'entrée"))).toBe(true);
  });

  it("en live, un ordre marché simplement « submitted » n'est PAS une exécution", () => {
    const r = report([
      order({ id: 1, side: "buy", mode: "live", status: "filled", price: 100, quantity: 5, createdAt: "2026-07-01" }),
      order({ id: 2, side: "sell", mode: "live", status: "submitted", price: 110, quantity: 5, createdAt: "2026-07-05" }),
    ]);
    expect(r.totalTrades).toBe(0);

    // Une fois le fill confirmé par le courtier, le trade est compté.
    const r2 = report([
      order({ id: 1, side: "buy", mode: "live", status: "filled", price: 100, quantity: 5, createdAt: "2026-07-01" }),
      order({ id: 2, side: "sell", mode: "live", status: "filled", price: 110, quantity: 5, createdAt: "2026-07-05" }),
    ]);
    expect(r2.totalTrades).toBe(1);
  });

  it("utilise le prix d'exécution réel (fillPrice) quand il diffère du prix attendu", () => {
    const r = report([
      order({ id: 1, side: "buy", mode: "live", status: "filled", price: 100, fillPrice: 101, quantity: 10, createdAt: "2026-07-01T10:00:00Z" }),
      order({ id: 2, side: "sell", mode: "live", orderType: "stop", status: "submitted", price: 91, quantity: 10, createdAt: "2026-07-01T10:05:00Z" }),
      order({ id: 3, side: "sell", mode: "live", status: "filled", price: 120, fillPrice: 119.5, quantity: 10, createdAt: "2026-07-08" }),
    ]);
    const t = r.trades[0];
    expect(t.entryPrice).toBe(101);
    expect(t.exitPrice).toBe(119.5);
    expect(t.pnl).toBeCloseTo(185);
    // Risque initial basé sur l'entrée réelle : (101 − 91) × 10 = 100 $
    expect(t.initialRisk).toBeCloseTo(100);
    expect(t.realizedR).toBeCloseTo(1.85);
  });

  it("les modes paper et live ne se mélangent pas dans le FIFO", () => {
    const r = report([
      order({ id: 1, side: "buy", mode: "paper", price: 100, quantity: 5, createdAt: "2026-07-01" }),
      order({ id: 2, side: "sell", mode: "live", price: 110, quantity: 5, createdAt: "2026-07-05" }),
    ]);
    expect(r.totalTrades).toBe(0);
  });

  it("le score agrégé est la moyenne des scores par trade et les poids somment à 100", () => {
    const r = report([
      // Trade parfait
      order({ id: 1, side: "buy", price: 100, quantity: 10, createdAt: "2026-07-01T10:00:00Z" }),
      order({ id: 2, side: "sell", orderType: "stop", status: "submitted", price: 75, quantity: 10, createdAt: "2026-07-01T10:05:00Z" }),
      order({ id: 3, side: "sell", price: 150, quantity: 10, createdAt: "2026-07-02" }),
      // Trade sans stop
      order({ id: 4, symbol: "TSLA", side: "buy", price: 200, quantity: 5, createdAt: "2026-07-03" }),
      order({ id: 5, symbol: "TSLA", side: "sell", price: 210, quantity: 5, createdAt: "2026-07-06" }),
    ]);
    expect(r.totalTrades).toBe(2);
    expect(r.components.reduce((s, c) => s + c.weight, 0)).toBe(100);
    const expected = (r.trades[0].score + r.trades[1].score) / 2;
    expect(r.score).toBeCloseTo(Math.round(expected * 10) / 10, 1);
  });
});
