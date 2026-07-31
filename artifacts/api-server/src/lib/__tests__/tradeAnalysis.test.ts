/**
 * Tests du moteur d'analyse pédagogique par trade (analyzeDayTrades).
 * ─────────────────────────────────────────────────────────────────────────────
 * Le moteur est pur (aucun accès DB) : on lui passe l'historique d'ordres et
 * les paramètres de risque, il produit 2-4 constats français par ordre exécuté.
 * Les règles doivent refléter EXACTEMENT les garde-fous existants.
 */
import { describe, it, expect } from "vitest";
import { analyzeDayTrades, type AnalyzableOrder } from "../tradeAnalysis";
import type { RiskSettings } from "../settings";

const SETTINGS: RiskSettings = {
  maxOrderValue: 5000,
  maxPortfolioExposure: 25000,
  largeOrderFrictionPct: 0.5,
  maxDailyLossAmount: null,
  updatedAt: "2026-07-30T00:00:00.000Z",
};

// Jeudi 30 juillet 2026 — jour ouvrable sans férié.
const DAY_START = new Date("2026-07-30T00:00:00.000Z");
// 14h30 UTC = 10h30 ET → marché ouvert.
const OPEN_TIME = new Date("2026-07-30T14:30:00.000Z");
// 02h00 UTC = 22h00 ET la veille (mercredi) → marché fermé.
const CLOSED_TIME = new Date("2026-07-30T02:00:00.000Z");

let nextId = 1;
function order(partial: Partial<AnalyzableOrder>): AnalyzableOrder {
  return {
    id: nextId++,
    createdAt: OPEN_TIME,
    symbol: "AAPL",
    side: "BUY",
    quantity: "10",
    orderType: "market",
    status: "simulated",
    fillPrice: "100",
    expectedPrice: null,
    ...partial,
  };
}

describe("analyzeDayTrades", () => {
  it("achat conforme avec stop posé après → 3 constats positifs", () => {
    const buy = order({});
    const stop = order({
      side: "SELL",
      orderType: "stop",
      status: "simulated",
      expectedPrice: "95",
      fillPrice: null,
      createdAt: new Date(OPEN_TIME.getTime() + 60_000),
    });
    const res = analyzeDayTrades([buy, stop], DAY_START, SETTINGS);
    const f = res.get(buy.id)!;
    expect(f).toHaveLength(3);
    expect(f[0].tone).toBe("good");
    expect(f[0].text).toContain("Taille conforme");
    expect(f[0].text).toContain("20 %"); // 1000 $ / 5000 $
    expect(f[1].tone).toBe("good");
    expect(f[1].text).toContain("Stop de protection posé");
    expect(f[2].tone).toBe("good");
    expect(f[2].text).toContain("heures de marché");
  });

  it("achat sans stop → avertissement « aucun stop »", () => {
    const buy = order({});
    const f = analyzeDayTrades([buy], DAY_START, SETTINGS).get(buy.id)!;
    const stopFinding = f.find((x) => x.text.includes("Aucun stop"));
    expect(stopFinding?.tone).toBe("warn");
  });

  it("un stop annulé ne compte pas comme protection", () => {
    const buy = order({});
    const stop = order({
      side: "SELL", orderType: "stop", status: "cancelled",
      expectedPrice: "95", fillPrice: null,
      createdAt: new Date(OPEN_TIME.getTime() + 60_000),
    });
    const f = analyzeDayTrades([buy, stop], DAY_START, SETTINGS).get(buy.id)!;
    expect(f.some((x) => x.text.includes("Aucun stop"))).toBe(true);
  });

  it("un stop posé AVANT l'achat ne protège pas cet achat", () => {
    const stop = order({
      side: "SELL", orderType: "stop", status: "simulated",
      expectedPrice: "95", fillPrice: null,
      createdAt: new Date(OPEN_TIME.getTime() - 60_000),
    });
    const buy = order({});
    const f = analyzeDayTrades([stop, buy], DAY_START, SETTINGS).get(buy.id)!;
    expect(f.some((x) => x.text.includes("Aucun stop"))).toBe(true);
  });

  it("gros ordre au-delà du seuil de friction → avertissement", () => {
    const buy = order({ quantity: "30", fillPrice: "100" }); // 3000 $ > 2500 $ (50 %)
    const f = analyzeDayTrades([buy], DAY_START, SETTINGS).get(buy.id)!;
    expect(f[0].tone).toBe("warn");
    expect(f[0].text).toContain("Gros ordre");
  });

  it("ordre au-dessus de la limite par ordre → avertissement fort", () => {
    const buy = order({ quantity: "60", fillPrice: "100" }); // 6000 $ > 5000 $
    const f = analyzeDayTrades([buy], DAY_START, SETTINGS).get(buy.id)!;
    expect(f[0].tone).toBe("warn");
    expect(f[0].text).toContain("dépasse la limite");
  });

  it("un ordre stop exécuté est félicité comme ordre de protection", () => {
    const stop = order({ side: "SELL", orderType: "stop", status: "filled", fillPrice: "95" });
    const f = analyzeDayTrades([stop], DAY_START, SETTINGS).get(stop.id)!;
    expect(f.some((x) => x.tone === "good" && x.text.includes("Ordre de protection"))).toBe(true);
  });

  it("ordre hors heures de marché → avertissement", () => {
    const buy = order({ createdAt: CLOSED_TIME });
    const f = analyzeDayTrades([buy], DAY_START, SETTINGS).get(buy.id)!;
    expect(f.some((x) => x.tone === "warn" && x.text.includes("hors des heures"))).toBe(true);
  });

  it("trade passé près du coupe-circuit (≥ 80 %) → avertissement de prudence", () => {
    const settings = { ...SETTINGS, maxDailyLossAmount: 100 };
    // Achat la veille à 100, vente aujourd'hui à 91.50 → perte réalisée 85 $ (85 %).
    const oldBuy = order({ createdAt: new Date("2026-07-29T14:30:00.000Z"), quantity: "10", fillPrice: "100" });
    const sell = order({ side: "SELL", quantity: "10", fillPrice: "91.5" });
    const nextBuy = order({ symbol: "MSFT", quantity: "1", fillPrice: "100", createdAt: new Date(OPEN_TIME.getTime() + 120_000) });
    const res = analyzeDayTrades([oldBuy, sell, nextBuy], DAY_START, settings);
    const f = res.get(nextBuy.id)!;
    expect(f.some((x) => x.tone === "warn" && x.text.includes("85 % de la limite"))).toBe(true);
    // La vente elle-même, passée AVANT que la perte soit réalisée, n'est pas avertie.
    expect(res.get(sell.id)!.some((x) => x.text.includes("coupe-circuit"))).toBe(false);
    // L'achat de la veille n'est pas analysé (hors journée).
    expect(res.has(oldBuy.id)).toBe(false);
  });

  it("trade passé alors que la limite est déjà atteinte → avertissement fort", () => {
    const settings = { ...SETTINGS, maxDailyLossAmount: 50 };
    const oldBuy = order({ createdAt: new Date("2026-07-29T14:30:00.000Z"), quantity: "10", fillPrice: "100" });
    const sell = order({ side: "SELL", quantity: "10", fillPrice: "91.5" }); // perte 85 $ > 50 $
    const nextBuy = order({ symbol: "MSFT", quantity: "1", fillPrice: "100", createdAt: new Date(OPEN_TIME.getTime() + 120_000) });
    const f = analyzeDayTrades([oldBuy, sell, nextBuy], DAY_START, settings).get(nextBuy.id)!;
    expect(f.some((x) => x.tone === "warn" && x.text.includes("atteignait déjà la limite"))).toBe(true);
  });

  it("les ordres non exécutés (submitted, rejected) ne sont pas analysés", () => {
    const submitted = order({ status: "submitted" });
    const rejected = order({ status: "rejected" });
    const res = analyzeDayTrades([submitted, rejected], DAY_START, SETTINGS);
    expect(res.size).toBe(0);
  });

  it("jamais plus de 4 constats par trade", () => {
    const settings = { ...SETTINGS, maxDailyLossAmount: 100 };
    const oldBuy = order({ createdAt: new Date("2026-07-29T14:30:00.000Z"), quantity: "10", fillPrice: "100" });
    const sell = order({ side: "SELL", quantity: "10", fillPrice: "91.5" });
    const bigBuy = order({ quantity: "60", fillPrice: "100", createdAt: CLOSED_TIME >= OPEN_TIME ? CLOSED_TIME : new Date(OPEN_TIME.getTime() + 120_000) });
    const res = analyzeDayTrades([oldBuy, sell, bigBuy], DAY_START, settings);
    for (const findings of res.values()) {
      expect(findings.length).toBeGreaterThanOrEqual(2);
      expect(findings.length).toBeLessThanOrEqual(4);
    }
  });
});
