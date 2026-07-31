// ─── Suggestion de stop-loss pour le calculateur de position ─────────────────

export interface StopSuggestion {
  value: number;
  source: string;
}

/**
 * Calcule le stop-loss suggéré :
 * - le plus bas récent (ex. plus bas 20 jours) s'il est strictement sous l'entrée
 * - sinon -2 % sous le prix d'entrée
 */
export function suggestStopLoss(
  entry: number | undefined,
  recentLow?: number,
  recentLowLabel?: string
): StopSuggestion | null {
  if (!entry || entry <= 0) return null;
  if (recentLow != null && recentLow > 0 && recentLow < entry) {
    return { value: recentLow, source: recentLowLabel ?? "plus bas récent" };
  }
  return { value: entry * 0.98, source: "-2 % sous l'entrée" };
}

/**
 * Extrait le plus bas des 20 dernières bougies QUOTIDIENNES.
 * Retourne undefined si l'historique est intraday, compte moins de 20 bougies quotidiennes
 * ou moins de 20 plus bas valides —
 * dans ce cas la suggestion retombe sur -2 % sous l'entrée.
 */
export function twentyDayLow(
  history: { date: string; low: number | null }[]
): number | undefined {
  if (history.length < 20) return undefined;
  // Vérifie l'espacement quotidien (≥ 20 h entre bougies pour tolérer fuseaux/week-ends,
  // ≤ 5 jours pour exclure les bougies hebdomadaires/mensuelles).
  const gaps: number[] = [];
  for (let i = 1; i < Math.min(history.length, 6); i++) {
    gaps.push(Math.abs(new Date(history[i].date).getTime() - new Date(history[i - 1].date).getTime()));
  }
  const H = 3_600_000;
  if (!gaps.every((g) => g >= 20 * H && g <= 5 * 24 * H)) return undefined;

  // Exige 20 plus bas valides pour mériter le libellé « plus bas 20 jours ».
  const lows = history
    .slice(-20)
    .map((p) => p.low)
    .filter((l): l is number => l != null && l > 0);
  return lows.length === 20 ? Math.min(...lows) : undefined;
}
