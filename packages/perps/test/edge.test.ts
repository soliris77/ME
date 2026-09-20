import { describe, expect, it } from "vitest";
import {
  assessSettings,
  breakEvenEdge,
  dailyCostFraction,
  maxTradesPerDay,
  netExpectancy,
} from "../src/edge";

const RT = 0.0009; // aller-retour au marché sur Hyperliquid

describe("dailyCostFraction", () => {
  it("donne 22,5 % par jour à 50 trades et 5× de levier effectif", () => {
    expect(dailyCostFraction(50, 5, RT)).toBeCloseTo(0.225, 10);
  });

  it("donne 45 % par jour à 100 trades et 5×", () => {
    expect(dailyCostFraction(100, 5, RT)).toBeCloseTo(0.45, 10);
  });

  it("ne dépend pas de la taille du compte — seulement de N et L", () => {
    expect(dailyCostFraction(50, 5, RT)).toBe(dailyCostFraction(50, 5, RT));
    expect(dailyCostFraction(10, 3, RT)).toBeCloseTo(0.027, 10);
    expect(dailyCostFraction(4, 2, RT)).toBeCloseTo(0.0072, 10);
  });
});

describe("breakEvenEdge", () => {
  it("vaut exactement le coût de l'aller-retour", () => {
    expect(breakEvenEdge(RT)).toBe(RT);
  });
});

describe("netExpectancy", () => {
  it("passe sous zéro quand le bord brut ne couvre pas les frais", () => {
    const e = netExpectancy({
      winRate: 0.5,
      avgWin: 0.001,
      avgLoss: 0.001,
      roundTripFraction: RT,
    });
    expect(e).toBeCloseTo(-RT, 10);
    expect(e).toBeLessThan(0);
  });

  it("reste positive quand le bord brut dépasse les frais", () => {
    const e = netExpectancy({
      winRate: 0.55,
      avgWin: 0.004,
      avgLoss: 0.002,
      roundTripFraction: RT,
    });
    expect(e).toBeGreaterThan(0);
  });
});

describe("assessSettings", () => {
  it("refuse tant que l'échantillon est trop mince, même avec un bon bord", () => {
    const a = assessSettings({
      tradesPerDay: 20,
      effectiveLeverage: 2,
      roundTripFraction: RT,
      measuredGrossEdge: 0.01,
      sampleSize: 7,
    });
    expect(a.viable).toBe(false);
    expect(a.reasons.join(" ")).toContain("échantillon insuffisant");
  });

  it("refuse un bord sous le seuil même sur un gros échantillon", () => {
    const a = assessSettings({
      tradesPerDay: 50,
      effectiveLeverage: 5,
      roundTripFraction: RT,
      measuredGrossEdge: 0.0005,
      sampleSize: 500,
    });
    expect(a.viable).toBe(false);
    expect(a.dailyNetFraction).toBeLessThan(0);
    expect(a.reasons.join(" ")).toContain("sous le seuil");
  });

  it("signale séparément que les frais seuls sont écrasants", () => {
    const a = assessSettings({
      tradesPerDay: 100,
      effectiveLeverage: 5,
      roundTripFraction: RT,
      measuredGrossEdge: 0.002,
      sampleSize: 500,
    });
    expect(a.dailyCostFraction).toBeCloseTo(0.45, 10);
    expect(a.reasons.join(" ")).toContain("45.0 % du capital par jour");
  });

  it("accepte quand le bord mesuré dépasse le seuil sur assez de trades", () => {
    const a = assessSettings({
      tradesPerDay: 8,
      effectiveLeverage: 2,
      roundTripFraction: RT,
      measuredGrossEdge: 0.003,
      sampleSize: 250,
    });
    expect(a.viable).toBe(true);
    expect(a.dailyNetFraction).toBeGreaterThan(0);
  });
});

describe("maxTradesPerDay", () => {
  it("répond par un nombre au lieu d'une intention", () => {
    // Plafond de 2 % du capital par jour en frais, à 3× de levier effectif.
    expect(maxTradesPerDay(3, RT, 0.02)).toBe(7);
  });

  it("autorise beaucoup plus de trades sans levier", () => {
    expect(maxTradesPerDay(1, RT, 0.02)).toBe(22);
  });

  it("renvoie zéro sur des entrées dégénérées", () => {
    expect(maxTradesPerDay(0, RT, 0.02)).toBe(0);
  });
});
