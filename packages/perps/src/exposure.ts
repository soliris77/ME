/**
 * Exposition totale.
 *
 * Dix positions crypto à 5×, ce ne sont pas dix paris : les paires montent
 * et descendent ensemble, surtout quand ça va vite. C'est un seul pari à 50×.
 * Ce plafond regarde la somme des notionnels, pas le levier d'une position
 * prise isolément.
 */

export interface ExposureInputs {
  readonly equityUsd: number;
  /** Notionnels des positions déjà ouvertes, en dollars. */
  readonly openNotionalsUsd: readonly number[];
  /** Notionnel de la position envisagée. */
  readonly newNotionalUsd: number;
  /** Plafond du levier agrégé : somme des notionnels ÷ capital. */
  readonly maxTotalLeverage: number;
  /** Nombre maximal de positions ouvertes en même temps. */
  readonly maxOpenPositions: number;
}

export interface ExposureVerdict {
  readonly ok: boolean;
  /** Levier agrégé actuel. */
  readonly currentLeverage: number;
  /** Levier agrégé si on ouvrait cette position. */
  readonly projectedLeverage: number;
  readonly openPositions: number;
  readonly reason?: "plafond_de_levier_total" | "trop_de_positions";
  readonly detail?: string;
}

export function assessExposure(inputs: ExposureInputs): ExposureVerdict {
  const {
    equityUsd,
    openNotionalsUsd,
    newNotionalUsd,
    maxTotalLeverage,
    maxOpenPositions,
  } = inputs;

  const openSum = openNotionalsUsd.reduce((a, b) => a + b, 0);
  const currentLeverage = equityUsd > 0 ? openSum / equityUsd : Number.POSITIVE_INFINITY;
  const projectedLeverage =
    equityUsd > 0 ? (openSum + newNotionalUsd) / equityUsd : Number.POSITIVE_INFINITY;
  const openPositions = openNotionalsUsd.length;

  if (openPositions >= maxOpenPositions) {
    return {
      ok: false,
      currentLeverage,
      projectedLeverage,
      openPositions,
      reason: "trop_de_positions",
      detail: `${openPositions} positions ouvertes, plafond ${maxOpenPositions}`,
    };
  }

  if (projectedLeverage > maxTotalLeverage) {
    return {
      ok: false,
      currentLeverage,
      projectedLeverage,
      openPositions,
      reason: "plafond_de_levier_total",
      detail:
        `l'exposition passerait à ${projectedLeverage.toFixed(2)}× du capital, ` +
        `plafond ${maxTotalLeverage}×`,
    };
  }

  return { ok: true, currentLeverage, projectedLeverage, openPositions };
}
