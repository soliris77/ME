import { HYPERLIQUID_BASE } from "./fees";
import type { VenueFees } from "./types";

/**
 * Les plateformes connues, et ce qu'elles coûtent vraiment.
 *
 * Deux modèles opposés vivent ici. Hyperliquid est un carnet d'ordres
 * centralisé : tout est proportionnel, rien à payer au réseau. GMX est
 * on-chain : chaque ordre est une transaction, donc un frais en dollars qui
 * ne dépend pas de la taille. C'est cette différence, pas le taux affiché,
 * qui décide laquelle convient à un rythme donné.
 */

export type VenueId = "hyperliquid" | "gmx";

export const VENUE_IDS: readonly VenueId[] = ["hyperliquid", "gmx"];

export function isVenueId(value: string): value is VenueId {
  return (VENUE_IDS as readonly string[]).includes(value);
}

/**
 * Barème de GMX v2, vérifié dans la documentation le 17 septembre 2026.
 *
 *   frais de position  0,04 % si l'ordre RÉDUIT le déséquilibre entre les
 *                      intérêts ouverts longs et courts,
 *                      0,06 % s'il l'AUGMENTE.
 *                      Prélevé à l'ouverture ET à la fermeture.
 *   impact de prix     nul à l'entrée ; appliqué à la sortie, plafonné à
 *                      +0,40 % en faveur et de −0,50 % à −10 % contre,
 *                      selon la liquidité du marché.
 *   borrowing          seulement pour le côté le plus lourd, de l'ordre de
 *                      45 % à 130 % par an selon l'utilisation du pool —
 *                      soit 0,12 % à 0,36 % PAR JOUR de détention.
 *   funding            dynamique, selon le déséquilibre.
 *   exécution          le gaz du keeper, en dollars, remboursé si non
 *                      consommé. Indépendant de la taille.
 *
 * On retient systématiquement le pire palier : 0,06 %. L'ordre ne sait pas
 * à l'avance s'il rééquilibrera le marché, et se tromper en surestimant le
 * coût ne coûte qu'un trade manqué ; l'inverse coûte de l'argent.
 *
 * `minOrderValueUsd` n'est pas un minimum du protocole — GMX n'en documente
 * pas. C'est un plancher que l'on s'impose ; de toute façon, le frais fixe
 * rend une petite position absurde bien avant ce seuil.
 */
export const GMX_V2_BASE: VenueFees = {
  takerFee: 0.0006,
  // Pas de rebate : sur GMX on ne fournit pas la liquidité, le pool le fait.
  makerRebate: 0,
  minOrderValueUsd: 10,
  // Ordre de grandeur sur Arbitrum. À recalibrer sur des ordres réels :
  // c'est le réglage qui pèse le plus lourd sur une petite position.
  fixedCostUsdPerSide: 0.5,
};

export function venueFees(venue: VenueId): VenueFees {
  return venue === "gmx" ? GMX_V2_BASE : HYPERLIQUID_BASE;
}

/**
 * Le même barème, avec les hypothèses de coût de l'utilisateur substituées.
 *
 * Le frais fixe se calibre en regardant ses propres transactions ; tant
 * qu'on ne l'a pas fait, la valeur du barème sert de point de départ.
 */
export function venueFeesWithOverrides(
  venue: VenueId,
  overrides: { readonly fixedCostUsdPerSide?: number | undefined } = {},
): VenueFees {
  const base = venueFees(venue);
  const fixed = overrides.fixedCostUsdPerSide;
  if (fixed === undefined || !Number.isFinite(fixed) || fixed < 0) return base;
  return { ...base, fixedCostUsdPerSide: fixed };
}

/**
 * Le notionnel en dessous duquel le frais fixe dépasse une part donnée du
 * coût total. Sert à répondre « à partir de quelle taille GMX a un sens ? »
 * par un nombre.
 *
 * Au-dessous de ce notionnel, on paie surtout du gaz.
 */
export function notionalWhereFixedCostDominates(
  fees: VenueFees,
  share = 0.5,
): number {
  if (fees.fixedCostUsdPerSide <= 0) return 0;
  if (share <= 0 || share >= 1) return Number.POSITIVE_INFINITY;
  // fixe / (fixe + proportionnel × N) = share  ⇒  N = fixe × (1 − share) / (share × prop)
  const fixed = 2 * fees.fixedCostUsdPerSide;
  const proportional = 2 * fees.takerFee;
  if (proportional <= 0) return Number.POSITIVE_INFINITY;
  return (fixed * (1 - share)) / (share * proportional);
}
