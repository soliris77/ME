import { describe, expect, it } from "vitest";
import { perpsDefaults } from "@workspace/perps";
import {
  asVenueId,
  configuredFees,
  configuredRoundTripFraction,
  referenceNotionalUsd,
  REFERENCE_STOP_FRACTION,
  type PerpsConfig,
} from "../perpsService";

/**
 * Ces tests ne touchent ni la base ni le réseau : ils portent sur la partie
 * du service qui est du calcul pur, et sur la seule chose qui distingue
 * vraiment les deux plateformes — la dépendance du coût à la taille.
 */

function config(overrides: Partial<PerpsConfig> = {}): PerpsConfig {
  return {
    ...perpsDefaults(),
    venue: "hyperliquid",
    minShadowDecisions: 200,
    assumedSlippagePerSide: 0.0002,
    assumedFundingPerTrade: 0.0005,
    assumedFixedCostUsd: 0,
    shadowEquityUsd: 1000,
    armedAt: null,
    disarmedAt: null,
    ...overrides,
  };
}

describe("asVenueId", () => {
  it("accepte les deux plateformes", () => {
    expect(asVenueId("hyperliquid")).toBe("hyperliquid");
    expect(asVenueId("gmx")).toBe("gmx");
  });

  it("retombe sur la plateforme par défaut quand rien n'est demandé", () => {
    expect(asVenueId(undefined)).toBe("hyperliquid");
    expect(asVenueId("")).toBe("hyperliquid");
    expect(asVenueId(null)).toBe("hyperliquid");
  });

  it("refuse une plateforme inconnue plutôt que d'en choisir une", () => {
    // Retomber en silence sur Hyperliquid enverrait un ordre pensé pour GMX
    // à la mauvaise plateforme. Mieux vaut une erreur.
    expect(() => asVenueId("binance")).toThrow(/Plateforme inconnue/);
  });
});

describe("referenceNotionalUsd", () => {
  it("dimensionne comme la politique le ferait", () => {
    // 1 000 $ × 0,5 % de risque ÷ 12 % de stop = 41,67 $.
    expect(referenceNotionalUsd(config())).toBeCloseTo(1000 * 0.005 / REFERENCE_STOP_FRACTION, 6);
  });

  it("suit le capital réel quand on en a un", () => {
    expect(referenceNotionalUsd(config(), 20000)).toBeCloseTo(20000 / 24, 4);
  });

  it("ne rend jamais zéro, même sans capital", () => {
    expect(referenceNotionalUsd(config({ shadowEquityUsd: 0 }), 0)).toBeGreaterThan(0);
  });
});

describe("configuredFees", () => {
  it("substitue le frais fixe mesuré au barème", () => {
    const fees = configuredFees(config({ venue: "gmx", assumedFixedCostUsd: 0.12 }));
    expect(fees.fixedCostUsdPerSide).toBe(0.12);
    expect(fees.takerFee).toBe(0.0006);
  });
});

describe("configuredRoundTripFraction", () => {
  it("ne dépend pas de la taille sans frais fixe", () => {
    const hl = config();
    expect(configuredRoundTripFraction(hl, 40)).toBeCloseTo(
      configuredRoundTripFraction(hl, 100_000),
      10,
    );
  });

  it("dépend violemment de la taille avec un frais fixe", () => {
    const gmx = config({ venue: "gmx", assumedFixedCostUsd: 0.5 });
    const petit = configuredRoundTripFraction(gmx, 40);
    const gros = configuredRoundTripFraction(gmx, 100_000);
    // 1 $ de gaz sur 40 $ : 2,5 % à lui seul.
    expect(petit).toBeGreaterThan(0.025);
    expect(gros).toBeLessThan(0.0025);
    expect(petit / gros).toBeGreaterThan(10);
  });

  it("rend GMX plus cher qu'Hyperliquid à la taille par défaut", () => {
    const hl = config();
    const gmx = config({ venue: "gmx", assumedFixedCostUsd: 0.5 });
    const notionnel = referenceNotionalUsd(hl);
    expect(configuredRoundTripFraction(gmx, notionnel)).toBeGreaterThan(
      10 * configuredRoundTripFraction(hl, notionnel),
    );
  });

  it("efface l'écart quand le frais fixe est mesuré à zéro", () => {
    // Si le gaz s'avérait négligeable, il ne resterait que l'écart de barème.
    const gmx = config({ venue: "gmx", assumedFixedCostUsd: 0 });
    const hl = config();
    const notionnel = referenceNotionalUsd(hl);
    const rapport =
      configuredRoundTripFraction(gmx, notionnel) /
      configuredRoundTripFraction(hl, notionnel);
    expect(rapport).toBeLessThan(2);
  });
});
