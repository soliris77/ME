/**
 * Le score de momentum.
 *
 * Principe : on ne mesure pas « +14 % », on mesure l'écart au comportement
 * habituel de la paire. Une paire qui bouge de 10 % tous les jours ne doit pas
 * sonner pour 10 % ; une paire calme qui fait 6 % doit sonner.
 *
 * L'ATR est injecté par l'appelant — voir types.ts.
 */
import type { MomentumScore, ScoreWeights } from './types';

/** Bougie minimale attendue. Compatible avec Candle de @workspace/indicators. */
export interface ScoreCandle {
  close: number;
  volume: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  acceleration: 0.35,
  volume: 0.30,
  amplitude: 0.35,
};

/** Au-delà de cette extension, on signale mais on n'entre pas. */
export const MAX_ENTRY_EXTENSION_ATR = 3;

/** Nombre minimal de bougies avant de se prononcer. */
export const MIN_CANDLES = 120;

const SHORT_WINDOW = 4;        // 4 bougies de 15 min = 1 heure
const BASELINE_WINDOW = 96;    // 96 bougies = 24 heures
const VOLUME_WINDOW = 20;

export function computeMomentum(
  symbol: string,
  candles: readonly ScoreCandle[],
  atrValue: number,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): MomentumScore | null {
  if (candles.length < MIN_CANDLES) return null;
  if (!Number.isFinite(atrValue) || atrValue <= 0) return null;

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const last = closes[closes.length - 1];
  const shortAgo = closes[closes.length - 1 - SHORT_WINDOW];

  const rocPct = pctChange(shortAgo, last);

  const baselineSlice = closes.slice(-(BASELINE_WINDOW + SHORT_WINDOW + 1), -(SHORT_WINDOW + 1));
  const rocBaselinePct = averageAbsChange(baselineSlice, SHORT_WINDOW);
  const acceleration = rocBaselinePct > 0 ? Math.abs(rocPct) / rocBaselinePct : 0;

  const volumeBaseline = median(volumes.slice(-(VOLUME_WINDOW + 1), -1));
  const volumeRatio = volumeBaseline > 0 ? volumes[volumes.length - 1] / volumeBaseline : 0;

  const atrMultiple = Math.abs(last - shortAgo) / atrValue;

  const breakout = Math.max(...closes.slice(-(BASELINE_WINDOW + 1), -(SHORT_WINDOW + 1)));
  const extensionAtr = (last - breakout) / atrValue;
  const tooExtended = extensionAtr > MAX_ENTRY_EXTENSION_ATR;

  const raw =
    weights.acceleration * clamp01(acceleration / 4) +
    weights.volume       * clamp01(volumeRatio / 5) +
    weights.amplitude    * clamp01(atrMultiple / 4);

  const reasons: string[] = [];
  if (acceleration >= 2) reasons.push(`accélération x${acceleration.toFixed(1)}`);
  if (volumeRatio >= 2)  reasons.push(`volume x${volumeRatio.toFixed(1)}`);
  if (atrMultiple >= 2)  reasons.push(`${atrMultiple.toFixed(1)} ATR`);
  if (tooExtended)       reasons.push('trop étendu pour entrer');

  return {
    symbol,
    score: Math.round(clamp01(raw) * 100),
    rocPct,
    rocBaselinePct,
    volumeRatio,
    atrMultiple,
    extensionAtr,
    tooExtended,
    reasons,
  };
}

export function pctChange(from: number, to: number): number {
  if (!Number.isFinite(from) || from === 0) return 0;
  return ((to - from) / Math.abs(from)) * 100;
}

/** Variation absolue moyenne sur des fenêtres glissantes de `window` bougies. */
export function averageAbsChange(closes: readonly number[], window: number): number {
  if (closes.length <= window) return 0;
  let total = 0;
  let count = 0;
  for (let i = window; i < closes.length; i++) {
    total += Math.abs(pctChange(closes[i - window], closes[i]));
    count++;
  }
  return count > 0 ? total / count : 0;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
