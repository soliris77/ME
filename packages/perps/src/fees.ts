import type { RoundTripCost, RoundTripInputs, VenueFees } from "./types";

/**
 * Barème de base de Hyperliquid (niveau 0), vérifié le 15 septembre 2026.
 *
 *   taker         0,045 %
 *   rebate maker  0,015 %  (la plateforme paie le maker)
 *   minimum       10 $ de notionnel — « Order must have minimum value of $10. »
 *
 * Les paliers de volume descendent jusqu'à 0,024 % taker au-delà de 7 G$ sur
 * 14 jours glissants ; hors de portée ici, donc on reste au niveau 0. Le
 * staking de HYPE et le parrainage donnent des réductions supplémentaires
 * qu'on ignore volontairement : mieux vaut se tromper en surestimant le coût.
 */
export const HYPERLIQUID_BASE: VenueFees = {
  takerFee: 0.00045,
  makerRebate: 0.00015,
  minOrderValueUsd: 10,
  // Plateforme centralisée : rien à payer au mineur, le coût est purement
  // proportionnel.
  fixedCostUsdPerSide: 0,
};

/**
 * Le coût d'un aller-retour, en dollars et en fraction du notionnel.
 *
 * Un côté maker rapporte au lieu de coûter : le rebate est donc soustrait.
 * En pratique, un scanner de momentum entre et sort au marché — il poursuit
 * un mouvement déjà parti, il ne peut pas attendre d'être servi.
 */
export function roundTripCost(inputs: RoundTripInputs, fees: VenueFees): RoundTripCost {
  const { notionalUsd, entryIsTaker, exitIsTaker, slippagePerSide, fundingPaid } = inputs;

  const sideCost = (isTaker: boolean): number =>
    isTaker ? fees.takerFee * notionalUsd : -fees.makerRebate * notionalUsd;

  const entryFeeUsd = sideCost(entryIsTaker);
  const exitFeeUsd = sideCost(exitIsTaker);
  const slippageUsd = 2 * slippagePerSide * notionalUsd;
  const fundingUsd = fundingPaid * notionalUsd;
  const fixedUsd = 2 * fees.fixedCostUsdPerSide;

  const totalUsd = entryFeeUsd + exitFeeUsd + slippageUsd + fundingUsd + fixedUsd;

  return {
    entryFeeUsd,
    exitFeeUsd,
    slippageUsd,
    fundingUsd,
    fixedUsd,
    totalUsd,
    totalFraction: notionalUsd === 0 ? 0 : totalUsd / notionalUsd,
  };
}

/**
 * La part PROPORTIONNELLE du plancher : un aller-retour au marché des deux
 * côtés, sans funding, sans slippage, sans frais fixe. Sur Hyperliquid :
 * 0,09 %.
 *
 * Elle ne suffit pas à juger une plateforme on-chain, où le frais fixe pèse
 * d'autant plus que la position est petite. Pour ça, voir
 * `bareRoundTripFraction`, qui prend le notionnel.
 */
export function proportionalRoundTripFraction(fees: VenueFees): number {
  return 2 * fees.takerFee;
}

/**
 * Le plancher réel à un notionnel donné : la part proportionnelle plus les
 * deux frais fixes ramenés à ce notionnel.
 *
 * C'est le seul chiffre honnête quand on compare deux plateformes dont
 * l'une facture du gaz : sur GMX, un aller-retour coûte 0,12 % sur une
 * grosse position et plusieurs pour cent sur une petite.
 */
export function bareRoundTripFraction(fees: VenueFees, notionalUsd: number): number {
  if (notionalUsd <= 0) return Number.POSITIVE_INFINITY;
  return 2 * fees.takerFee + (2 * fees.fixedCostUsdPerSide) / notionalUsd;
}
