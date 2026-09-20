import type { Side } from "./types";

/**
 * Dimensionnement d'une position à levier.
 *
 * Le levier n'est pas un réglage ici, c'est un résultat. On part du risque
 * qu'on accepte de perdre et de la distance au stop ; la taille en découle,
 * et le levier n'est que le rapport entre le notionnel obtenu et le capital.
 * C'est l'inverse de « je mets 5× » — qui revient à choisir son risque au
 * hasard, puisque la distance au stop change à chaque trade.
 */

export interface SizingInputs {
  readonly equityUsd: number;
  /** Part du capital risquée sur ce trade. 0.005 = 0,5 %. */
  readonly riskFraction: number;
  readonly entryPrice: number;
  readonly stopPrice: number;
  readonly side: Side;
  /** Plafond de levier propre à l'application. */
  readonly maxLeverage: number;
  /** Plafond de la plateforme pour cet actif. */
  readonly venueMaxLeverage: number;
  readonly minOrderValueUsd: number;
  /**
   * La liquidation doit être au moins k fois plus loin que le stop. Sans
   * cette marge, la plateforme ferme la position avant le stop et le risque
   * calculé ne veut plus rien dire.
   */
  readonly liquidationBuffer: number;
  /**
   * Fraction de marge de maintenance. Sur Hyperliquid : la moitié de la
   * fraction de marge initiale maximale, soit 1 / (2 × levier max de l'actif).
   */
  readonly maintenanceMarginFraction: number;
}

export type SizingRejection =
  | "stop_du_mauvais_cote"
  | "stop_colle_au_prix"
  | "capital_insuffisant"
  | "sous_le_minimum"
  | "liquidation_trop_proche";

export interface SizingOk {
  readonly ok: true;
  readonly qty: number;
  readonly notionalUsd: number;
  readonly leverage: number;
  readonly marginUsd: number;
  readonly liquidationPrice: number;
  /** Distance au stop, en fraction du prix d'entrée. */
  readonly stopDistanceFraction: number;
  /** Distance à la liquidation, en fraction du prix d'entrée. */
  readonly liqDistanceFraction: number;
  /** Perte réelle si le stop est touché, en dollars. */
  readonly riskUsd: number;
  /** Vrai si le plafond de levier a réduit la taille sous le risque visé. */
  readonly cappedByLeverage: boolean;
}

export interface SizingFail {
  readonly ok: false;
  readonly reason: SizingRejection;
  readonly detail: string;
}

export type SizingResult = SizingOk | SizingFail;

/**
 * Prix de liquidation en marge isolée.
 *
 *   long  : P = entrée × (1 − 1/L) / (1 − mmf)
 *   short : P = entrée × (1 + 1/L) / (1 + mmf)
 *
 * Approximation : elle ignore les frais et le funding accumulés, qui
 * rapprochent la liquidation. La marge `liquidationBuffer` est là pour
 * absorber cet écart — ne la mets pas à 1.
 */
export function liquidationPrice(
  entryPrice: number,
  leverage: number,
  maintenanceMarginFraction: number,
  side: Side,
): number {
  if (leverage <= 0) return side === "long" ? 0 : Number.POSITIVE_INFINITY;
  const mmf = maintenanceMarginFraction;
  return side === "long"
    ? (entryPrice * (1 - 1 / leverage)) / (1 - mmf)
    : (entryPrice * (1 + 1 / leverage)) / (1 + mmf);
}

export function sizePosition(inputs: SizingInputs): SizingResult {
  const {
    equityUsd,
    riskFraction,
    entryPrice,
    stopPrice,
    side,
    maxLeverage,
    venueMaxLeverage,
    minOrderValueUsd,
    liquidationBuffer,
    maintenanceMarginFraction,
  } = inputs;

  if (equityUsd <= 0) {
    return { ok: false, reason: "capital_insuffisant", detail: "capital nul ou négatif" };
  }

  const stopIsWrongSide =
    side === "long" ? stopPrice >= entryPrice : stopPrice <= entryPrice;
  if (stopIsWrongSide) {
    return {
      ok: false,
      reason: "stop_du_mauvais_cote",
      detail: `stop ${stopPrice} du mauvais côté de l'entrée ${entryPrice} pour un ${side}`,
    };
  }

  const stopDistance = Math.abs(entryPrice - stopPrice);
  const stopDistanceFraction = stopDistance / entryPrice;
  if (stopDistanceFraction < 0.0005) {
    return {
      ok: false,
      reason: "stop_colle_au_prix",
      detail: `stop à ${(stopDistanceFraction * 100).toFixed(4)} % du prix — le bruit le déclenche`,
    };
  }

  const riskUsdTarget = equityUsd * riskFraction;
  let qty = riskUsdTarget / stopDistance;
  let notionalUsd = qty * entryPrice;

  const leverageCap = Math.min(maxLeverage, venueMaxLeverage);
  let cappedByLeverage = false;
  if (notionalUsd > equityUsd * leverageCap) {
    notionalUsd = equityUsd * leverageCap;
    qty = notionalUsd / entryPrice;
    cappedByLeverage = true;
  }

  if (notionalUsd < minOrderValueUsd) {
    const neededLeverage = minOrderValueUsd / equityUsd;
    if (neededLeverage > leverageCap) {
      return {
        ok: false,
        reason: "sous_le_minimum",
        detail:
          `notionnel ${notionalUsd.toFixed(2)} $ sous le minimum de ${minOrderValueUsd} $ ; ` +
          `l'atteindre demanderait ${neededLeverage.toFixed(1)}× alors que le plafond est ${leverageCap}×`,
      };
    }
    return {
      ok: false,
      reason: "sous_le_minimum",
      detail:
        `notionnel ${notionalUsd.toFixed(2)} $ sous le minimum de ${minOrderValueUsd} $ — ` +
        `forcer la taille ferait dépasser le risque visé`,
    };
  }

  const leverage = notionalUsd / equityUsd;
  const marginUsd = notionalUsd / leverage;
  const liqPrice = liquidationPrice(entryPrice, leverage, maintenanceMarginFraction, side);
  const liqDistance = Math.abs(entryPrice - liqPrice);
  const liqDistanceFraction = liqDistance / entryPrice;

  if (liqDistance < liquidationBuffer * stopDistance) {
    return {
      ok: false,
      reason: "liquidation_trop_proche",
      detail:
        `liquidation à ${(liqDistanceFraction * 100).toFixed(2)} % contre un stop à ` +
        `${(stopDistanceFraction * 100).toFixed(2)} % — il en faut ${liquidationBuffer}× plus`,
    };
  }

  return {
    ok: true,
    qty,
    notionalUsd,
    leverage,
    marginUsd,
    liquidationPrice: liqPrice,
    stopDistanceFraction,
    liqDistanceFraction,
    riskUsd: qty * stopDistance,
    cappedByLeverage,
  };
}
