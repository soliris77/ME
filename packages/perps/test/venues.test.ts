import { describe, expect, it } from "vitest";
import { bareRoundTripFraction, HYPERLIQUID_BASE } from "../src/fees";
import {
  GMX_V2_BASE,
  isVenueId,
  notionalWhereFixedCostDominates,
  venueFees,
  venueFeesWithOverrides,
} from "../src/venues";

describe("identifiants de plateforme", () => {
  it("reconnaît les deux plateformes", () => {
    expect(isVenueId("hyperliquid")).toBe(true);
    expect(isVenueId("gmx")).toBe(true);
  });

  it("refuse tout le reste", () => {
    expect(isVenueId("binance")).toBe(false);
    expect(isVenueId("")).toBe(false);
  });

  it("rend le bon barème", () => {
    expect(venueFees("hyperliquid")).toBe(HYPERLIQUID_BASE);
    expect(venueFees("gmx")).toBe(GMX_V2_BASE);
  });
});

describe("barème GMX v2", () => {
  it("retient le pire des deux paliers de frais de position", () => {
    // 0,04 % si l'ordre rééquilibre, 0,06 % sinon. On ne le sait pas
    // d'avance, donc on suppose 0,06 %.
    expect(GMX_V2_BASE.takerFee).toBe(0.0006);
  });

  it("n'accorde aucun rebate : la liquidité vient du pool, pas de nous", () => {
    expect(GMX_V2_BASE.makerRebate).toBe(0);
  });

  it("facture un frais d'exécution indépendant de la taille", () => {
    expect(GMX_V2_BASE.fixedCostUsdPerSide).toBeGreaterThan(0);
  });
});

describe("GMX contre Hyperliquid", () => {
  it("coûte plus cher qu'Hyperliquid même sur une grosse position", () => {
    const gros = 100_000;
    expect(bareRoundTripFraction(GMX_V2_BASE, gros)).toBeGreaterThan(
      bareRoundTripFraction(HYPERLIQUID_BASE, gros),
    );
  });

  it("devient absurde sur une petite position", () => {
    // Un aller-retour de 40 $ paie 1 $ de gaz : 2,5 % avant tout le reste.
    const petit = bareRoundTripFraction(GMX_V2_BASE, 40);
    expect(petit).toBeGreaterThan(0.025);
    // Vingt-cinq fois le coût du même aller-retour sur Hyperliquid.
    expect(petit / bareRoundTripFraction(HYPERLIQUID_BASE, 40)).toBeGreaterThan(25);
  });

  it("garde un écart borné quand la position est assez grosse", () => {
    const enorme = bareRoundTripFraction(GMX_V2_BASE, 1_000_000);
    // À la limite, il ne reste que les frais de position : 0,12 %.
    expect(enorme).toBeCloseTo(0.0012, 5);
  });
});

describe("notionalWhereFixedCostDominates", () => {
  it("dit à partir de quelle taille le gaz cesse de dominer", () => {
    // fixe = 1 $, proportionnel = 0,12 % ; à parts égales il faut
    // 0,12 % × N = 1 $, soit N = 833,33 $.
    expect(notionalWhereFixedCostDominates(GMX_V2_BASE, 0.5)).toBeCloseTo(833.33, 1);
  });

  it("rend zéro là où il n'y a pas de frais fixe", () => {
    expect(notionalWhereFixedCostDominates(HYPERLIQUID_BASE)).toBe(0);
  });

  it("refuse une part absurde", () => {
    expect(notionalWhereFixedCostDominates(GMX_V2_BASE, 0)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(notionalWhereFixedCostDominates(GMX_V2_BASE, 1)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});

describe("venueFeesWithOverrides", () => {
  it("substitue le frais fixe mesuré par l'utilisateur", () => {
    const fees = venueFeesWithOverrides("gmx", { fixedCostUsdPerSide: 0.12 });
    expect(fees.fixedCostUsdPerSide).toBe(0.12);
    expect(fees.takerFee).toBe(GMX_V2_BASE.takerFee);
  });

  it("accepte zéro : une plateforme peut vraiment ne rien facturer", () => {
    expect(venueFeesWithOverrides("gmx", { fixedCostUsdPerSide: 0 }).fixedCostUsdPerSide)
      .toBe(0);
  });

  it("ignore une valeur absente ou absurde", () => {
    expect(venueFeesWithOverrides("gmx")).toBe(GMX_V2_BASE);
    expect(venueFeesWithOverrides("gmx", { fixedCostUsdPerSide: -1 })).toBe(GMX_V2_BASE);
    expect(venueFeesWithOverrides("gmx", { fixedCostUsdPerSide: Number.NaN })).toBe(
      GMX_V2_BASE,
    );
  });
});
