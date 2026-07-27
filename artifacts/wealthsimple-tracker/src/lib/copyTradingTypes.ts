/**
 * Types partagés pour le Copy Trading côté frontend.
 * Miroir des types normalisés retournés par l'API.
 */
export interface NormalizedTrader {
  strategyId: string;
  displayName: string;
  description?: string;
  gainPct: number | null;
  maxDrawdownPct: number | null;
  totalTrades: number | null;
  winRatePct: number | null;
  subscribers: number | null;
}
