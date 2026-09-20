import { describe, expect, it } from "vitest";
import { liquidationPrice, sizePosition, type SizingInputs } from "../src/sizing";

const base: SizingInputs = {
  equityUsd: 300,
  riskFraction: 0.01,
  entryPrice: 100,
  stopPrice: 97,
  side: "long",
  maxLeverage: 5,
  venueMaxLeverage: 20,
  minOrderValueUsd: 10,
  liquidationBuffer: 2.5,
  maintenanceMarginFraction: 0.025,
};

describe("liquidationPrice", () => {
  it("s'éloigne du prix quand le levier baisse", () => {
    const l2 = liquidationPrice(100, 2, 0.025, "long");
    const l10 = liquidationPrice(100, 10, 0.025, "long");
    expect(l2).toBeLessThan(l10);
    expect(100 - l2).toBeGreaterThan(100 - l10);
  });

  it("place la liquidation au-dessus du prix pour un short", () => {
    expect(liquidationPrice(100, 5, 0.025, "short")).toBeGreaterThan(100);
  });

  it("suit la formule en marge isolée", () => {
    // long, L = 4, mmf = 0,025 → 100 × 0,75 / 0,975
    expect(liquidationPrice(100, 4, 0.025, "long")).toBeCloseTo(76.923, 3);
  });
});

describe("sizePosition", () => {
  it("tire la taille de la distance au stop, pas d'un levier choisi", () => {
    const r = sizePosition(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Risque visé 3 $, stop à 3 $ du prix → 1 unité, 100 $ de notionnel.
    expect(r.qty).toBeCloseTo(1, 10);
    expect(r.notionalUsd).toBeCloseTo(100, 10);
    expect(r.riskUsd).toBeCloseTo(3, 10);
    expect(r.leverage).toBeCloseTo(1 / 3, 6);
  });

  it("donne un levier plus élevé quand le stop est serré", () => {
    const large = sizePosition({ ...base, stopPrice: 99.5 });
    expect(large.ok).toBe(true);
    if (!large.ok) return;
    expect(large.leverage).toBeGreaterThan(1);
    expect(large.riskUsd).toBeCloseTo(3, 6);
  });

  it("rabote au plafond de levier plutôt que de dépasser", () => {
    const r = sizePosition({ ...base, stopPrice: 99.9, maxLeverage: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cappedByLeverage).toBe(true);
    expect(r.leverage).toBeCloseTo(3, 6);
    // Le rabot réduit le risque réel sous la cible : c'est le bon sens d'erreur.
    expect(r.riskUsd).toBeLessThan(3);
  });

  it("retient le plus bas des deux plafonds", () => {
    const r = sizePosition({ ...base, stopPrice: 99.9, maxLeverage: 10, venueMaxLeverage: 4 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.leverage).toBeCloseTo(4, 6);
  });

  it("refuse un stop du mauvais côté", () => {
    const r = sizePosition({ ...base, stopPrice: 101 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("stop_du_mauvais_cote");
  });

  it("refuse un stop collé au prix, que le bruit déclencherait", () => {
    const r = sizePosition({ ...base, stopPrice: 99.98 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("stop_colle_au_prix");
  });

  it("refuse quand la liquidation est plus proche que 2,5× le stop", () => {
    // Stop large et levier forcé haut : la liquidation passe devant.
    const r = sizePosition({
      ...base,
      stopPrice: 85,
      riskFraction: 0.5,
      maxLeverage: 8,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("liquidation_trop_proche");
  });

  it("garde la liquidation largement derrière le stop quand il accepte", () => {
    const r = sizePosition(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.liqDistanceFraction).toBeGreaterThan(2.5 * r.stopDistanceFraction);
  });

  it("refuse 5 $ de capital : le minimum de 10 $ est hors d'atteinte", () => {
    const r = sizePosition({ ...base, equityUsd: 5 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("sous_le_minimum");
    expect(r.detail).toContain("10 $");
  });

  it("explique quand seul un levier interdit atteindrait le minimum", () => {
    const r = sizePosition({ ...base, equityUsd: 1, maxLeverage: 5 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.detail).toContain("plafond");
  });

  it("refuse un capital nul", () => {
    const r = sizePosition({ ...base, equityUsd: 0 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("capital_insuffisant");
  });

  it("traite les shorts symétriquement", () => {
    const r = sizePosition({ ...base, side: "short", entryPrice: 100, stopPrice: 103 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.liquidationPrice).toBeGreaterThan(100);
    expect(r.riskUsd).toBeCloseTo(3, 10);
  });
});
