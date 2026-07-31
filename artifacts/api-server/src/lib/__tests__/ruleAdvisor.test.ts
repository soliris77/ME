/**
 * Tests unitaires du conseiller de règles (moteur LOCAL, pur, déterministe).
 */
import { describe, it, expect } from "vitest";
import {
  buildSuggestions,
  type AdvisorInput,
  type AdvisorSignal,
} from "../ruleAdvisor";

function baseInput(over: Partial<AdvisorInput> = {}): AdvisorInput {
  return {
    positions: [],
    watchlistSymbols: [],
    existingRules: [],
    signals: new Map<string, AdvisorSignal>(),
    riskSettings: { maxOrderValue: 5000, maxPortfolioExposure: 25000 },
    ...over,
  };
}

describe("buildSuggestions — heuristiques du conseiller", () => {
  it("données vides → aucune suggestion", () => {
    expect(buildSuggestions(baseInput())).toEqual([]);
  });

  it("position détenue sans protection → suggère une règle de stop (VENTE)", () => {
    const out = buildSuggestions(baseInput({
      // AAPL = 3000 / 15000 = 20 % (sous le seuil de concentration) → carte 'protect'.
      positions: [
        { symbol: "AAPL", value: 3000, price: 150 },
        { symbol: "SPY", value: 12000, price: 500 },
      ],
      // SPY déjà protégé pour isoler la carte AAPL.
      existingRules: [{ symbol: "SPY", sideMode: "sell", enabled: true, stopLossPct: "5" }],
    }));
    const s = out.find((x) => x.kind === "protect");
    expect(s).toBeDefined();
    expect(s!.prefill.symbol).toBe("AAPL");
    expect(s!.prefill.sideMode).toBe("sell");
    expect(s!.prefill.stopLossPct).toBeGreaterThan(0);
    expect(s!.explanation).toMatch(/stop|protection/i);
  });

  // Positions de complément pour garder AAPL sous le seuil de concentration (20 %).
  const filler = [{ symbol: "SPY", value: 12000, price: 500 }];
  const fillerRule = { symbol: "SPY", sideMode: "sell" as const, enabled: true, stopLossPct: "5" };

  it("position déjà protégée par une règle active → PAS de suggestion de protection", () => {
    const out = buildSuggestions(baseInput({
      positions: [{ symbol: "AAPL", value: 3000, price: 150 }, ...filler],
      existingRules: [{ symbol: "AAPL", sideMode: "sell", enabled: true, stopLossPct: "5" }, fillerRule],
    }));
    expect(out.find((x) => x.prefill.symbol === "AAPL")).toBeUndefined();
  });

  it("règle d'achat existante (autre sens) → suggère quand même la protection", () => {
    const out = buildSuggestions(baseInput({
      positions: [{ symbol: "AAPL", value: 3000, price: 150 }, ...filler],
      // Règle d'ACHAT existante (autre sens) → n'empêche pas une suggestion de protection.
      existingRules: [{ symbol: "AAPL", sideMode: "buy", enabled: true }, fillerRule],
    }));
    expect(out.find((x) => x.kind === "protect" && x.prefill.symbol === "AAPL")).toBeDefined();
  });

  it("doublon : règle de vente déjà présente → aucune suggestion de vente pour ce symbole", () => {
    const out = buildSuggestions(baseInput({
      positions: [{ symbol: "AAPL", value: 3000, price: 150 }, ...filler],
      existingRules: [{ symbol: "AAPL", sideMode: "sell", enabled: true }, fillerRule],
    }));
    expect(out.every((x) => !(x.prefill.symbol === "AAPL" && x.prefill.sideMode === "sell"))).toBe(true);
  });

  it("concentration : un symbole > 30 % du portefeuille → suggère une limite de risque", () => {
    const out = buildSuggestions(baseInput({
      // NVDA = 8000 / 10000 = 80 % du portefeuille.
      positions: [
        { symbol: "NVDA", value: 8000, price: 800 },
        { symbol: "MSFT", value: 2000, price: 400 },
      ],
    }));
    const s = out.find((x) => x.kind === "concentration");
    expect(s).toBeDefined();
    expect(s!.prefill.symbol).toBe("NVDA");
    expect(s!.explanation).toMatch(/concentration|portefeuille|%/i);
    // Un symbole concentré reçoit une carte 'concentration', pas une 'protect'.
    expect(out.find((x) => x.kind === "protect" && x.prefill.symbol === "NVDA")).toBeUndefined();
  });

  it("concentration déjà couverte par une règle de vente → pas de doublon", () => {
    const out = buildSuggestions(baseInput({
      positions: [
        { symbol: "NVDA", value: 8000, price: 800 },
        { symbol: "MSFT", value: 2000, price: 400 },
      ],
      existingRules: [{ symbol: "NVDA", sideMode: "sell", enabled: true, stopLossPct: "5" }],
    }));
    expect(out.find((x) => x.prefill.symbol === "NVDA")).toBeUndefined();
  });

  it("watchlist avec signal fort et aucune règle d'achat → suggère un ACHAT prudent", () => {
    const signals = new Map<string, AdvisorSignal>([["TSLA", { score: 75, overall: "FORT ACHAT", price: 100 }]]);
    const out = buildSuggestions(baseInput({
      watchlistSymbols: ["TSLA"],
      signals,
    }));
    const s = out.find((x) => x.kind === "entry");
    expect(s).toBeDefined();
    expect(s!.prefill.symbol).toBe("TSLA");
    expect(s!.prefill.sideMode).toBe("buy");
    expect(s!.prefill.minScore).toBeGreaterThanOrEqual(60);
  });

  it("watchlist avec signal faible → aucune suggestion d'achat", () => {
    const signals = new Map<string, AdvisorSignal>([["TSLA", { score: 20, price: 100 }]]);
    const out = buildSuggestions(baseInput({ watchlistSymbols: ["TSLA"], signals }));
    expect(out.find((x) => x.kind === "entry")).toBeUndefined();
  });

  it("watchlist avec signal fort mais règle d'achat déjà présente → pas de doublon", () => {
    const signals = new Map<string, AdvisorSignal>([["TSLA", { score: 75, price: 100 }]]);
    const out = buildSuggestions(baseInput({
      watchlistSymbols: ["TSLA"],
      signals,
      existingRules: [{ symbol: "TSLA", sideMode: "buy", enabled: true }],
    }));
    expect(out.find((x) => x.kind === "entry")).toBeUndefined();
  });

  it("quantité d'achat cohérente avec maxOrderValue (conservatrice, ≥ 1)", () => {
    const signals = new Map<string, AdvisorSignal>([["TSLA", { score: 80, price: 100 }]]);
    const out = buildSuggestions(baseInput({
      watchlistSymbols: ["TSLA"],
      signals,
      riskSettings: { maxOrderValue: 5000, maxPortfolioExposure: 25000 },
    }));
    const s = out.find((x) => x.kind === "entry");
    expect(s).toBeDefined();
    // budget = 25 % de 5000 = 1250 ; floor(1250 / 100) = 12 titres.
    expect(s!.prefill.quantity).toBe(12);
    // Le prefill ne dépasse jamais le plafond d'ordre.
    expect(s!.prefill.quantity * 100).toBeLessThanOrEqual(5000);
  });

  it("FAIL-CLOSED : signal d'achat sans prix connu → aucune suggestion d'achat", () => {
    const signals = new Map<string, AdvisorSignal>([["TSLA", { score: 80 }]]); // pas de price
    const out = buildSuggestions(baseInput({ watchlistSymbols: ["TSLA"], signals }));
    expect(out.find((x) => x.kind === "entry")).toBeUndefined();
  });

  it("FAIL-CLOSED : prix unitaire > maxOrderValue (budget < 1 titre) → aucune suggestion d'achat", () => {
    // Prix 6000 $, plafond 5000 $ → budget prudent 1250 $ < 1 titre → rien.
    const signals = new Map<string, AdvisorSignal>([["BRK", { score: 90, price: 6000 }]]);
    const out = buildSuggestions(baseInput({
      watchlistSymbols: ["BRK"],
      signals,
      riskSettings: { maxOrderValue: 5000, maxPortfolioExposure: 25000 },
    }));
    expect(out.find((x) => x.kind === "entry")).toBeUndefined();
  });

  it("agrégation : même symbole détenu sur deux comptes → une seule suggestion", () => {
    const out = buildSuggestions(baseInput({
      // AAPL apparaît deux fois (deux comptes) ; SPY protégé pour garder AAPL < 30 %.
      positions: [
        { symbol: "AAPL", value: 1500, price: 150 },
        { symbol: "AAPL", value: 1500, price: 150 },
        { symbol: "SPY", value: 12000, price: 500 },
      ],
      existingRules: [{ symbol: "SPY", sideMode: "sell", enabled: true, stopLossPct: "5" }],
    }));
    const aaplCards = out.filter((x) => x.prefill.symbol === "AAPL");
    expect(aaplCards).toHaveLength(1);
  });

  it("ne renvoie jamais plus de 3 suggestions et priorise protect > concentration > entry", () => {
    const signals = new Map<string, AdvisorSignal>([
      ["TSLA", { score: 80, price: 100 }],
      ["AMD", { score: 70, price: 120 }],
    ]);
    const out = buildSuggestions(baseInput({
      positions: [
        { symbol: "AAPL", value: 1000, price: 150 },
        { symbol: "GOOG", value: 1000, price: 130 },
      ],
      watchlistSymbols: ["TSLA", "AMD"],
      signals,
    }));
    expect(out.length).toBeLessThanOrEqual(3);
    // Les cartes de protection (protect/concentration) passent avant les 'entry'.
    expect(out[0].kind).not.toBe("entry");
  });

  it("toutes les suggestions ont un titre, une explication en français et un prefill complet", () => {
    const signals = new Map<string, AdvisorSignal>([["TSLA", { score: 80, price: 100 }]]);
    const out = buildSuggestions(baseInput({
      positions: [{ symbol: "AAPL", value: 3000, price: 150 }],
      watchlistSymbols: ["TSLA"],
      signals,
    }));
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(s.title.trim().length).toBeGreaterThan(0);
      expect(s.explanation.trim().length).toBeGreaterThan(0);
      expect(s.prefill.symbol).toMatch(/^[A-Z]/);
      expect(["buy", "sell", "both"]).toContain(s.prefill.sideMode);
      expect(s.prefill.minScore).toBeGreaterThanOrEqual(10);
      expect(s.prefill.quantity).toBeGreaterThan(0);
    }
  });
});
