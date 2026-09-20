import type { Side } from "./types";

/**
 * Le port d'une plateforme de perps.
 *
 * Il décrit ce dont la politique a besoin pour décider, et rien de plus.
 * Aucune implémentation ici : ce paquet reste testable sans réseau, sans clé
 * et sans compte. L'adaptateur Hyperliquid vit dans l'api-server, où sont
 * déjà les secrets et les appels sortants.
 *
 * Tout ce qui est en dollars est en dollars ; tout ce qui est une fraction
 * est une fraction. Les deux ne se mélangent jamais dans un même champ.
 */

/** Une position ouverte, telle que la plateforme la voit. */
export interface PerpPosition {
  readonly symbol: string;
  readonly side: Side;
  /** Taille en unités de l'actif, toujours positive. */
  readonly size: number;
  readonly entryPrice: number;
  readonly markPrice: number;
  /** Taille × prix de marque, en dollars. */
  readonly notionalUsd: number;
  /** Marge immobilisée par cette position, en dollars. */
  readonly marginUsd: number;
  /** Levier de la position tel que la plateforme le rapporte. */
  readonly leverage: number;
  /** Absent quand la plateforme ne le donne pas — ne jamais l'inventer. */
  readonly liquidationPrice?: number;
  readonly unrealizedPnlUsd: number;
}

/** Ce que la plateforme impose sur un marché donné. */
export interface PerpMarketMeta {
  readonly symbol: string;
  /** Levier maximal autorisé par la plateforme pour cet actif. */
  readonly maxLeverage: number;
  /** Pas de quantité. Une taille non alignée est refusée à l'envoi. */
  readonly quantityStep: number;
  /** Pas de prix. */
  readonly priceStep: number;
  /** Valeur minimale d'un ordre, en dollars de notionnel. */
  readonly minOrderValueUsd: number;
  /**
   * Fraction de marge de maintenance. Sur Hyperliquid : la moitié de la
   * fraction de marge initiale maximale, soit 1 / (2 × maxLeverage).
   */
  readonly maintenanceMarginFraction: number;
}

/** L'état du compte, réduit à ce qui sert à dimensionner. */
export interface PerpAccountState {
  /** Valeur totale du compte, en dollars. */
  readonly equityUsd: number;
  /** Marge disponible pour ouvrir, en dollars. */
  readonly availableMarginUsd: number;
  readonly positions: readonly PerpPosition[];
}

export type PerpOrderType = "market" | "limit";

export interface PerpOrderRequest {
  readonly symbol: string;
  readonly side: Side;
  /** Taille en unités de l'actif, positive, déjà alignée sur quantityStep. */
  readonly size: number;
  readonly type: PerpOrderType;
  /** Obligatoire pour un ordre limite. */
  readonly limitPrice?: number;
  /** Levier à appliquer à la position, entier, en marge isolée. */
  readonly leverage: number;
  /** Vrai quand l'ordre ne doit que réduire une position existante. */
  readonly reduceOnly?: boolean;
  /**
   * Identifiant fourni par l'appelant. Sert à retrouver l'ordre après un
   * redémarrage et à ne pas le passer deux fois.
   */
  readonly clientOrderId: string;
  /**
   * Stop de protection posé chez la plateforme, en prix. Un stop qui ne vit
   * que dans le worker disparaît avec lui — sur du levier, c'est le compte
   * qui disparaît avec.
   */
  readonly stopLossPrice?: number;
  readonly takeProfitPrice?: number;
}

export type PerpOrderStatus =
  | "pending"
  | "open"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "rejected";

export interface PerpOrderResult {
  readonly venueOrderId: string;
  readonly clientOrderId: string;
  readonly status: PerpOrderStatus;
  readonly filledSize: number;
  readonly averagePrice?: number;
  /** La réponse brute, conservée telle quelle pour le journal. */
  readonly raw: unknown;
}

/**
 * Le port. Une implémentation parle au réseau ; les tests en passent une
 * fausse, et la politique ne voit pas la différence.
 */
export interface PerpsVenue {
  readonly id: string;
  getAccountState(): Promise<PerpAccountState>;
  getMarketMeta(symbol: string): Promise<PerpMarketMeta>;
  placeOrder(request: PerpOrderRequest): Promise<PerpOrderResult>;
  cancelOrder(symbol: string, venueOrderId: string): Promise<void>;
  getOrder(symbol: string, venueOrderId: string): Promise<PerpOrderResult>;
  listOpenOrders(): Promise<readonly PerpOrderResult[]>;
}

/**
 * Aligne une taille sur le pas de la plateforme, vers le bas.
 *
 * Toujours vers le bas : arrondir vers le haut fait dépasser le risque visé,
 * et un dépassement de risque ne se rattrape pas.
 */
export function alignSizeDown(size: number, step: number): number {
  if (step <= 0) return size;
  const steps = Math.floor(size / step + 1e-9);
  const aligned = steps * step;
  // Le produit réintroduit des décimales binaires ; on les coupe au pas.
  const decimals = decimalsOf(step);
  return Number(aligned.toFixed(decimals));
}

/** Nombre de décimales significatives d'un pas comme 0.001. */
export function decimalsOf(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const text = step.toExponential();
  const exponent = Number(text.slice(text.indexOf("e") + 1));
  return exponent < 0 ? -exponent : 0;
}

/**
 * La fraction de marge de maintenance déduite du levier maximal de l'actif,
 * selon la règle de Hyperliquid : mmf = 1 / (2 × maxLeverage).
 */
export function maintenanceMarginFromMaxLeverage(maxLeverage: number): number {
  if (maxLeverage <= 0) return 0.5;
  return 1 / (2 * maxLeverage);
}
