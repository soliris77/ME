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
 * Calcule l'objectif de prix suggéré (pour le ratio R/R) :
 * - le plus haut récent (ex. plus haut 20 jours) s'il offre au moins un R/R de 1:1
 *   (résistance réaliste, mais inutile si elle est collée à l'entrée)
 * - sinon 2× le risque au-dessus de l'entrée (R/R 1:2)
 * Requiert une entrée et un stop valides (stop < entrée) — le risque par action
 * définit l'échelle de la récompense.
 */
export function suggestTarget(
  entry: number | undefined,
  stop: number | undefined,
  recentHigh?: number,
  recentHighLabel?: string
): StopSuggestion | null {
  if (!entry || entry <= 0 || !stop || stop <= 0 || stop >= entry) return null;
  const risk = entry - stop;
  if (recentHigh != null && recentHigh >= entry + risk) {
    return { value: recentHigh, source: recentHighLabel ?? "plus haut récent" };
  }
  return { value: entry + 2 * risk, source: "2× le risque (R/R 1:2)" };
}

/** Espacement quotidien : ≥ 20 h entre bougies (fuseaux/week-ends), ≤ 5 jours (exclut hebdo/mensuel). */
function isDailySpacing(history: { date: string }[]): boolean {
  const gaps: number[] = [];
  for (let i = 1; i < Math.min(history.length, 6); i++) {
    gaps.push(Math.abs(new Date(history[i].date).getTime() - new Date(history[i - 1].date).getTime()));
  }
  const H = 3_600_000;
  return gaps.every((g) => g >= 20 * H && g <= 5 * 24 * H);
}

/**
 * Extrait le plus haut des 20 dernières bougies QUOTIDIENNES.
 * Retourne undefined si l'historique est intraday, compte moins de 20 bougies
 * quotidiennes ou moins de 20 plus hauts valides — dans ce cas la suggestion
 * retombe sur 2× le risque au-dessus de l'entrée.
 */
export function twentyDayHigh(
  history: { date: string; high: number | null }[]
): number | undefined {
  if (history.length < 20 || !isDailySpacing(history)) return undefined;
  const highs = history
    .slice(-20)
    .map((p) => p.high)
    .filter((h): h is number => h != null && h > 0);
  return highs.length === 20 ? Math.max(...highs) : undefined;
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
  if (history.length < 20 || !isDailySpacing(history)) return undefined;

  // Exige 20 plus bas valides pour mériter le libellé « plus bas 20 jours ».
  const lows = history
    .slice(-20)
    .map((p) => p.low)
    .filter((l): l is number => l != null && l > 0);
  return lows.length === 20 ? Math.min(...lows) : undefined;
}
