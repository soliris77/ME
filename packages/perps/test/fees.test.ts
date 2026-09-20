import { describe, expect, it } from "vitest";
import {
  HYPERLIQUID_BASE,
  bareRoundTripFraction,
  proportionalRoundTripFraction,
  roundTripCost,
} from "../src/fees";

describe("barème Hyperliquid", () => {
  it("reprend les taux publiés au niveau 0", () => {
    expect(HYPERLIQUID_BASE.takerFee).toBe(0.00045);
    expect(HYPERLIQUID_BASE.makerRebate).toBe(0.00015);
    expect(HYPERLIQUID_BASE.minOrderValueUsd).toBe(10);
  });

  it("chiffre l'aller-retour au marché à 0,09 %", () => {
    expect(proportionalRoundTripFraction(HYPERLIQUID_BASE)).toBeCloseTo(0.0009, 10);
  });

  it("ne facture aucun frais fixe : rien à payer au réseau", () => {
    expect(HYPERLIQUID_BASE.fixedCostUsdPerSide).toBe(0);
    // Sans frais fixe, le plancher ne dépend pas de la taille.
    expect(bareRoundTripFraction(HYPERLIQUID_BASE, 20)).toBeCloseTo(0.0009, 10);
    expect(bareRoundTripFraction(HYPERLIQUID_BASE, 20000)).toBeCloseTo(0.0009, 10);
  });
});

describe("bareRoundTripFraction avec un frais fixe", () => {
  const onChain = { ...HYPERLIQUID_BASE, takerFee: 0.0006, fixedCostUsdPerSide: 0.5 };

  it("monte quand la position rapetisse", () => {
    // 1,00 $ de gaz sur 1000 $ = 0,10 %, plus 0,12 % de frais = 0,22 %.
    expect(bareRoundTripFraction(onChain, 1000)).toBeCloseTo(0.0022, 10);
    // Le même gaz sur 50 $ = 2 %, plus 0,12 % = 2,12 %.
    expect(bareRoundTripFraction(onChain, 50)).toBeCloseTo(0.0212, 10);
  });

  it("devient infini sur un notionnel nul plutôt que de diviser par zéro", () => {
    expect(bareRoundTripFraction(onChain, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("roundTripCost", () => {
  const base = {
    notionalUsd: 500,
    entryIsTaker: true,
    exitIsTaker: true,
    slippagePerSide: 0,
    fundingPaid: 0,
  };

  it("coûte 0,45 $ sur 500 $ de notionnel, taker des deux côtés", () => {
    const c = roundTripCost(base, HYPERLIQUID_BASE);
    expect(c.entryFeeUsd).toBeCloseTo(0.225, 10);
    expect(c.exitFeeUsd).toBeCloseTo(0.225, 10);
    expect(c.totalUsd).toBeCloseTo(0.45, 10);
    expect(c.totalFraction).toBeCloseTo(0.0009, 10);
  });

  it("rend le rebate maker négatif — il rapporte au lieu de coûter", () => {
    const c = roundTripCost({ ...base, entryIsTaker: false }, HYPERLIQUID_BASE);
    expect(c.entryFeeUsd).toBeCloseTo(-0.075, 10);
    expect(c.totalUsd).toBeLessThan(0.45);
  });

  it("paie le trader quand les deux côtés sont maker", () => {
    const c = roundTripCost(
      { ...base, entryIsTaker: false, exitIsTaker: false },
      HYPERLIQUID_BASE,
    );
    expect(c.totalUsd).toBeLessThan(0);
    expect(c.totalFraction).toBeCloseTo(-0.0003, 10);
  });

  it("compte le slippage sur les deux côtés", () => {
    const c = roundTripCost({ ...base, slippagePerSide: 0.0002 }, HYPERLIQUID_BASE);
    expect(c.slippageUsd).toBeCloseTo(0.2, 10);
    expect(c.totalFraction).toBeCloseTo(0.0013, 10);
  });

  it("ajoute le funding, qui domine sur une position gardée 24 h", () => {
    // 0,01 % par heure pendant 24 h = 0,24 % du notionnel.
    const c = roundTripCost({ ...base, fundingPaid: 0.0024 }, HYPERLIQUID_BASE);
    expect(c.fundingUsd).toBeCloseTo(1.2, 10);
    expect(c.fundingUsd).toBeGreaterThan(c.entryFeeUsd + c.exitFeeUsd);
  });

  it("ne divise pas par zéro sur un notionnel nul", () => {
    const c = roundTripCost({ ...base, notionalUsd: 0 }, HYPERLIQUID_BASE);
    expect(c.totalFraction).toBe(0);
  });

  it("ajoute les deux frais fixes, une fois par côté", () => {
    const onChain = { ...HYPERLIQUID_BASE, fixedCostUsdPerSide: 0.5 };
    const c = roundTripCost(base, onChain);
    expect(c.fixedUsd).toBeCloseTo(1, 10);
    // 0,45 $ de frais proportionnels sur 500 $, plus 1 $ de gaz.
    expect(c.totalUsd).toBeCloseTo(1.45, 10);
    expect(c.totalFraction).toBeCloseTo(0.0029, 10);
  });
});
