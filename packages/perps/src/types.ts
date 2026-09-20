/**
 * Types du lot 10 — contrats perpétuels à levier.
 *
 * Tout ce paquet est de la logique pure : aucun appel réseau, aucune clé,
 * aucun ordre. Il répond à une seule question, et il y répond avec des
 * chiffres vérifiables : à quelles conditions un réglage (nombre de trades,
 * levier) peut être rentable une fois les coûts payés.
 */

export type Side = "long" | "short";

/** Barème d'une plateforme. Les taux sont des fractions : 0.00045 = 0,045 %. */
export interface VenueFees {
  /** Frais payés quand on prend la liquidité. Positif = coût. */
  readonly takerFee: number;
  /**
   * Rebate reçu quand on la fournit. Positif = la plateforme te paie.
   * Hyperliquid paie le maker au barème de base ; ce n'est pas partout le cas.
   */
  readonly makerRebate: number;
  /** Valeur minimale d'un ordre, en dollars de notionnel. */
  readonly minOrderValueUsd: number;
  /**
   * Frais payé par côté en dollars, quelle que soit la taille de l'ordre.
   *
   * Nul sur une plateforme centralisée. Sur une plateforme on-chain, c'est
   * le gaz que le keeper facture pour exécuter l'ordre — et comme il ne
   * dépend pas du notionnel, il écrase les petits trades : 0,50 $ sur une
   * position de 40 $, c'est 1,25 % par côté, quinze fois le frais
   * proportionnel. C'est ce chiffre qui décide si une plateforme on-chain
   * a un sens à un rythme donné.
   */
  readonly fixedCostUsdPerSide: number;
}

/** Ce qu'un aller-retour coûte réellement. */
export interface RoundTripInputs {
  /** Notionnel de la position, en dollars (quantité × prix). */
  readonly notionalUsd: number;
  /** Vrai si l'entrée prend la liquidité (ordre au marché). */
  readonly entryIsTaker: boolean;
  /** Vrai si la sortie prend la liquidité. Un stop déclenché est toujours taker. */
  readonly exitIsTaker: boolean;
  /**
   * Écart entre le prix attendu et le prix obtenu, par côté, en fraction.
   * 0.0002 = 2 points de base. Sur les petites capitalisations, bien plus.
   */
  readonly slippagePerSide: number;
  /**
   * Funding payé pendant toute la durée de la position, en fraction du
   * notionnel. Positif = coût. Se paie à l'heure sur Hyperliquid, donc une
   * position gardée 24 h le paie une vingtaine de fois.
   */
  readonly fundingPaid: number;
}

export interface RoundTripCost {
  readonly entryFeeUsd: number;
  readonly exitFeeUsd: number;
  readonly slippageUsd: number;
  readonly fundingUsd: number;
  /** Les deux frais fixes, en dollars. Indépendant du notionnel. */
  readonly fixedUsd: number;
  readonly totalUsd: number;
  /** Le total, ramené en fraction du notionnel. C'est le nombre qui compte. */
  readonly totalFraction: number;
}
