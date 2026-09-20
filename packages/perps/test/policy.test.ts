import { describe, expect, it } from "vitest";
import { HYPERLIQUID_BASE } from "../src/fees";
import { GMX_V2_BASE } from "../src/venues";
import {
  canArm,
  evaluateTrade,
  perpsDefaults,
  type EvaluateInputs,
  type PerpsSettings,
} from "../src/policy";
import type { PerpAccountState, PerpMarketMeta, PerpPosition } from "../src/venue";

const market: PerpMarketMeta = {
  symbol: "BTC",
  maxLeverage: 20,
  quantityStep: 0.001,
  priceStep: 0.1,
  minOrderValueUsd: 10,
  maintenanceMarginFraction: 0.025,
};

const settings: PerpsSettings = {
  ...perpsDefaults(),
  enabled: true,
  mode: "armed",
};

function position(symbol: string, notionalUsd: number): PerpPosition {
  return {
    symbol,
    side: "long",
    size: notionalUsd / 100,
    entryPrice: 100,
    markPrice: 100,
    notionalUsd,
    marginUsd: notionalUsd,
    leverage: 1,
    unrealizedPnlUsd: 0,
  };
}

const account: PerpAccountState = {
  equityUsd: 1000,
  availableMarginUsd: 1000,
  positions: [],
};

const base: EvaluateInputs = {
  settings,
  fees: HYPERLIQUID_BASE,
  market,
  account,
  day: { tradesToday: 0, feesPaidTodayUsd: 0, realizedPnlTodayUsd: 0 },
  candidate: {
    symbol: "BTC",
    side: "long",
    entryPrice: 100,
    stopPrice: 97,
    measuredGrossEdge: 0.006,
    sampleSize: 200,
  },
  assumedSlippagePerSide: 0.0002,
  assumedFundingPerTrade: 0.0005,
};

describe("evaluateTrade — le cas qui passe", () => {
  it("accepte et exécute quand les deux serrures sont ouvertes", () => {
    const v = evaluateTrade(base);
    expect(v.refusals).toEqual([]);
    expect(v.allowed).toBe(true);
    expect(v.execute).toBe(true);
    expect(v.holds).toEqual([]);
  });

  it("retient le coût complet, frais plus glissement plus funding", () => {
    const v = evaluateTrade(base);
    // 2 × 0,045 % + 2 × 0,02 % + 0,05 % = 0,18 %
    expect(v.roundTripFraction).toBeCloseTo(0.0018, 10);
  });

  it("aligne la taille vers le bas sur le pas de la plateforme", () => {
    const v = evaluateTrade(base);
    expect(v.plan).toBeDefined();
    if (!v.plan) return;
    // Risque 5 $, stop à 3 $ → 1,6666… unités, alignées à 1,666.
    expect(v.plan.size).toBe(1.666);
    expect(v.plan.notionalUsd).toBeCloseTo(166.6, 6);
    expect(v.plan.riskUsd).toBeCloseTo(4.998, 6);
  });

  it("règle un levier entier, jamais fractionnaire", () => {
    const v = evaluateTrade(base);
    if (!v.plan) throw new Error("plan attendu");
    expect(Number.isInteger(v.plan.leverageToSet)).toBe(true);
    expect(v.plan.leverageToSet).toBeGreaterThanOrEqual(1);
    expect(v.plan.effectiveLeverage).toBeCloseTo(0.1666, 4);
  });
});

describe("evaluateTrade — les deux serrures", () => {
  it("calcule tout mais n'exécute pas en mode fantôme", () => {
    const v = evaluateTrade({ ...base, settings: { ...settings, mode: "shadow" } });
    expect(v.allowed).toBe(true);
    expect(v.execute).toBe(false);
    expect(v.holds).toContain("mode_fantome");
    expect(v.plan).toBeDefined();
  });

  it("n'exécute pas non plus quand le système est désactivé", () => {
    const v = evaluateTrade({ ...base, settings: { ...settings, enabled: false } });
    expect(v.allowed).toBe(true);
    expect(v.execute).toBe(false);
    expect(v.holds).toContain("desactive");
  });

  it("cumule les deux retenues quand les deux serrures sont fermées", () => {
    const v = evaluateTrade({
      ...base,
      settings: { ...settings, enabled: false, mode: "shadow" },
    });
    expect(v.holds).toEqual(["desactive", "mode_fantome"]);
  });
});

describe("evaluateTrade — les refus", () => {
  it("refuse un stop du mauvais côté", () => {
    const v = evaluateTrade({
      ...base,
      candidate: { ...base.candidate, stopPrice: 103 },
    });
    expect(v.refusals).toContain("dimensionnement_refuse");
    expect(v.execute).toBe(false);
  });

  it("refuse quand l'alignement fait tomber la taille sous le minimum", () => {
    const v = evaluateTrade({
      ...base,
      market: { ...market, quantityStep: 1 },
      account: { ...account, equityUsd: 90, availableMarginUsd: 90 },
    });
    expect(v.refusals).toContain("sous_le_minimum_apres_alignement");
  });

  it("refuse une deuxième position sur le même symbole", () => {
    const v = evaluateTrade({
      ...base,
      account: { ...account, positions: [position("BTC", 100)] },
    });
    expect(v.refusals).toContain("deja_en_position");
  });

  it("refuse au-delà du plafond d'exposition agrégée", () => {
    const v = evaluateTrade({
      ...base,
      account: { ...account, positions: [position("ETH", 2900)] },
    });
    expect(v.refusals).toContain("exposition_refusee");
  });

  it("refuse quand la marge disponible ne couvre pas la position", () => {
    const v = evaluateTrade({
      ...base,
      account: { ...account, availableMarginUsd: 10 },
    });
    expect(v.refusals).toContain("marge_insuffisante");
  });

  it("refuse au-delà de la cadence du jour", () => {
    const v = evaluateTrade({
      ...base,
      day: { tradesToday: 6, feesPaidTodayUsd: 0, realizedPnlTodayUsd: 0 },
    });
    expect(v.refusals).toContain("cadence_depassee");
  });

  it("refuse quand le budget de frais du jour est épuisé", () => {
    const v = evaluateTrade({
      ...base,
      day: { tradesToday: 0, feesPaidTodayUsd: 20, realizedPnlTodayUsd: 0 },
    });
    expect(v.refusals).toContain("budget_de_frais_epuise");
  });

  it("coupe le circuit quand la perte du jour est atteinte", () => {
    const v = evaluateTrade({
      ...base,
      day: { tradesToday: 0, feesPaidTodayUsd: 0, realizedPnlTodayUsd: -31 },
    });
    expect(v.refusals).toContain("perte_du_jour_atteinte");
  });

  it("refuse un bord sous le coût, même avec un gros échantillon", () => {
    const v = evaluateTrade({
      ...base,
      candidate: { ...base.candidate, measuredGrossEdge: 0.0005, sampleSize: 500 },
    });
    expect(v.refusals).toContain("bord_insuffisant");
    expect(v.allowed).toBe(false);
  });

  it("refuse un bord non mesuré, si prometteur soit-il", () => {
    const v = evaluateTrade({
      ...base,
      candidate: { ...base.candidate, measuredGrossEdge: 0.05, sampleSize: 3 },
    });
    expect(v.refusals).toContain("bord_insuffisant");
    expect(v.reasons.join(" ")).toContain("échantillon insuffisant");
  });
});

describe("evaluateTrade — le frais fixe d'une plateforme on-chain", () => {
  it("fait exploser le coût d'un petit trade", () => {
    const v = evaluateTrade({ ...base, fees: GMX_V2_BASE });
    // 0,12 % de frais + 0,04 % de glissement + 0,05 % de funding, plus 1 $
    // de gaz sur 166,60 $ de notionnel : 0,60 % à lui seul.
    expect(v.roundTripFraction).toBeCloseTo(0.0081, 4);
  });

  it("refuse, avec le même bord, ce qu'Hyperliquid accepte", () => {
    // Bord mesuré de 0,60 % : au-dessus du coût d'Hyperliquid (0,18 %),
    // au-dessous de celui de GMX à cette taille (0,81 %).
    expect(evaluateTrade(base).allowed).toBe(true);

    const gmx = evaluateTrade({ ...base, fees: GMX_V2_BASE });
    expect(gmx.allowed).toBe(false);
    expect(gmx.refusals).toContain("bord_insuffisant");
  });

  it("redevient tenable quand la position est assez grosse pour diluer le gaz", () => {
    const gros = evaluateTrade({
      ...base,
      fees: GMX_V2_BASE,
      account: { ...account, equityUsd: 100_000, availableMarginUsd: 100_000 },
    });
    expect(gros.roundTripFraction).toBeLessThan(0.0025);
    expect(gros.allowed).toBe(true);
  });

  it("compte le gaz dans le coût en dollars du plan", () => {
    const v = evaluateTrade({ ...base, fees: GMX_V2_BASE });
    if (!v.plan) throw new Error("plan attendu");
    // 1 $ de gaz à lui seul dépasse le coût proportionnel du trade.
    expect(v.plan.estimatedRoundTripUsd).toBeGreaterThan(1);
  });
});

describe("perpsDefaults", () => {
  it("part fermé des deux côtés", () => {
    const d = perpsDefaults();
    expect(d.enabled).toBe(false);
    expect(d.mode).toBe("shadow");
  });
});

describe("canArm", () => {
  const ok = {
    confirmed: true,
    shadowDecisions: 150,
    minShadowDecisions: 100,
    measuredGrossEdge: 0.004,
    roundTripFraction: 0.0018,
    credentialsPresent: true,
  };

  it("autorise l'armement quand tout est réuni", () => {
    expect(canArm(ok).ok).toBe(true);
    expect(canArm(ok).blockers).toEqual([]);
  });

  it("refuse sans confirmation explicite", () => {
    const c = canArm({ ...ok, confirmed: false });
    expect(c.ok).toBe(false);
    expect(c.blockers.join(" ")).toContain("confirmé");
  });

  it("refuse sans identifiants de plateforme", () => {
    expect(canArm({ ...ok, credentialsPresent: false }).ok).toBe(false);
  });

  it("refuse avant d'avoir assez de décisions fantômes", () => {
    const c = canArm({ ...ok, shadowDecisions: 12 });
    expect(c.ok).toBe(false);
    expect(c.blockers.join(" ")).toContain("mode fantôme");
  });

  it("refuse quand le bord mesuré ne couvre pas le coût", () => {
    const c = canArm({ ...ok, measuredGrossEdge: 0.001 });
    expect(c.ok).toBe(false);
    expect(c.blockers.join(" ")).toContain("sous le coût");
  });

  it("énumère tous les obstacles d'un coup", () => {
    const c = canArm({
      confirmed: false,
      shadowDecisions: 0,
      minShadowDecisions: 100,
      measuredGrossEdge: 0,
      roundTripFraction: 0.0018,
      credentialsPresent: false,
    });
    expect(c.blockers).toHaveLength(4);
  });
});
