/**
 * Mesure des résultats — c'est la partie qui rend le scanner honnête.
 *
 * Chaque détection est réévaluée à 1 h, 4 h et 24 h. On n'enregistre pas
 * seulement le prix de clôture : on enregistre le meilleur et le pire point
 * atteints entre-temps. Un scanner qui « avait raison » mais qui serait passé
 * par -30 % avant n'avait pas raison.
 */

export const HORIZONS_MINUTES: readonly number[] = [60, 240, 1440];

/** Au-delà de ce délai sans données, un horizon est abandonné plutôt que réessayé sans fin. */
export const HORIZON_GRACE_MINUTES = 7 * 24 * 60;

export interface OutcomeCandle {
  timestamp: number;   // epoch ms, début de bougie
  high: number;
  low: number;
  close: number;
}

export interface HorizonOutcome {
  horizonMinutes: number;
  priceAtHorizon: number;
  /** Variation de clôture à l'horizon, en %. */
  returnPct: number;
  /** Meilleur point atteint pendant la fenêtre, en % — toujours >= 0. */
  maxFavorablePct: number;
  /** Pire point atteint pendant la fenêtre, en % — toujours <= 0. */
  maxAdversePct: number;
  /** Nombre de bougies effectivement utilisées : 0 => résultat non fiable. */
  candlesUsed: number;
}

/**
 * Horizons échus et pas encore évalués pour une détection donnée.
 * `alreadyEvaluated` = horizons déjà écrits dans scanner_outcomes.
 */
export function dueHorizons(
  detectedAt: number,
  now: number,
  alreadyEvaluated: readonly number[] = [],
  horizons: readonly number[] = HORIZONS_MINUTES,
): number[] {
  const done = new Set(alreadyEvaluated);
  return horizons.filter(h => !done.has(h) && now >= detectedAt + h * 60_000);
}

/** Vrai quand l'horizon est échu depuis si longtemps qu'il ne sert plus à rien d'attendre les données. */
export function horizonAbandoned(detectedAt: number, horizonMinutes: number, now: number): boolean {
  return now > detectedAt + (horizonMinutes + HORIZON_GRACE_MINUTES) * 60_000;
}

/**
 * Évalue un horizon à partir des bougies postérieures à la détection.
 * Retourne null si aucune bougie ne couvre la fenêtre — l'appelant réessaiera
 * au cycle suivant, ou abandonnera via `horizonAbandoned`.
 */
export function evaluateHorizon(
  priceAtHit: number,
  detectedAt: number,
  horizonMinutes: number,
  candles: readonly OutcomeCandle[],
): HorizonOutcome | null {
  if (!Number.isFinite(priceAtHit) || priceAtHit <= 0) return null;

  const end = detectedAt + horizonMinutes * 60_000;
  const window = candles.filter(c => c.timestamp > detectedAt && c.timestamp <= end);
  if (window.length === 0) return null;

  let high = -Infinity;
  let low = Infinity;
  for (const candle of window) {
    if (candle.high > high) high = candle.high;
    if (candle.low < low) low = candle.low;
  }

  const last = window[window.length - 1];
  const pct = (value: number) => ((value - priceAtHit) / priceAtHit) * 100;

  return {
    horizonMinutes,
    priceAtHorizon: last.close,
    returnPct: round4(pct(last.close)),
    // Bornées : si le prix n'est jamais monté au-dessus du point d'entrée,
    // le meilleur point est 0, pas une valeur négative.
    maxFavorablePct: round4(Math.max(0, pct(high))),
    maxAdversePct: round4(Math.min(0, pct(low))),
    candlesUsed: window.length,
  };
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
