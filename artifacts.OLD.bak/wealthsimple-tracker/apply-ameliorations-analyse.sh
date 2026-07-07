#!/usr/bin/env bash
# Script à coller dans le Shell de Replit, à la racine du projet
# artifacts/wealthsimple-tracker (là où se trouve package.json de l'app).
# Ce script NE TOUCHE À AUCUN appel API : uniquement l'affichage/analyse frontend
# + un journal de trading stocké localement dans le navigateur (localStorage).
set -e
echo ">> Sauvegarde des fichiers actuels en .bak"
cp "src/lib/indicators.ts" "src/lib/indicators.ts.bak" 2>/dev/null || true
cp "src/lib/journal.ts" "src/lib/journal.ts.bak" 2>/dev/null || true
cp "src/components/TechnicalAnalysis.tsx" "src/components/TechnicalAnalysis.tsx.bak" 2>/dev/null || true
cp "src/components/TradingJournal.tsx" "src/components/TradingJournal.tsx.bak" 2>/dev/null || true
cp "src/pages/QuoteDetail.tsx" "src/pages/QuoteDetail.tsx.bak" 2>/dev/null || true

echo ">> Écriture de src/lib/indicators.ts"
mkdir -p "$(dirname 'src/lib/indicators.ts')"
cat > 'src/lib/indicators.ts' << 'EOF_WMM_PATCH'
export interface OHLCPoint {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export interface IndicatorPoint {
  date: string;
  close: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  sma20?: number;
  sma50?: number;
  ema12?: number;
  ema26?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  rsi?: number;
  macdLine?: number;
  macdSignal?: number;
  macdHist?: number;
  atr?: number;
}

export interface CandlePattern {
  idx: number;
  date: string;
  name: string;
  nameEn: string;
  signal: "haussier" | "baissier" | "neutre";
  strength: "fort" | "moyen" | "faible";
  description: string;
  howToUse: string;
  candles: number;
}

export interface PriceGap {
  idx: number;
  date: string;
  type: "haussier" | "baissier";
  gapPct: number;
  prevClose: number;
  open: number;
  filled: boolean;
}

export interface SRLevel {
  price: number;
  type: "support" | "resistance";
  touches: number;
  strength: "fort" | "moyen" | "faible";
  distancePct: number;
}

export interface VolatilityInfo {
  atr: number;
  atrPct: number;
  label: "faible" | "modérée" | "élevée";
  stopLossLong: number;
  takeProfitLong: number;
  stopLossShort: number;
  takeProfitShort: number;
}

export interface MarketStructure {
  trend: "haussière" | "baissière" | "range";
  label: string;
  description: string;
  swingHighs: { idx: number; date: string; price: number }[];
  swingLows: { idx: number; date: string; price: number }[];
}

export interface FibLevel {
  ratio: number;
  label: string;
  price: number;
}

export interface FibonacciResult {
  direction: "haussier" | "baissier";
  swingHigh: number;
  swingLow: number;
  levels: FibLevel[];
}

export interface Divergence {
  idx: number;
  date: string;
  type: "haussière" | "baissière";
  indicator: "RSI" | "MACD";
  description: string;
}

export interface PatternBacktestStat {
  name: string;
  signal: "haussier" | "baissier" | "neutre";
  occurrences: number;
  winRate: number;
  avgReturnPct: number;
  lookaheadDays: number;
}

function sma(data: number[], period: number, idx: number): number | undefined {
  if (idx < period - 1) return undefined;
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) sum += data[i];
  return sum / period;
}

function ema(data: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else if (i === period - 1) {
      let s = 0;
      for (let j = 0; j < period; j++) s += data[j];
      result.push(s / period);
    } else {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
  }
  return result;
}

function rsi(closes: number[], period = 14): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(closes.length).fill(undefined);
  if (closes.length < period + 1) return result;

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result[period] = 100 - 100 / (1 + rs);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const r = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[i] = 100 - 100 / (1 + r);
  }
  return result;
}

function bollingerBands(closes: number[], period = 20, stdDevMult = 2) {
  return closes.map((_, idx) => {
    if (idx < period - 1) return { upper: undefined, middle: undefined, lower: undefined };
    const slice = closes.slice(idx - period + 1, idx + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    return {
      upper: mean + stdDevMult * sd,
      middle: mean,
      lower: mean - stdDevMult * sd,
    };
  });
}

function computeATRSeries(history: OHLCPoint[], period = 14): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(history.length).fill(undefined);
  const trueRanges: number[] = new Array(history.length).fill(NaN);

  for (let i = 0; i < history.length; i++) {
    const c = history[i];
    if (c.high === null || c.low === null) continue;
    const prevClose = i > 0 ? history[i - 1].close : c.close;
    trueRanges[i] = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  }

  for (let i = period - 1; i < trueRanges.length; i++) {
    if (i === period - 1) {
      const slice = trueRanges.slice(0, period);
      if (slice.some((v) => isNaN(v))) continue;
      result[i] = slice.reduce((a, b) => a + b, 0) / period;
    } else if (result[i - 1] !== undefined && !isNaN(trueRanges[i])) {
      result[i] = ((result[i - 1] as number) * (period - 1) + trueRanges[i]) / period;
    }
  }

  return result;
}

export function computeIndicators(history: OHLCPoint[]): IndicatorPoint[] {
  const closes = history.map((p) => p.close);
  const ema12Arr = ema(closes, 12);
  const ema26Arr = ema(closes, 26);

  const macdLineArr = ema12Arr.map((v, i) =>
    isNaN(v) || isNaN(ema26Arr[i]) ? NaN : v - ema26Arr[i]
  );
  const validMacd = macdLineArr.filter((v) => !isNaN(v));
  const signalOffset = macdLineArr.findIndex((v) => !isNaN(v));
  const macdSignalFull = ema(validMacd, 9);

  const rsiArr = rsi(closes, 14);
  const bbArr = bollingerBands(closes, 20, 2);
  const atrArr = computeATRSeries(history, 14);

  return history.map((p, i) => {
    const macdHistVal =
      !isNaN(macdLineArr[i]) && i - signalOffset >= 0 && !isNaN(macdSignalFull[i - signalOffset])
        ? macdLineArr[i] - macdSignalFull[i - signalOffset]
        : undefined;

    return {
      date: new Date(p.date).toLocaleDateString("fr-CA", { month: "short", day: "numeric" }),
      close: p.close,
      open: p.open,
      high: p.high,
      low: p.low,
      volume: p.volume,
      sma20: sma(closes, 20, i),
      sma50: sma(closes, 50, i),
      ema12: !isNaN(ema12Arr[i]) ? ema12Arr[i] : undefined,
      ema26: !isNaN(ema26Arr[i]) ? ema26Arr[i] : undefined,
      bbUpper: bbArr[i].upper,
      bbMiddle: bbArr[i].middle,
      bbLower: bbArr[i].lower,
      rsi: rsiArr[i],
      macdLine: !isNaN(macdLineArr[i]) ? macdLineArr[i] : undefined,
      macdSignal:
        i - signalOffset >= 0 && !isNaN(macdSignalFull[i - signalOffset])
          ? macdSignalFull[i - signalOffset]
          : undefined,
      macdHist: macdHistVal,
      atr: atrArr[i],
    };
  });
}

export function detectCandlePatterns(history: OHLCPoint[]): CandlePattern[] {
  const patterns: CandlePattern[] = [];

  for (let i = 0; i < history.length; i++) {
    const c = history[i];
    if (c.open === null || c.high === null || c.low === null) continue;

    const open = c.open;
    const high = c.high;
    const low = c.low;
    const close = c.close;
    const body = Math.abs(close - open);
    const range = high - low;
    const upperWick = high - Math.max(open, close);
    const lowerWick = Math.min(open, close) - low;
    const isBullish = close > open;
    const isBearish = close < open;
    const dateStr = new Date(c.date).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });

    if (range < 0.0001) continue;

    const bodyPct = body / range;

    // Doji (body < 10% of range)
    if (bodyPct < 0.1 && range > 0) {
      const isLongLegged = upperWick > body * 3 && lowerWick > body * 3;
      patterns.push({
        idx: i, date: dateStr,
        name: isLongLegged ? "Doji jambes longues" : "Doji",
        nameEn: "Doji",
        signal: "neutre",
        strength: "moyen",
        description: "L'ouverture et la clôture sont presque identiques — indécision totale entre acheteurs et vendeurs.",
        howToUse: "Seul, il ne donne pas de direction. Mais après une tendance forte, c'est souvent le signe qu'un retournement se prépare. Attendez la bougie suivante pour confirmer.",
        candles: 1,
      });
    }

    // Spinning Top (small body, roughly equal wicks)
    if (bodyPct > 0.05 && bodyPct < 0.3 && upperWick > body * 0.5 && lowerWick > body * 0.5 && Math.abs(upperWick - lowerWick) < body) {
      patterns.push({
        idx: i, date: dateStr,
        name: "Toupie",
        nameEn: "Spinning Top",
        signal: "neutre",
        strength: "faible",
        description: "Petit corps avec des mèches presque égales des deux côtés — hésitation entre acheteurs et vendeurs.",
        howToUse: "Signale une pause dans la tendance. Souvent précurseur d'un retournement si la tendance précédente était forte.",
        candles: 1,
      });
    }

    // Hammer (small body at top, long lower wick, bullish context)
    if (lowerWick > body * 2 && upperWick < body * 0.5 && bodyPct > 0.05 && bodyPct < 0.45 && lowerWick > range * 0.55) {
      patterns.push({
        idx: i, date: dateStr,
        name: isBullish ? "Marteau" : "Pendu",
        nameEn: "Hammer",
        signal: "haussier",
        strength: lowerWick > body * 3 ? "fort" : "moyen",
        description: "Longue mèche inférieure — les vendeurs ont essayé de pousser le prix vers le bas, mais les acheteurs ont repris le contrôle avant la clôture.",
        howToUse: "Au bas d'une tendance baissière, c'est un signal de retournement haussier fort. Cherchez une confirmation avec la bougie suivante verte.",
        candles: 1,
      });
    }

    // Inverted Hammer
    if (upperWick > body * 2 && lowerWick < body * 0.5 && bodyPct > 0.05 && bodyPct < 0.45 && upperWick > range * 0.55 && isBullish) {
      patterns.push({
        idx: i, date: dateStr,
        name: "Marteau inversé",
        nameEn: "Inverted Hammer",
        signal: "haussier",
        strength: "moyen",
        description: "Longue mèche supérieure avec un corps vert — les acheteurs commencent à reprendre le dessus.",
        howToUse: "Signal haussier après une baisse, mais plus faible que le marteau classique. Attendez confirmation.",
        candles: 1,
      });
    }

    // Shooting Star
    if (upperWick > body * 2 && lowerWick < body * 0.5 && bodyPct > 0.05 && bodyPct < 0.45 && upperWick > range * 0.55 && isBearish) {
      patterns.push({
        idx: i, date: dateStr,
        name: "Étoile filante",
        nameEn: "Shooting Star",
        signal: "baissier",
        strength: upperWick > body * 3 ? "fort" : "moyen",
        description: "Longue mèche supérieure avec un corps rouge — les acheteurs ont monté le prix mais les vendeurs ont repris le contrôle.",
        howToUse: "Au sommet d'une tendance haussière, c'est un signal de retournement baissier. Combiné avec un RSI > 70, signal très fiable.",
        candles: 1,
      });
    }

    // Marubozu Bullish (no wicks)
    if (isBullish && bodyPct > 0.92 && upperWick < body * 0.04 && lowerWick < body * 0.04) {
      patterns.push({
        idx: i, date: dateStr,
        name: "Marubozu haussier",
        nameEn: "Bullish Marubozu",
        signal: "haussier",
        strength: "fort",
        description: "Bougie verte sans mèches — les acheteurs ont dominé toute la période sans interruption. Fort momentum.",
        howToUse: "Signal de forte conviction haussière. Dans la direction d'une tendance, c'est un signal de continuation fort.",
        candles: 1,
      });
    }

    // Marubozu Bearish
    if (isBearish && bodyPct > 0.92 && upperWick < body * 0.04 && lowerWick < body * 0.04) {
      patterns.push({
        idx: i, date: dateStr,
        name: "Marubozu baissier",
        nameEn: "Bearish Marubozu",
        signal: "baissier",
        strength: "fort",
        description: "Bougie rouge sans mèches — les vendeurs ont dominé toute la période. Fort momentum baissier.",
        howToUse: "Signal de forte conviction baissière. Évitez d'acheter à contre-tendance après un tel signal.",
        candles: 1,
      });
    }

    // === 2-candle patterns ===
    if (i >= 1) {
      const prev = history[i - 1];
      if (prev.open === null || prev.high === null || prev.low === null) continue;

      const prevOpen = prev.open;
      const prevClose = prev.close;
      const prevBody = Math.abs(prevClose - prevOpen);
      const prevBullish = prevClose > prevOpen;
      const prevBearish = prevClose < prevOpen;

      // Bullish Engulfing
      if (prevBearish && isBullish && body > prevBody * 1.05 && open <= prevClose && close >= prevOpen) {
        patterns.push({
          idx: i, date: dateStr,
          name: "Engulfing haussier",
          nameEn: "Bullish Engulfing",
          signal: "haussier",
          strength: body > prevBody * 1.5 ? "fort" : "moyen",
          description: "La grande bougie verte englobe entièrement la rouge précédente — les acheteurs ont complètement dominé les vendeurs.",
          howToUse: "L'un des patterns de retournement les plus fiables. Très efficace au bas d'une tendance. Plus la verte est grande par rapport à la rouge, plus c'est fort.",
          candles: 2,
        });
      }

      // Bearish Engulfing
      if (prevBullish && isBearish && body > prevBody * 1.05 && open >= prevClose && close <= prevOpen) {
        patterns.push({
          idx: i, date: dateStr,
          name: "Engulfing baissier",
          nameEn: "Bearish Engulfing",
          signal: "baissier",
          strength: body > prevBody * 1.5 ? "fort" : "moyen",
          description: "La grande bougie rouge englobe entièrement la verte précédente — les vendeurs ont pris complètement le dessus.",
          howToUse: "Excellent signal de sortie au sommet d'une hausse. Utilisez-le pour vendre ou placer un stop serré.",
          candles: 2,
        });
      }

      // Tweezer Bottom (two candles with same low - bullish)
      if (prevBearish && isBullish && Math.abs((prev.low ?? 0) - (c.low ?? 0)) < range * 0.02) {
        patterns.push({
          idx: i, date: dateStr,
          name: "Double plancher (Tweezer Bottom)",
          nameEn: "Tweezer Bottom",
          signal: "haussier",
          strength: "moyen",
          description: "Deux bougies consécutives touchent exactement le même bas — fort support à ce niveau.",
          howToUse: "Signal que le marché refuse de descendre sous ce niveau. Bon point d'entrée avec un stop sous le support.",
          candles: 2,
        });
      }

      // Tweezer Top (two candles with same high - bearish)
      if (prevBullish && isBearish && Math.abs((prev.high ?? 0) - (c.high ?? 0)) < range * 0.02) {
        patterns.push({
          idx: i, date: dateStr,
          name: "Double plafond (Tweezer Top)",
          nameEn: "Tweezer Top",
          signal: "baissier",
          strength: "moyen",
          description: "Deux bougies consécutives touchent exactement le même haut — forte résistance à ce niveau.",
          howToUse: "Signal que le marché refuse de monter au-delà de ce niveau. Forte résistance — potentiel point de vente.",
          candles: 2,
        });
      }
    }

    // === 3-candle patterns ===
    if (i >= 2) {
      const p1 = history[i - 2];
      const p2 = history[i - 1];
      if (p1.open === null || p2.open === null || p2.high === null || p2.low === null) continue;

      const p1Bull = p1.close > p1.open;
      const p1Bear = p1.close < p1.open;
      const p2Body = Math.abs(p2.close - p2.open);
      const p2Range = (p2.high ?? p2.close) - (p2.low ?? p2.close);
      const p2IsSmall = p2Range > 0 ? p2Body / p2Range < 0.35 : false;
      const p2IsBull = p2.close > p2.open;
      const p2IsBear = p2.close < p2.open;

      // Morning Star
      if (p1Bear && p2IsSmall && isBullish && close > (p1.open + p1.close) / 2) {
        patterns.push({
          idx: i, date: dateStr,
          name: "Étoile du matin",
          nameEn: "Morning Star",
          signal: "haussier",
          strength: "fort",
          description: "3 bougies : baisse, hésitation (petit corps), puis forte hausse — signal de retournement haussier très fiable.",
          howToUse: "L'un des patterns de retournement les plus puissants. La 3e bougie verte doit clôturer au-dessus du milieu de la 1re rouge pour confirmer.",
          candles: 3,
        });
      }

      // Evening Star
      if (p1Bull && p2IsSmall && isBearish && close < (p1.open + p1.close) / 2) {
        patterns.push({
          idx: i, date: dateStr,
          name: "Étoile du soir",
          nameEn: "Evening Star",
          signal: "baissier",
          strength: "fort",
          description: "3 bougies : hausse, hésitation (petit corps), puis forte baisse — signal de retournement baissier très fiable.",
          howToUse: "Très efficace au sommet d'une tendance. Combiné avec un RSI > 70, signal de vente excellent.",
          candles: 3,
        });
      }

      // Three White Soldiers
      if (p1Bull && p2IsBull && isBullish) {
        const p1B = Math.abs(p1.close - p1.open);
        const p2B = Math.abs(p2.close - p2.open);
        const goodBodies = p1B > 0 && p2B > 0 && body > 0;
        const ascending = p2.open > p1.open && close > p2.close && p2.close > p1.close;
        if (goodBodies && ascending) {
          patterns.push({
            idx: i, date: dateStr,
            name: "Trois soldats blancs",
            nameEn: "Three White Soldiers",
            signal: "haussier",
            strength: "fort",
            description: "Trois bougies vertes consécutives de plus en plus hautes — pression acheteuse constante et forte.",
            howToUse: "Signal de début de tendance haussière forte. Idéal pour entrer en position avec un stop sous la 1re bougie.",
            candles: 3,
          });
        }
      }

      // Three Black Crows
      if (p1Bear && p2IsBear && isBearish) {
        const p1B = Math.abs(p1.close - p1.open);
        const p2B = Math.abs(p2.close - p2.open);
        const goodBodies = p1B > 0 && p2B > 0 && body > 0;
        const descending = p2.open < p1.open && close < p2.close && p2.close < p1.close;
        if (goodBodies && descending) {
          patterns.push({
            idx: i, date: dateStr,
            name: "Trois corbeaux noirs",
            nameEn: "Three Black Crows",
            signal: "baissier",
            strength: "fort",
            description: "Trois bougies rouges consécutives de plus en plus basses — pression vendeuse constante et forte.",
            howToUse: "Signal de début de tendance baissière. Évitez d'acheter et attendez un signal de retournement clair.",
            candles: 3,
          });
        }
      }
    }
  }

  return patterns;
}

/**
 * Détecte les "gaps" de prix : quand l'ouverture d'une bougie est nettement
 * différente de la clôture précédente (souvent après une nouvelle, un rapport
 * de résultats, ou une reprise après fermeture du marché).
 */
export function detectPriceGaps(history: OHLCPoint[], minGapPct = 0.5): PriceGap[] {
  const gaps: PriceGap[] = [];

  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const c = history[i];
    if (c.open === null || prev.close === null || prev.close === 0) continue;

    const prevClose = prev.close;
    const open = c.open;
    const gapPct = ((open - prevClose) / prevClose) * 100;
    if (Math.abs(gapPct) < minGapPct) continue;

    const type: "haussier" | "baissier" = gapPct > 0 ? "haussier" : "baissier";

    // Un gap est "comblé" si le prix est revenu toucher le niveau de clôture précédent
    let filled = false;
    for (let j = i; j < history.length; j++) {
      const h = history[j].high;
      const l = history[j].low;
      if (h === null || l === null) continue;
      if (type === "haussier" && l <= prevClose) { filled = true; break; }
      if (type === "baissier" && h >= prevClose) { filled = true; break; }
    }

    gaps.push({
      idx: i,
      date: new Date(c.date).toLocaleDateString("fr-CA", { month: "short", day: "numeric" }),
      type,
      gapPct: Math.round(gapPct * 100) / 100,
      prevClose,
      open,
      filled,
    });
  }

  return gaps;
}

/**
 * Détecte des niveaux de support/résistance automatiques en repérant les
 * points pivots (sommets et creux locaux) puis en regroupant les niveaux
 * proches entre eux. Plus un niveau a été "touché" souvent, plus il est fort.
 */
export function detectSupportResistance(
  history: OHLCPoint[],
  currentPrice: number,
  lookback = 3,
  tolerancePct = 0.8,
  maxLevels = 4
): SRLevel[] {
  const pivots: number[] = [];

  for (let i = lookback; i < history.length - lookback; i++) {
    const h = history[i].high;
    const l = history[i].low;
    if (h === null || l === null) continue;

    let isPivotHigh = true;
    let isPivotLow = true;
    for (let k = 1; k <= lookback; k++) {
      const hb = history[i - k].high, ha = history[i + k].high;
      const lb = history[i - k].low, la = history[i + k].low;
      if (hb === null || ha === null || h < hb || h < ha) isPivotHigh = false;
      if (lb === null || la === null || l > lb || l > la) isPivotLow = false;
    }
    if (isPivotHigh) pivots.push(h);
    if (isPivotLow) pivots.push(l);
  }

  if (pivots.length === 0) return [];

  const sorted = [...pivots].sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const p of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && p > 0 && Math.abs(p - last[last.length - 1]) / p * 100 <= tolerancePct) {
      last.push(p);
    } else {
      clusters.push([p]);
    }
  }

  const levels: SRLevel[] = clusters
    .map((prices) => {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const touches = prices.length;
      const strength: SRLevel["strength"] = touches >= 4 ? "fort" : touches >= 2 ? "moyen" : "faible";
      return {
        price: Math.round(avg * 100) / 100,
        type: (avg < currentPrice ? "support" : "resistance") as SRLevel["type"],
        touches,
        strength,
        distancePct: Math.round(((avg - currentPrice) / currentPrice) * 1000) / 10,
      };
    })
    .filter((l) => l.touches >= 2)
    .sort((a, b) => b.touches - a.touches)
    .slice(0, maxLevels)
    .sort((a, b) => b.price - a.price);

  return levels;
}

/**
 * Traduit l'ATR (volatilité moyenne) en une jauge simple + des suggestions
 * de stop-loss / take-profit basées sur la volatilité réelle du titre,
 * plutôt que sur un pourcentage fixe arbitraire.
 */
export function getVolatilityInfo(data: IndicatorPoint[], currentPrice: number): VolatilityInfo | null {
  const last = data[data.length - 1];
  if (!last || last.atr === undefined || last.atr <= 0 || currentPrice <= 0) return null;

  const atrVal = last.atr;
  const atrPct = (atrVal / currentPrice) * 100;
  const label: VolatilityInfo["label"] = atrPct < 1.5 ? "faible" : atrPct < 3 ? "modérée" : "élevée";

  return {
    atr: Math.round(atrVal * 100) / 100,
    atrPct: Math.round(atrPct * 100) / 100,
    label,
    stopLossLong: Math.round((currentPrice - atrVal * 1.5) * 100) / 100,
    takeProfitLong: Math.round((currentPrice + atrVal * 2.5) * 100) / 100,
    stopLossShort: Math.round((currentPrice + atrVal * 1.5) * 100) / 100,
    takeProfitShort: Math.round((currentPrice - atrVal * 2.5) * 100) / 100,
  };
}

/**
 * Analyse la structure du marché (sommets/creux) pour déterminer si on est
 * dans une tendance haussière, baissière, ou un range latéral.
 */
export function detectMarketStructure(history: OHLCPoint[], lookback = 3): MarketStructure {
  const highs: { idx: number; date: string; price: number }[] = [];
  const lows: { idx: number; date: string; price: number }[] = [];

  for (let i = lookback; i < history.length - lookback; i++) {
    const h = history[i].high;
    const l = history[i].low;
    if (h === null || l === null) continue;

    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= lookback; k++) {
      const hb = history[i - k].high, ha = history[i + k].high;
      const lb = history[i - k].low, la = history[i + k].low;
      if (hb === null || ha === null || h < hb || h < ha) isHigh = false;
      if (lb === null || la === null || l > lb || l > la) isLow = false;
    }
    const dateStr = new Date(history[i].date).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
    if (isHigh) highs.push({ idx: i, date: dateStr, price: h });
    if (isLow) lows.push({ idx: i, date: dateStr, price: l });
  }

  const lastHighs = highs.slice(-2);
  const lastLows = lows.slice(-2);

  let trend: MarketStructure["trend"] = "range";
  let description = "Le prix évolue latéralement sans direction claire — ni sommets ni creux qui progressent nettement dans une direction. Souvent le bon moment pour attendre.";

  if (lastHighs.length === 2 && lastLows.length === 2) {
    const higherHighs = lastHighs[1].price > lastHighs[0].price;
    const higherLows = lastLows[1].price > lastLows[0].price;
    const lowerHighs = lastHighs[1].price < lastHighs[0].price;
    const lowerLows = lastLows[1].price < lastLows[0].price;

    if (higherHighs && higherLows) {
      trend = "haussière";
      description = "Sommets et creux de plus en plus hauts — structure classique d'une tendance haussière saine. Les traders cherchent des points d'entrée sur les replis (creux).";
    } else if (lowerHighs && lowerLows) {
      trend = "baissière";
      description = "Sommets et creux de plus en plus bas — structure classique d'une tendance baissière. Prudence à l'achat tant que ce schéma persiste.";
    }
  }

  const label = trend === "haussière" ? "📈 Tendance haussière" : trend === "baissière" ? "📉 Tendance baissière" : "↔️ Range latéral";

  return { trend, label, description, swingHighs: highs.slice(-4), swingLows: lows.slice(-4) };
}

/**
 * Calcule les niveaux de retracement de Fibonacci sur le dernier mouvement
 * significatif (plus haut / plus bas) de la période analysée.
 */
export function computeFibonacciLevels(history: OHLCPoint[], lookback = 90): FibonacciResult | null {
  const slice = history.slice(-lookback).filter((p) => p.high !== null && p.low !== null);
  if (slice.length < 10) return null;

  let highIdx = 0, lowIdx = 0;
  let high = -Infinity, low = Infinity;
  slice.forEach((p, i) => {
    const h = p.high as number;
    const l = p.low as number;
    if (h > high) { high = h; highIdx = i; }
    if (l < low) { low = l; lowIdx = i; }
  });

  if (!isFinite(high) || !isFinite(low) || high <= low) return null;

  // Si le creux est survenu avant le sommet → mouvement haussier, on trace la correction depuis le haut
  const direction: "haussier" | "baissier" = lowIdx < highIdx ? "haussier" : "baissier";
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

  const levels: FibLevel[] = ratios.map((r) => {
    const price = direction === "haussier" ? high - (high - low) * r : low + (high - low) * r;
    return { ratio: r, label: `${(r * 100).toFixed(1)}%`, price: Math.round(price * 100) / 100 };
  });

  return { direction, swingHigh: Math.round(high * 100) / 100, swingLow: Math.round(low * 100) / 100, levels };
}

/**
 * Détecte les divergences entre le prix et le RSI/MACD : quand le prix fait
 * un nouveau sommet/creux mais que l'indicateur ne confirme pas, c'est
 * souvent un signal précoce de retournement.
 */
export function detectDivergences(data: IndicatorPoint[], lookback = 3): Divergence[] {
  const divergences: Divergence[] = [];
  const closeHighs: { idx: number; price: number }[] = [];
  const closeLows: { idx: number; price: number }[] = [];

  for (let i = lookback; i < data.length - lookback; i++) {
    const c = data[i].close;
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= lookback; k++) {
      if (data[i - k].close > c || data[i + k].close > c) isHigh = false;
      if (data[i - k].close < c || data[i + k].close < c) isLow = false;
    }
    if (isHigh) closeHighs.push({ idx: i, price: c });
    if (isLow) closeLows.push({ idx: i, price: c });
  }

  // Divergence baissière : prix fait un plus haut, l'indicateur fait un plus bas
  if (closeHighs.length >= 2) {
    const [a, b] = closeHighs.slice(-2);
    const rsiA = data[a.idx].rsi, rsiB = data[b.idx].rsi;
    if (b.price > a.price && rsiA !== undefined && rsiB !== undefined && rsiB < rsiA) {
      divergences.push({
        idx: b.idx, date: data[b.idx].date, type: "baissière", indicator: "RSI",
        description: "Le prix a fait un nouveau sommet plus haut, mais le RSI a fait un sommet plus bas — le momentum faiblit malgré la hausse du prix. Signal d'essoufflement potentiel.",
      });
    }
    const macdA = data[a.idx].macdLine, macdB = data[b.idx].macdLine;
    if (b.price > a.price && macdA !== undefined && macdB !== undefined && macdB < macdA) {
      divergences.push({
        idx: b.idx, date: data[b.idx].date, type: "baissière", indicator: "MACD",
        description: "Le prix monte mais le MACD baisse entre les deux derniers sommets — la force acheteuse diminue. Prudence recommandée.",
      });
    }
  }

  // Divergence haussière : prix fait un plus bas, l'indicateur fait un plus haut
  if (closeLows.length >= 2) {
    const [a, b] = closeLows.slice(-2);
    const rsiA = data[a.idx].rsi, rsiB = data[b.idx].rsi;
    if (b.price < a.price && rsiA !== undefined && rsiB !== undefined && rsiB > rsiA) {
      divergences.push({
        idx: b.idx, date: data[b.idx].date, type: "haussière", indicator: "RSI",
        description: "Le prix a fait un nouveau creux plus bas, mais le RSI a fait un creux plus haut — les vendeurs s'essoufflent. Signal de retournement potentiel à la hausse.",
      });
    }
    const macdA = data[a.idx].macdLine, macdB = data[b.idx].macdLine;
    if (b.price < a.price && macdA !== undefined && macdB !== undefined && macdB > macdA) {
      divergences.push({
        idx: b.idx, date: data[b.idx].date, type: "haussière", indicator: "MACD",
        description: "Le prix baisse mais le MACD monte entre les deux derniers creux — la pression vendeuse diminue.",
      });
    }
  }

  return divergences;
}

/**
 * "Backtest" léger : pour chaque pattern déjà détecté sur cet actif, regarde
 * ce qui s'est passé N jours après chaque occurrence passée, et calcule un
 * taux de réussite + rendement moyen. Donne du concret plutôt qu'une règle
 * théorique générique.
 */
export function backtestPatterns(history: OHLCPoint[], patterns: CandlePattern[], lookahead = 3): Record<string, PatternBacktestStat> {
  const buckets: Record<string, { signal: CandlePattern["signal"]; wins: number; total: number; returns: number[] }> = {};

  for (const p of patterns) {
    if (p.signal === "neutre") continue;
    const exitIdx = p.idx + lookahead;
    if (exitIdx >= history.length) continue;

    const entryClose = history[p.idx].close;
    const exitClose = history[exitIdx].close;
    if (!entryClose || !exitClose) continue;

    const returnPct = ((exitClose - entryClose) / entryClose) * 100;
    const won = p.signal === "haussier" ? returnPct > 0 : returnPct < 0;

    if (!buckets[p.name]) buckets[p.name] = { signal: p.signal, wins: 0, total: 0, returns: [] };
    buckets[p.name].total += 1;
    if (won) buckets[p.name].wins += 1;
    buckets[p.name].returns.push(returnPct);
  }

  const result: Record<string, PatternBacktestStat> = {};
  for (const [name, b] of Object.entries(buckets)) {
    if (b.total < 2) continue; // pas assez d'occurrences pour être significatif
    result[name] = {
      name,
      signal: b.signal,
      occurrences: b.total,
      winRate: Math.round((b.wins / b.total) * 1000) / 10,
      avgReturnPct: Math.round((b.returns.reduce((a, c) => a + c, 0) / b.returns.length) * 100) / 100,
      lookaheadDays: lookahead,
    };
  }
  return result;
}

export type SignalStrength = "FORT ACHAT" | "ACHAT" | "NEUTRE" | "VENTE" | "FORTE VENTE";

export interface TradingSignal {
  overall: SignalStrength;
  score: number;
  signals: {
    name: string;
    value: string;
    verdict: "buy" | "sell" | "neutral";
    description: string;
    beginnerTip: string;
  }[];
  recommendation: string;
  beginnerSummary: string;
}

export function analyzeTradingSignals(data: IndicatorPoint[], currentPrice: number): TradingSignal {
  const signals: TradingSignal["signals"] = [];
  let score = 0;

  const last = data[data.length - 1];
  const prev = data.length > 1 ? data[data.length - 2] : null;

  // RSI
  if (last.rsi !== undefined) {
    const r = last.rsi;
    if (r < 30) {
      signals.push({ name: "RSI (Force relative)", value: r.toFixed(1), verdict: "buy", description: "RSI en zone de survente — rebond probable", beginnerTip: "Le RSI mesure si un actif a trop baissé. En dessous de 30, les vendeurs sont épuisés — le prix remonte souvent." });
      score += 25;
    } else if (r > 70) {
      signals.push({ name: "RSI (Force relative)", value: r.toFixed(1), verdict: "sell", description: "RSI en zone de surachat — correction possible", beginnerTip: "Au-dessus de 70, le prix a trop monté trop vite. Un recul est fréquent — prudence avant d'acheter." });
      score -= 25;
    } else if (r >= 45 && r <= 60) {
      signals.push({ name: "RSI (Force relative)", value: r.toFixed(1), verdict: "buy", description: "Momentum haussier sain", beginnerTip: "Le RSI est dans une zone idéale — ni trop haut ni trop bas. La tendance est positive." });
      score += 10;
    } else {
      signals.push({ name: "RSI (Force relative)", value: r.toFixed(1), verdict: "neutral", description: "Zone neutre — pas de signal clair", beginnerTip: "Le RSI ne donne pas de direction claire. Attendez qu'il sorte de cette zone." });
    }
  }

  // MACD
  if (last.macdLine !== undefined && last.macdSignal !== undefined && prev?.macdLine !== undefined && prev?.macdSignal !== undefined) {
    const crossedUp = prev.macdLine < prev.macdSignal && last.macdLine > last.macdSignal;
    const crossedDown = prev.macdLine > prev.macdSignal && last.macdLine < last.macdSignal;
    if (crossedUp) {
      signals.push({ name: "MACD (Momentum)", value: "Croisement haussier", verdict: "buy", description: "Le MACD vient de croiser la ligne signal vers le haut — signal d'achat", beginnerTip: "Quand la ligne MACD (bleue) croise vers le haut la ligne signal (rouge), c'est souvent le début d'une hausse." });
      score += 30;
    } else if (crossedDown) {
      signals.push({ name: "MACD (Momentum)", value: "Croisement baissier", verdict: "sell", description: "Le MACD a croisé la ligne signal vers le bas — signal de vente", beginnerTip: "Quand la ligne MACD croise vers le bas, les vendeurs reprennent le contrôle." });
      score -= 30;
    } else if (last.macdLine > last.macdSignal) {
      signals.push({ name: "MACD (Momentum)", value: "Haussier", verdict: "buy", description: "MACD au-dessus de la ligne signal", beginnerTip: "Le MACD est positif — le momentum est encore favorable aux acheteurs." });
      score += 15;
    } else {
      signals.push({ name: "MACD (Momentum)", value: "Baissier", verdict: "sell", description: "MACD en dessous de la ligne signal", beginnerTip: "Le MACD est négatif — les vendeurs ont l'avantage pour l'instant." });
      score -= 15;
    }
  }

  // SMA 20 vs 50
  if (last.sma20 !== undefined && last.sma50 !== undefined) {
    const golden = last.sma20 > last.sma50;
    signals.push({
      name: "Moyennes mobiles SMA 20/50",
      value: golden ? "Croix dorée 🥇" : "Croix de la mort ☠️",
      verdict: golden ? "buy" : "sell",
      description: golden ? `MM20 ($${last.sma20.toFixed(2)}) au-dessus de MM50 ($${last.sma50.toFixed(2)})` : `MM20 ($${last.sma20.toFixed(2)}) en dessous de MM50 ($${last.sma50.toFixed(2)})`,
      beginnerTip: golden ? "La 'croix dorée' : la moyenne courte dépasse la longue. Signe que la tendance haussière s'installe." : "La 'croix de la mort' : tendance baissière. Beaucoup de traders l'utilisent comme signal de sortie.",
    });
    score += golden ? 20 : -20;
  }

  // Prix vs SMA 20
  if (last.sma20 !== undefined) {
    const above = currentPrice > last.sma20;
    signals.push({
      name: "Prix vs Moyenne 20 jours",
      value: above ? "Au-dessus ✅" : "En dessous ⚠️",
      verdict: above ? "buy" : "sell",
      description: above ? `Prix au-dessus de la MM20 ($${last.sma20.toFixed(2)})` : `Prix en dessous de la MM20 ($${last.sma20.toFixed(2)})`,
      beginnerTip: above ? "Le prix est plus haut que sa moyenne des 20 derniers jours — signe de force à court terme." : "Le prix est plus bas que sa moyenne des 20 jours — signal de faiblesse.",
    });
    score += above ? 10 : -10;
  }

  // Bollinger Bands
  if (last.bbUpper !== undefined && last.bbLower !== undefined && last.bbMiddle !== undefined) {
    if (currentPrice < last.bbLower) {
      signals.push({ name: "Bandes de Bollinger", value: "Sous la bande basse", verdict: "buy", description: "Prix en dessous de la bande inférieure — zone de retournement potentielle", beginnerTip: "Quand le prix touche la bande du bas, il rebondit souvent vers le haut — opportunité d'achat." });
      score += 20;
    } else if (currentPrice > last.bbUpper) {
      signals.push({ name: "Bandes de Bollinger", value: "Au-dessus de la bande haute", verdict: "sell", description: "Prix au-dessus de la bande supérieure — zone d'épuisement potentielle", beginnerTip: "Quand le prix touche la bande du haut, il peut revenir vers le milieu. Signe de prudence." });
      score -= 20;
    } else {
      const pct = ((currentPrice - last.bbLower) / (last.bbUpper - last.bbLower)) * 100;
      signals.push({ name: "Bandes de Bollinger", value: `${pct.toFixed(0)}% de la plage`, verdict: "neutral", description: `Prix dans les bandes à ${pct.toFixed(0)}% de la plage`, beginnerTip: "Le prix est entre les deux bandes — c'est normal. Observez s'il tend vers le haut ou le bas." });
    }
  }

  const clampedScore = Math.max(-100, Math.min(100, score));

  let overall: SignalStrength;
  let recommendation: string;
  let beginnerSummary: string;

  if (clampedScore >= 60) {
    overall = "FORT ACHAT";
    recommendation = "Plusieurs indicateurs s'alignent en faveur des acheteurs. Opportunité d'entrée forte — confirmez avec le volume et les actualités.";
    beginnerSummary = "🟢 La majorité des signaux disent d'acheter. Pour un débutant : c'est le moment où beaucoup de traders entreraient en position. Utilisez toujours un stop-loss.";
  } else if (clampedScore >= 20) {
    overall = "ACHAT";
    recommendation = "Les indicateurs penchent vers le haussier. Envisagez une position partielle avec un stop-loss sous le support le plus proche.";
    beginnerSummary = "🟡 Les signaux sont plutôt positifs, mais pas unanimes. Pour un débutant : n'investissez qu'une petite partie de votre capital et fixez une limite de perte.";
  } else if (clampedScore <= -60) {
    overall = "FORTE VENTE";
    recommendation = "Plusieurs indicateurs s'alignent vers le baissier. Envisagez de sortir ou d'éviter de nouvelles positions jusqu'à des signaux de retournement.";
    beginnerSummary = "🔴 La majorité des signaux sont négatifs. Pour un débutant : ce n'est pas le moment d'acheter. Patientez ou réduisez votre exposition.";
  } else if (clampedScore <= -20) {
    overall = "VENTE";
    recommendation = "Les indicateurs penchent vers le baissier. Prudence — attendez une confirmation de retournement avant d'acheter.";
    beginnerSummary = "🟠 Les signaux sont plutôt négatifs. Pour un débutant : attendez que la situation se stabilise avant d'investir.";
  } else {
    overall = "NEUTRE";
    recommendation = "Signaux mixtes — pas d'avantage clair. Attendez un setup plus propre ou une confirmation de direction.";
    beginnerSummary = "⚪ Les signaux s'annulent mutuellement. Pour un débutant : il n'y a pas de direction claire. C'est souvent le bon moment de ne rien faire.";
  }

  return { overall, score: clampedScore, signals, recommendation, beginnerSummary };
}

EOF_WMM_PATCH

echo ">> Écriture de src/lib/journal.ts"
mkdir -p "$(dirname 'src/lib/journal.ts')"
cat > 'src/lib/journal.ts' << 'EOF_WMM_PATCH'
// Journal de trading + mode simulateur — 100% local (localStorage), aucun appel API,
// aucun coût. Les entrées sont stockées uniquement dans le navigateur de l'utilisateur.

export type JournalDirection = "achat" | "vente";
export type JournalMode = "réel" | "simulé";

export interface JournalEntry {
  id: string;
  symbol: string;
  currency: string;
  mode: JournalMode;
  direction: JournalDirection;
  entryPrice: number;
  entryDate: string; // ISO
  note: string;
  signalAtEntry?: string;
  closed: boolean;
  exitPrice?: number;
  exitDate?: string;
}

const STORAGE_KEY = "wmm_trading_journal_v1";

function readAll(): JournalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: JournalEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // stockage plein ou indisponible — on ignore silencieusement
  }
}

export function loadJournal(symbol?: string): JournalEntry[] {
  const all = readAll().sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime());
  return symbol ? all.filter((e) => e.symbol === symbol) : all;
}

export function addJournalEntry(entry: Omit<JournalEntry, "id" | "entryDate" | "closed">): JournalEntry {
  const newEntry: JournalEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entryDate: new Date().toISOString(),
    closed: false,
  };
  const all = readAll();
  all.push(newEntry);
  writeAll(all);
  return newEntry;
}

export function closeJournalEntry(id: string, exitPrice: number): void {
  const all = readAll();
  const idx = all.findIndex((e) => e.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], closed: true, exitPrice, exitDate: new Date().toISOString() };
  writeAll(all);
}

export function removeJournalEntry(id: string): void {
  writeAll(readAll().filter((e) => e.id !== id));
}

export interface JournalPnL {
  pnlPct: number;
  pnlLabel: string;
  isWin: boolean;
}

/** Calcule le profit/perte (réalisé si fermé, latent sinon) par rapport au prix courant. */
export function computeJournalPnL(entry: JournalEntry, currentPrice: number): JournalPnL {
  const refPrice = entry.closed && entry.exitPrice !== undefined ? entry.exitPrice : currentPrice;
  const raw = entry.direction === "achat"
    ? ((refPrice - entry.entryPrice) / entry.entryPrice) * 100
    : ((entry.entryPrice - refPrice) / entry.entryPrice) * 100;
  const pnlPct = Math.round(raw * 100) / 100;
  return {
    pnlPct,
    pnlLabel: `${pnlPct > 0 ? "+" : ""}${pnlPct}%`,
    isWin: pnlPct > 0,
  };
}

EOF_WMM_PATCH

echo ">> Écriture de src/components/TechnicalAnalysis.tsx"
mkdir -p "$(dirname 'src/components/TechnicalAnalysis.tsx')"
cat > 'src/components/TechnicalAnalysis.tsx' << 'EOF_WMM_PATCH'
import { useMemo, useState } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Area, AreaChart,
} from "recharts";
import {
  computeIndicators, analyzeTradingSignals, detectCandlePatterns, detectPriceGaps, detectSupportResistance,
  getVolatilityInfo, detectMarketStructure, computeFibonacciLevels, detectDivergences, backtestPatterns,
} from "@/lib/indicators";
import type {
  IndicatorPoint, OHLCPoint, CandlePattern, PriceGap, SRLevel, VolatilityInfo, MarketStructure, FibonacciResult, Divergence, PatternBacktestStat,
} from "@/lib/indicators";
import {
  TrendingUp, TrendingDown, Minus, AlertCircle, ChevronDown, ChevronUp, BookOpen, X, CandlestickChart,
  Radio, ArrowUpRight, ArrowDownRight, Gauge, GitCompareArrows, History,
} from "lucide-react";
import TradingJournal from "@/components/TradingJournal";

interface Props {
  history: OHLCPoint[];
  currentPrice: number;
  currency: string;
  symbol?: string;
}

const SIGNAL_COLORS = {
  "FORT ACHAT":  { bg: "bg-emerald-500/15", text: "text-emerald-500", border: "border-emerald-500/30" },
  "ACHAT":       { bg: "bg-green-500/10",   text: "text-green-500",   border: "border-green-500/20" },
  "NEUTRE":      { bg: "bg-muted",           text: "text-muted-foreground", border: "border-border" },
  "VENTE":       { bg: "bg-orange-500/10",  text: "text-orange-500",  border: "border-orange-500/20" },
  "FORTE VENTE": { bg: "bg-red-500/15",     text: "text-red-600",     border: "border-red-500/30" },
};

type ActiveOverlay = "sma" | "ema" | "bb" | "sr" | "fib";

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.5rem",
  fontSize: 11,
  color: "hsl(var(--foreground))",
};

// Guide pour débutants
const BEGINNER_GUIDE = [
  {
    term: "RSI (Force Relative)",
    simple: "Jauge de fatigue",
    explain: "Imaginez un ressort qu'on tire trop fort. Au-dessus de 70, le prix est 'épuisé' vers le haut et risque de redescendre. En dessous de 30, il est 'épuisé' vers le bas et peut rebondir.",
    action: "En dessous de 30 → chercher à acheter. Au-dessus de 70 → prudence ou vendre.",
    color: "text-blue-500",
  },
  {
    term: "MACD",
    simple: "Détecteur de changement de tendance",
    explain: "Le MACD compare deux moyennes de vitesse du prix. Quand la ligne bleue croise vers le haut la ligne rouge, c'est souvent le début d'une hausse. L'inverse annonce une baisse.",
    action: "Croix bleue vers le haut → signal d'achat. Croix bleue vers le bas → signal de vente.",
    color: "text-violet-500",
  },
  {
    term: "Moyennes Mobiles (SMA/EMA)",
    simple: "Prix moyen lissé",
    explain: "La MM20 est la moyenne des 20 derniers jours de prix. Si le prix actuel est au-dessus, la tendance est haussière. La 'Croix dorée' (MM20 > MM50) est l'un des signaux les plus populaires chez les traders.",
    action: "Prix > MM20 et MM20 > MM50 → tendance haussière confirmée.",
    color: "text-emerald-500",
  },
  {
    term: "Bandes de Bollinger",
    simple: "Enveloppe élastique du prix",
    explain: "Ces bandes s'élargissent quand le marché est volatile et se resserrent quand il est calme. Quand le prix touche la bande du bas, il rebondit souvent vers le milieu. La bande du haut est une zone de résistance.",
    action: "Prix à la bande basse → rebond probable (achat). Prix à la bande haute → résistance (prudence).",
    color: "text-orange-500",
  },
  {
    term: "Supports & Résistances",
    simple: "Planchers et plafonds invisibles",
    explain: "Un support est un niveau de prix où les acheteurs reviennent souvent (le prix a du mal à descendre plus bas). Une résistance est un niveau où les vendeurs reviennent souvent (le prix a du mal à monter plus haut). Plus un niveau a été touché de fois, plus il est fiable.",
    action: "Prix proche d'un support → rebond possible (achat prudent). Prix proche d'une résistance → ralentissement probable (prudence).",
    color: "text-cyan-500",
  },
  {
    term: "Gaps de prix (écarts)",
    simple: "Trou entre deux séances",
    explain: "Un gap se produit quand le prix ouvre nettement au-dessus ou en dessous de la clôture précédente — souvent après une nouvelle importante ou un rapport de résultats. Beaucoup de gaps finissent par être 'comblés' : le prix revient éventuellement toucher le niveau d'avant le gap.",
    action: "Gap haussier non comblé → tendance forte. Gap baissier non comblé → faiblesse. Un gap non comblé depuis longtemps agit souvent comme aimant pour le prix.",
    color: "text-pink-500",
  },
  {
    term: "ATR (volatilité)",
    simple: "Combien ça bouge, en moyenne",
    explain: "L'ATR mesure de combien le prix bouge en moyenne chaque jour, en dollars. Plus il est élevé, plus le titre est volatile (mouvements amples et rapides, risqué mais potentiel de gain plus grand). Plus il est faible, plus le titre est calme.",
    action: "Utilise l'ATR pour placer ton stop-loss : trop proche du prix actuel, un titre volatile te sortira pour rien. Vise environ 1,5x l'ATR de distance.",
    color: "text-amber-500",
  },
  {
    term: "Structure de marché",
    simple: "Sommets et creux qui racontent une histoire",
    explain: "En regardant la suite des sommets (hauts) et des creux (bas) récents, on peut dire si le marché est en tendance haussière (sommets et creux de plus en plus hauts), baissière (de plus en plus bas), ou en range (ça oscille sans direction).",
    action: "En tendance haussière, cherche à acheter sur les replis. En tendance baissière, évite d'acheter à contre-courant. En range, achète bas et vends haut dans la fourchette.",
    color: "text-indigo-500",
  },
  {
    term: "Fibonacci (retracement)",
    simple: "Les niveaux de pause préférés du marché",
    explain: "Après un grand mouvement de prix, une correction s'arrête souvent à des niveaux précis : 38,2%, 50% ou 61,8% du mouvement. Ce n'est pas magique — c'est parce que beaucoup de traders regardent les mêmes niveaux et y placent des ordres.",
    action: "Le niveau 61,8% est souvent surveillé comme zone d'achat en tendance haussière. Combine-le avec un autre signal (RSI, pattern de chandelier) pour plus de fiabilité.",
    color: "text-rose-500",
  },
  {
    term: "Divergences RSI/MACD",
    simple: "Quand le prix et l'indicateur ne sont plus d'accord",
    explain: "Normalement, quand le prix monte, le RSI et le MACD montent aussi. Une divergence, c'est quand le prix fait un nouveau sommet (ou creux) mais que l'indicateur ne le confirme pas — un signal que la tendance s'essouffle même si le prix ne le montre pas encore.",
    action: "Divergence baissière (prix monte, indicateur baisse) → signal de prudence. Divergence haussière (prix baisse, indicateur monte) → signal de retournement possible.",
    color: "text-teal-500",
  },
];

function PriceTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-card border border-card-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span style={{ color: p.color }} className="font-semibold">{p.name} :</span>
          <span className="font-mono">${typeof p.value === "number" ? p.value.toFixed(2) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function RSITooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const val = payload[0]?.value;
  const zone = val < 30 ? "Survente (potentiel rebond)" : val > 70 ? "Surachat (risque de recul)" : "Zone neutre";
  const color = val < 30 ? "#22c55e" : val > 70 ? "#ef4444" : "hsl(var(--muted-foreground))";
  return (
    <div className="bg-card border border-card-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p className="font-mono font-bold">{val?.toFixed(1)}</p>
      <p style={{ color }} className="font-medium">{zone}</p>
    </div>
  );
}

function MACDTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-card border border-card-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span style={{ color: p.color }} className="font-semibold">{p.name} :</span>
          <span className="font-mono">{typeof p.value === "number" ? p.value.toFixed(4) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function BeginnerGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-card-border rounded-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">Guide des indicateurs — Pour débutants</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          {BEGINNER_GUIDE.map((g) => (
            <div key={g.term} className="border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm font-bold ${g.color}`}>{g.term}</span>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{g.simple}</span>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed mb-2">{g.explain}</p>
              <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                <p className="text-xs font-medium text-primary">💡 Comment l'utiliser : {g.action}</p>
              </div>
            </div>
          ))}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">⚠️ Rappel important</p>
            <p className="text-xs text-foreground/70 leading-relaxed">
              Aucun indicateur n'est parfait seul. Les meilleurs traders utilisent une <strong>combinaison</strong> d'indicateurs et attendent que plusieurs signaux s'alignent avant d'agir.
              Ne risquez jamais plus que vous ne pouvez vous permettre de perdre.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label, dashed, box }: { color: string; label: string; dashed?: boolean; box?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {box ? (
        <span className="w-3 h-2.5 rounded-sm inline-block" style={{ background: color }} />
      ) : (
        <span
          className="w-5 inline-block rounded"
          style={{ background: dashed ? "transparent" : color, borderTop: dashed ? `2px dashed ${color}` : undefined, height: dashed ? 0 : "2px" }}
        />
      )}
      {label}
    </div>
  );
}

function CandlePatternBadge({ p, backtest }: { p: CandlePattern; backtest?: PatternBacktestStat }) {
  const isUp = p.signal === "haussier";
  const isDown = p.signal === "baissier";
  const strengthLabel = p.strength === "fort" ? "⭐⭐ Fort" : p.strength === "moyen" ? "⭐ Moyen" : "Faible";
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div
      className={`border rounded-xl p-3 cursor-pointer transition-all ${
        isUp ? "bg-emerald-500/8 border-emerald-500/20 hover:border-emerald-500/40" :
        isDown ? "bg-red-500/8 border-red-500/20 hover:border-red-500/40" :
        "bg-muted/30 border-border hover:border-border/80"
      }`}
      onClick={() => setShowDetail((v) => !v)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-sm font-bold ${isUp ? "text-emerald-600 dark:text-emerald-400" : isDown ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
              {isUp ? "🟢" : isDown ? "🔴" : "⚪"} {p.name}
            </span>
            <span className="text-xs text-muted-foreground italic">{p.nameEn}</span>
            {p.candles > 1 && (
              <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{p.candles} bougies</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{p.date} · {strengthLabel}</div>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform mt-0.5 ${showDetail ? "rotate-180" : ""}`} />
      </div>
      {showDetail && (
        <div className="mt-2 space-y-1.5 border-t border-border/50 pt-2">
          <p className="text-xs text-foreground/80 leading-relaxed">{p.description}</p>
          <div className="bg-background/60 rounded-lg px-2.5 py-1.5">
            <p className="text-xs font-medium text-primary">💡 Comment l'utiliser :</p>
            <p className="text-xs text-foreground/70 mt-0.5 leading-relaxed">{p.howToUse}</p>
          </div>
          {backtest && (
            <div className="bg-background/60 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-xs text-foreground/70 leading-relaxed">
                Sur ce titre : <strong>{backtest.occurrences} occurrences</strong> passées, <strong>{backtest.winRate}%</strong> ont évolué dans le sens attendu sur {backtest.lookaheadDays} jours (rendement moyen {backtest.avgReturnPct > 0 ? "+" : ""}{backtest.avgReturnPct}%).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GapBadge({ g, currency }: { g: PriceGap; currency: string }) {
  const isUp = g.type === "haussier";
  return (
    <div className={`border rounded-xl p-3 ${isUp ? "bg-emerald-500/8 border-emerald-500/20" : "bg-red-500/8 border-red-500/20"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isUp ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <ArrowDownRight className="w-3.5 h-3.5 text-red-500 shrink-0" />}
          <span className={`text-sm font-bold ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            Gap {isUp ? "haussier" : "baissier"} {g.gapPct > 0 ? "+" : ""}{g.gapPct}%
          </span>
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${g.filled ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
          {g.filled ? "Comblé" : "Non comblé"}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {g.date} · Clôture préc. {currency}{g.prevClose.toFixed(2)} → Ouverture {currency}{g.open.toFixed(2)}
      </div>
      {!g.filled && (
        <p className="text-xs text-foreground/60 mt-1 leading-relaxed italic border-t border-border/40 pt-1">
          💡 {isUp
            ? "Gap encore ouvert : le marché n'est pas revenu combler cet écart, signe de force. Certains traders surveillent ce niveau comme support potentiel."
            : "Gap encore ouvert : le marché n'est pas revenu combler cet écart, signe de faiblesse. Ce niveau peut agir comme résistance."}
        </p>
      )}
    </div>
  );
}

function SRLevelRow({ l, currency }: { l: SRLevel; currency: string }) {
  const isSupport = l.type === "support";
  const strengthLabel = l.strength === "fort" ? "⭐⭐ Fort" : l.strength === "moyen" ? "⭐ Moyen" : "Faible";
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${isSupport ? "bg-emerald-500/8 border-emerald-500/20" : "bg-red-500/8 border-red-500/20"}`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isSupport ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>
          {isSupport ? "Support" : "Résistance"}
        </span>
        <span className="font-mono text-sm font-semibold">{currency}{l.price.toFixed(2)}</span>
        <span className="text-xs text-muted-foreground">{l.touches}x touché · {strengthLabel}</span>
      </div>
      <span className={`text-xs font-mono ${isSupport ? "text-emerald-500" : "text-red-500"}`}>
        {l.distancePct > 0 ? "+" : ""}{l.distancePct}%
      </span>
    </div>
  );
}

function VolatilityCard({ vol, currency }: { vol: VolatilityInfo; currency: string }) {
  const labelColor = vol.label === "faible" ? "text-emerald-500" : vol.label === "modérée" ? "text-amber-500" : "text-red-500";
  const barPct = vol.label === "faible" ? 25 : vol.label === "modérée" ? 60 : 90;
  return (
    <div className="bg-card border border-card-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Gauge className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Volatilité (ATR) &amp; suggestion de stop-loss</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
        L'ATR mesure de combien le prix bouge en moyenne chaque jour. Les niveaux ci-dessous sont calculés à partir de cette volatilité réelle, pas d'un pourcentage arbitraire.
      </p>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${vol.label === "faible" ? "bg-emerald-500" : vol.label === "modérée" ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${barPct}%` }} />
        </div>
        <span className={`text-xs font-bold ${labelColor}`}>Volatilité {vol.label}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="bg-muted/40 rounded-lg px-2.5 py-1.5">
          <span className="text-muted-foreground">ATR (14 jours)</span>
          <div className="font-mono font-semibold">{currency}{vol.atr.toFixed(2)} ({vol.atrPct.toFixed(2)}%/jour)</div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="border border-emerald-500/20 bg-emerald-500/8 rounded-lg px-3 py-2">
          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">Si position acheteuse (long)</div>
          <div className="text-xs text-muted-foreground">Stop-loss suggéré : <span className="font-mono font-semibold text-foreground">{currency}{vol.stopLossLong.toFixed(2)}</span></div>
          <div className="text-xs text-muted-foreground">Take-profit suggéré : <span className="font-mono font-semibold text-foreground">{currency}{vol.takeProfitLong.toFixed(2)}</span></div>
        </div>
        <div className="border border-red-500/20 bg-red-500/8 rounded-lg px-3 py-2">
          <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">Si position vendeuse (short)</div>
          <div className="text-xs text-muted-foreground">Stop-loss suggéré : <span className="font-mono font-semibold text-foreground">{currency}{vol.stopLossShort.toFixed(2)}</span></div>
          <div className="text-xs text-muted-foreground">Take-profit suggéré : <span className="font-mono font-semibold text-foreground">{currency}{vol.takeProfitShort.toFixed(2)}</span></div>
        </div>
      </div>
      <p className="text-xs text-foreground/60 mt-2 italic">💡 Basé sur 1,5x l'ATR pour le stop-loss et 2,5x pour le take-profit — des multiples courants chez les traders. Ajuste selon ta tolérance au risque.</p>
    </div>
  );
}

function MarketStructureBanner({ structure }: { structure: MarketStructure }) {
  const color = structure.trend === "haussière" ? "text-emerald-500" : structure.trend === "baissière" ? "text-red-500" : "text-muted-foreground";
  return (
    <div className="bg-card border border-card-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <GitCompareArrows className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Structure de marché</span>
        <span className={`text-sm font-bold ml-auto ${color}`}>{structure.label}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{structure.description}</p>
    </div>
  );
}

function FibLevelRow({ level, currency, isKey }: { level: FibonacciResult["levels"][number]; currency: string; isKey: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-1.5 ${isKey ? "bg-rose-500/8 border-rose-500/25" : "bg-muted/30 border-border"}`}>
      <span className={`text-xs font-semibold ${isKey ? "text-rose-500" : "text-muted-foreground"}`}>{level.label}</span>
      <span className="font-mono text-sm">{currency}{level.price.toFixed(2)}</span>
    </div>
  );
}

function DivergenceBadge({ d }: { d: Divergence }) {
  const isBull = d.type === "haussière";
  return (
    <div className={`border rounded-xl p-3 ${isBull ? "bg-emerald-500/8 border-emerald-500/20" : "bg-red-500/8 border-red-500/20"}`}>
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        {isBull ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
        <span className={`text-sm font-bold ${isBull ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          Divergence {d.type} ({d.indicator})
        </span>
        <span className="text-xs text-muted-foreground ml-auto">{d.date}</span>
      </div>
      <p className="text-xs text-foreground/70 leading-relaxed">{d.description}</p>
    </div>
  );
}

export default function TechnicalAnalysis({ history, currentPrice, currency, symbol }: Props) {
  const [overlays, setOverlays] = useState<Set<ActiveOverlay>>(new Set(["sma"]));
  const [showDetails, setShowDetails] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const data: IndicatorPoint[] = useMemo(() => computeIndicators(history), [history]);
  const analysis = useMemo(() => analyzeTradingSignals(data, currentPrice), [data, currentPrice]);
  const allPatterns = useMemo(() => detectCandlePatterns(history), [history]);
  // Show only patterns from the last 30 candles, most recent first, deduplicate by same idx+name
  const recentPatterns = useMemo(() => {
    const cutoff = history.length - 30;
    const seen = new Set<string>();
    return allPatterns
      .filter((p) => p.idx >= cutoff)
      .reverse()
      .filter((p) => {
        const key = `${p.idx}-${p.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 12);
  }, [allPatterns, history.length]);

  // Patterns détectés sur la toute dernière bougie — mis à jour à chaque rafraîchissement des données
  const livePatterns = useMemo(
    () => allPatterns.filter((p) => p.idx === history.length - 1),
    [allPatterns, history.length]
  );

  const priceGaps = useMemo(() => detectPriceGaps(history), [history]);
  const recentGaps = useMemo(() => [...priceGaps].reverse().slice(0, 8), [priceGaps]);
  const unfilledGaps = useMemo(() => priceGaps.filter((g) => !g.filled), [priceGaps]);

  const srLevels = useMemo(() => detectSupportResistance(history, currentPrice), [history, currentPrice]);

  const volatility = useMemo(() => getVolatilityInfo(data, currentPrice), [data, currentPrice]);
  const structure = useMemo(() => detectMarketStructure(history), [history]);
  const fibonacci = useMemo(() => computeFibonacciLevels(history), [history]);
  const divergences = useMemo(() => detectDivergences(data), [data]);
  const backtestStats = useMemo(() => backtestPatterns(history, allPatterns, 3), [history, allPatterns]);

  const toggleOverlay = (o: ActiveOverlay) => {
    setOverlays((prev) => {
      const next = new Set(prev);
      next.has(o) ? next.delete(o) : next.add(o);
      return next;
    });
  };

  if (history.length < 20) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-6 flex items-center gap-3 text-muted-foreground text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Pas assez de données pour l'analyse technique. Sélectionnez une période plus longue (1m ou plus).
      </div>
    );
  }

  const colors = SIGNAL_COLORS[analysis.overall] ?? SIGNAL_COLORS["NEUTRE"];
  const overallIcon =
    analysis.overall.includes("ACHAT") ? <TrendingUp className="w-5 h-5" /> :
    analysis.overall.includes("VENTE") ? <TrendingDown className="w-5 h-5" /> :
    <Minus className="w-5 h-5" />;

  const scoreWidth = `${Math.abs(analysis.score)}%`;
  const scoreIsPos = analysis.score >= 0;
  const border = "hsl(var(--border))";
  const mutedFg = "hsl(var(--muted-foreground))";
  const font = 10;
  const yDomain: [string, string] = ["auto", "auto"];

  return (
    <div className="space-y-4">
      {showGuide && <BeginnerGuide onClose={() => setShowGuide(false)} />}

      {/* Résumé débutant */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
        <p className="text-sm text-foreground/80 leading-relaxed flex-1">{analysis.beginnerSummary}</p>
        <button
          onClick={() => setShowGuide(true)}
          className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0 mt-0.5"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Guide débutant
        </button>
      </div>

      {/* Radar en direct — patterns détectés sur la dernière bougie */}
      <div className="bg-card border border-card-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <Radio className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm font-semibold">Radar en direct — dernière bougie</span>
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded ml-auto">Mis à jour à chaque nouvelle donnée</span>
        </div>
        {livePatterns.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun pattern de chandelier reconnu sur la bougie la plus récente en ce moment.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {livePatterns.map((p, i) => (
              <CandlePatternBadge key={`live-${p.idx}-${p.name}-${i}`} p={p} backtest={backtestStats[p.name]} />
            ))}
          </div>
        )}
      </div>

      {/* Structure de marché + Volatilité (ATR) */}
      <div className="grid grid-cols-1 gap-4">
        <MarketStructureBanner structure={structure} />
        {volatility && <VolatilityCard vol={volatility} currency={currency} />}
      </div>

      {/* Signal global */}
      <div className={`rounded-xl border p-5 ${colors.bg} ${colors.border}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={`flex items-center gap-2 font-bold text-lg ${colors.text}`}>
              {overallIcon}
              {analysis.overall}
            </div>
            <p className="text-sm text-foreground/80 mt-1 max-w-lg">{analysis.recommendation}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs text-muted-foreground mb-1">Score de conviction</div>
            <div className={`text-2xl font-bold font-mono ${colors.text}`}>
              {analysis.score > 0 ? "+" : ""}{analysis.score}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="relative h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
            <div className="absolute inset-0 flex">
              <div className="flex-1 flex justify-end pr-px">
                {!scoreIsPos && (
                  <div className="h-full rounded-l-full bg-red-500" style={{ width: scoreWidth }} />
                )}
              </div>
              <div className="w-px bg-black/20 dark:bg-white/20" />
              <div className="flex-1 pl-px">
                {scoreIsPos && (
                  <div className="h-full rounded-r-full bg-emerald-500" style={{ width: scoreWidth }} />
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Forte vente</span><span>Neutre</span><span>Fort achat</span>
          </div>
        </div>

        <button
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium mt-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showDetails ? "Masquer les signaux" : `Voir les ${analysis.signals.length} signaux détaillés`}
        </button>

        {showDetails && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {analysis.signals.map((sig) => (
              <div key={sig.name} className="bg-background/60 border border-border/50 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{sig.name}</span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    sig.verdict === "buy" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                    sig.verdict === "sell" ? "bg-red-500/15 text-red-600 dark:text-red-400" :
                    "bg-muted text-muted-foreground"
                  }`}>{sig.value}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{sig.description}</p>
                <p className="text-xs text-foreground/60 mt-1 leading-relaxed italic border-t border-border/40 pt-1">💡 {sig.beginnerTip}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Graphique prix + overlays */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold">Prix &amp; Indicateurs</span>
          <div className="flex items-center gap-1.5">
            {(["sma", "ema", "bb", "sr", "fib"] as ActiveOverlay[]).map((o) => (
              <button
                key={o}
                onClick={() => toggleOverlay(o)}
                className={`px-2 py-1 text-xs font-medium rounded border transition-colors ${
                  overlays.has(o)
                    ? o === "sma" ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                    : o === "ema" ? "bg-violet-500/20 text-violet-400 border-violet-500/30"
                    : o === "bb" ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
                    : o === "sr" ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
                    : "bg-rose-500/20 text-rose-400 border-rose-500/30"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                {o === "sma" ? "MM 20/50" : o === "ema" ? "EMA 12/26" : o === "bb" ? "Bollinger" : o === "sr" ? "Support/Résist." : "Fibonacci"}
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={yDomain} tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toFixed(0)}`} width={58} />
            <Tooltip content={<PriceTooltip />} />

            {overlays.has("sr") && srLevels.map((l) => (
              <ReferenceLine
                key={`sr-${l.price}`}
                y={l.price}
                stroke={l.type === "support" ? "#10b981" : "#ef4444"}
                strokeDasharray="6 3"
                strokeWidth={l.strength === "fort" ? 1.75 : 1}
                label={{ value: `${l.type === "support" ? "S" : "R"} $${l.price.toFixed(0)}`, position: "insideBottomRight", fontSize: 9, fill: l.type === "support" ? "#10b981" : "#ef4444" }}
              />
            ))}

            {overlays.has("fib") && fibonacci?.levels.map((l) => (
              <ReferenceLine
                key={`fib-${l.ratio}`}
                y={l.price}
                stroke="#f43f5e"
                strokeDasharray={l.ratio === 0.618 || l.ratio === 0.5 ? "2 2" : "6 4"}
                strokeWidth={l.ratio === 0.618 || l.ratio === 0.5 ? 1.5 : 0.75}
                label={{ value: `${l.label}`, position: "insideTopLeft", fontSize: 9, fill: "#f43f5e" }}
              />
            ))}

            {overlays.has("bb") && (
              <>
                <Area dataKey="bbUpper" stroke="none" fill="hsl(38 100% 50% / 0.08)" connectNulls dot={false} name="Boll. Haut" legendType="none" />
                <Area dataKey="bbLower" stroke="none" fill="hsl(var(--background))" connectNulls dot={false} name="Boll. Bas" legendType="none" />
                <Line dataKey="bbUpper" stroke="hsl(38 100% 55%)" strokeWidth={1} strokeDasharray="4 2" dot={false} name="Boll. Haut" connectNulls />
                <Line dataKey="bbMiddle" stroke="hsl(38 100% 55%)" strokeWidth={1} strokeDasharray="2 2" dot={false} name="Boll. Mid" connectNulls />
                <Line dataKey="bbLower" stroke="hsl(38 100% 55%)" strokeWidth={1} strokeDasharray="4 2" dot={false} name="Boll. Bas" connectNulls />
              </>
            )}

            <Line dataKey="close" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Prix" connectNulls activeDot={{ r: 4, strokeWidth: 0 }} />

            {overlays.has("sma") && (
              <>
                <Line dataKey="sma20" stroke="#60a5fa" strokeWidth={1.5} dot={false} name="MM20" connectNulls />
                <Line dataKey="sma50" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="MM50" connectNulls />
              </>
            )}

            {overlays.has("ema") && (
              <>
                <Line dataKey="ema12" stroke="#34d399" strokeWidth={1.5} strokeDasharray="5 2" dot={false} name="EMA12" connectNulls />
                <Line dataKey="ema26" stroke="#f87171" strokeWidth={1.5} strokeDasharray="5 2" dot={false} name="EMA26" connectNulls />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>

        <div className="flex flex-wrap gap-3 mt-2 px-1">
          <LegendDot color="hsl(var(--primary))" label="Prix" />
          {overlays.has("sma") && <><LegendDot color="#60a5fa" label="MM 20 jours" /><LegendDot color="#a78bfa" label="MM 50 jours" /></>}
          {overlays.has("ema") && <><LegendDot color="#34d399" label="EMA 12" dashed /><LegendDot color="#f87171" label="EMA 26" dashed /></>}
          {overlays.has("bb") && <LegendDot color="hsl(38 100% 55%)" label="Bandes Bollinger" dashed />}
          {overlays.has("sr") && <><LegendDot color="#10b981" label="Support" dashed /><LegendDot color="#ef4444" label="Résistance" dashed /></>}
          {overlays.has("fib") && <LegendDot color="#f43f5e" label="Fibonacci" dashed />}
        </div>
      </div>

      {/* Volume */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <span className="text-sm font-semibold block mb-1">Volume des échanges</span>
        <p className="text-xs text-muted-foreground mb-3">Nombre d'actions/unités échangées sur la période. Un volume élevé confirme la force d'un mouvement.</p>
        <ResponsiveContainer width="100%" height={80}>
          <ComposedChart data={data} margin={{ top: 0, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} width={52}
              tickFormatter={(v) => v >= 1e9 ? `${(v/1e9).toFixed(1)}G` : v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v} />
            <Tooltip formatter={(v: number) => [v >= 1e9 ? `${(v/1e9).toFixed(2)}G` : v >= 1e6 ? `${(v/1e6).toFixed(2)}M` : v, "Volume"]} contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="volume" fill="hsl(var(--primary) / 0.4)" radius={[2, 2, 0, 0]} name="Volume" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* RSI */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold">RSI — Indice de force relative (14)</span>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-emerald-500 font-medium">30 = Survente</span>
            <span className="text-red-500 font-medium">70 = Surachat</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">En dessous de 30 : le prix a trop baissé, rebond possible. Au-dessus de 70 : le prix a trop monté, recul possible.</p>
        <ResponsiveContainer width="100%" height={100}>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="rsiGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} ticks={[0, 30, 50, 70, 100]} width={30} />
            <Tooltip content={<RSITooltip />} />
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1} label={{ value: "Surachat", position: "right", fontSize: 9, fill: "#ef4444" }} />
            <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="4 2" strokeWidth={1} label={{ value: "Survente", position: "right", fontSize: 9, fill: "#22c55e" }} />
            <ReferenceLine y={50} stroke={border} strokeDasharray="2 2" strokeWidth={1} />
            <Area dataKey="rsi" stroke="hsl(var(--primary))" strokeWidth={1.5} fill="url(#rsiGrad)" dot={false} name="RSI" connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* MACD */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold">MACD — Convergence/Divergence (12, 26, 9)</span>
          <div className="flex items-center gap-3 text-xs">
            <LegendDot color="#60a5fa" label="MACD" />
            <LegendDot color="#f87171" label="Signal" dashed />
            <LegendDot color="hsl(var(--muted-foreground))" label="Histogramme" box />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Ligne bleue croise vers le haut la rouge → signal d'achat. Vers le bas → signal de vente. L'histogramme montre la force du momentum.</p>
        <ResponsiveContainer width="100%" height={110}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => v.toFixed(2)} />
            <Tooltip content={<MACDTooltip />} />
            <ReferenceLine y={0} stroke={border} strokeWidth={1} />
            <Bar dataKey="macdHist" name="Histogramme" fill="hsl(var(--muted-foreground) / 0.4)" radius={[1, 1, 0, 0]} />
            <Line dataKey="macdLine" stroke="#60a5fa" strokeWidth={1.5} dot={false} name="MACD" connectNulls />
            <Line dataKey="macdSignal" stroke="#f87171" strokeWidth={1.5} strokeDasharray="5 2" dot={false} name="Signal" connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Patterns de chandeliers détectés */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <CandlestickChart className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Patterns de chandeliers détectés</span>
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded ml-auto">30 dernières bougies</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Patterns identifiés automatiquement sur l'historique récent. Cliquez sur un pattern pour voir son explication et comment l'utiliser.
        </p>
        {recentPatterns.length === 0 ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Aucun pattern reconnu sur les 30 dernières bougies. Essayez une période plus longue.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recentPatterns.map((p, i) => (
              <CandlePatternBadge key={`${p.idx}-${p.name}-${i}`} p={p} backtest={backtestStats[p.name]} />
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-3 text-xs text-muted-foreground border-t border-border pt-2.5">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Haussier</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Baissier</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" />Neutre</span>
        </div>
      </div>

      {/* Niveaux de support / résistance */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold">Niveaux clés — Supports &amp; Résistances</span>
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded ml-auto">Détection automatique</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Niveaux de prix où le marché a réagi plusieurs fois dans le passé. Activez "Support/Résist." sur le graphique ci-dessus pour les visualiser.
        </p>
        {srLevels.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Pas assez de points pivots sur cette période pour identifier des niveaux fiables.
          </div>
        ) : (
          <div className="space-y-1.5">
            {srLevels.map((l) => (
              <SRLevelRow key={`${l.type}-${l.price}`} l={l} currency={currency} />
            ))}
          </div>
        )}
      </div>

      {/* Gaps de prix */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold">Gaps de prix récents</span>
          {unfilledGaps.length > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{unfilledGaps.length} non comblé{unfilledGaps.length > 1 ? "s" : ""}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Écarts entre la clôture d'une séance et l'ouverture de la suivante. Les gaps non comblés indiquent souvent une direction forte du marché.
        </p>
        {recentGaps.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Aucun gap significatif détecté sur cette période.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recentGaps.map((g, i) => (
              <GapBadge key={`gap-${g.idx}-${i}`} g={g} currency={currency} />
            ))}
          </div>
        )}
      </div>

      {/* Divergences RSI/MACD */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold">Divergences RSI / MACD</span>
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded ml-auto">Signal avancé</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Quand le prix et un indicateur ne racontent plus la même histoire — souvent un signe précoce de retournement, avant même que le prix ne change de direction.
        </p>
        {divergences.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Aucune divergence détectée récemment — le prix et les indicateurs sont alignés.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {divergences.map((d, i) => (
              <DivergenceBadge key={`div-${d.idx}-${d.indicator}-${i}`} d={d} />
            ))}
          </div>
        )}
      </div>

      {/* Fibonacci */}
      {fibonacci && (
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold">Niveaux de Fibonacci</span>
            <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded ml-auto">
              Mouvement {fibonacci.direction} · {currency}{fibonacci.swingLow.toFixed(2)} → {currency}{fibonacci.swingHigh.toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Calculés sur le dernier grand mouvement de la période affichée. Activez "Fibonacci" sur le graphique ci-dessus pour les visualiser. Les niveaux 50% et 61,8% (en surbrillance) sont les plus surveillés.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {fibonacci.levels.map((l) => (
              <FibLevelRow key={l.ratio} level={l} currency={currency} isKey={l.ratio === 0.5 || l.ratio === 0.618} />
            ))}
          </div>
        </div>
      )}

      {/* Journal de trading / simulateur */}
      {symbol && (
        <TradingJournal symbol={symbol} currency={currency} currentPrice={currentPrice} suggestedSignal={analysis.overall} />
      )}

      <div className="bg-muted/50 rounded-xl px-4 py-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          ⚠️ <strong>Avertissement :</strong> Cette analyse est basée sur des indicateurs techniques historiques uniquement. Elle ne constitue pas un conseil financier.
          Les marchés sont imprévisibles — faites toujours vos propres recherches et ne risquez que ce que vous pouvez vous permettre de perdre.
        </p>
      </div>
    </div>
  );
}

EOF_WMM_PATCH

echo ">> Écriture de src/components/TradingJournal.tsx"
mkdir -p "$(dirname 'src/components/TradingJournal.tsx')"
cat > 'src/components/TradingJournal.tsx' << 'EOF_WMM_PATCH'
import { useEffect, useState } from "react";
import { NotebookPen, Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import {
  loadJournal, addJournalEntry, removeJournalEntry, closeJournalEntry, computeJournalPnL,
} from "@/lib/journal";
import type { JournalEntry, JournalDirection, JournalMode } from "@/lib/journal";

interface Props {
  symbol: string;
  currency: string;
  currentPrice: number;
  suggestedSignal?: string;
}

function NewEntryForm({ symbol, currency, currentPrice, suggestedSignal, onAdded, onCancel }: {
  symbol: string; currency: string; currentPrice: number; suggestedSignal?: string;
  onAdded: () => void; onCancel: () => void;
}) {
  const [mode, setMode] = useState<JournalMode>("simulé");
  const [direction, setDirection] = useState<JournalDirection>("achat");
  const [entryPrice, setEntryPrice] = useState(currentPrice.toString());
  const [note, setNote] = useState("");

  const submit = () => {
    const price = parseFloat(entryPrice);
    if (isNaN(price) || price <= 0) return;
    addJournalEntry({ symbol, currency, mode, direction, entryPrice: price, note, signalAtEntry: suggestedSignal });
    onAdded();
  };

  return (
    <div className="border border-border rounded-xl p-3 space-y-3 bg-muted/20">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Type :</span>
        {(["simulé", "réel"] as JournalMode[]).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-2 py-1 text-xs font-medium rounded border transition-colors ${mode === m ? "bg-primary/15 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border"}`}>
            {m === "simulé" ? "Simulé (papier)" : "Réel"}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Direction :</span>
        {(["achat", "vente"] as JournalDirection[]).map((d) => (
          <button key={d} onClick={() => setDirection(d)}
            className={`px-2 py-1 text-xs font-medium rounded border transition-colors ${direction === d ? (d === "achat" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-red-500/15 text-red-600 border-red-500/30") : "bg-muted text-muted-foreground border-border"}`}>
            {d === "achat" ? "Achat (long)" : "Vente (short)"}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0 w-24">Prix d'entrée :</span>
        <input
          type="number" step="0.01" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)}
          className="flex-1 text-sm bg-background border border-border rounded px-2 py-1 font-mono"
        />
      </div>
      <textarea
        placeholder="Note (pourquoi cette décision ?)" value={note} onChange={(e) => setNote(e.target.value)}
        className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 resize-none" rows={2}
      />
      <div className="flex gap-2">
        <button onClick={submit} className="flex-1 bg-primary text-primary-foreground text-xs font-medium rounded-md py-1.5 hover:opacity-90 transition-opacity">
          Enregistrer
        </button>
        <button onClick={onCancel} className="px-3 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md">
          Annuler
        </button>
      </div>
    </div>
  );
}

function EntryRow({ entry, currentPrice, onRemove, onClose }: {
  entry: JournalEntry; currentPrice: number; onRemove: (id: string) => void; onClose: (id: string) => void;
}) {
  const pnl = computeJournalPnL(entry, currentPrice);
  const isBuy = entry.direction === "achat";
  return (
    <div className={`border rounded-xl p-3 ${pnl.isWin ? "bg-emerald-500/6 border-emerald-500/20" : "bg-red-500/6 border-red-500/20"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isBuy ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
          <span className="text-sm font-semibold">{isBuy ? "Achat" : "Vente"}</span>
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{entry.mode}</span>
          {entry.closed && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Clôturé</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-sm font-bold font-mono ${pnl.isWin ? "text-emerald-500" : "text-red-500"}`}>{pnl.pnlLabel}</span>
          <button onClick={() => onRemove(entry.id)} className="text-muted-foreground hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        Entrée à {entry.currency}{entry.entryPrice.toFixed(2)} le {new Date(entry.entryDate).toLocaleDateString("fr-CA")}
        {entry.closed && entry.exitPrice !== undefined && ` · Sorti à ${entry.currency}${entry.exitPrice.toFixed(2)}`}
      </div>
      {entry.note && <p className="text-xs text-foreground/70 mt-1.5 italic">"{entry.note}"</p>}
      {entry.signalAtEntry && <p className="text-xs text-muted-foreground mt-1">Signal à l'entrée : {entry.signalAtEntry}</p>}
      {!entry.closed && (
        <button onClick={() => onClose(entry.id)} className="text-xs text-primary hover:underline mt-2">
          Clôturer au prix actuel ({entry.currency}{currentPrice.toFixed(2)})
        </button>
      )}
    </div>
  );
}

export default function TradingJournal({ symbol, currency, currentPrice, suggestedSignal }: Props) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [showForm, setShowForm] = useState(false);

  const refresh = () => setEntries(loadJournal(symbol));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const openCount = entries.filter((e) => !e.closed).length;

  return (
    <div className="bg-card border border-card-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <NotebookPen className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Journal de trading &amp; simulateur — {symbol}</span>
        {openCount > 0 && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded ml-auto">{openCount} position{openCount > 1 ? "s" : ""} ouverte{openCount > 1 ? "s" : ""}</span>}
      </div>
      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
        Note tes décisions (réelles ou simulées) pour suivre ta progression. Tout est stocké seulement dans ton navigateur — aucune donnée envoyée à un serveur.
      </p>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-1.5 border border-dashed border-border rounded-xl py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors mb-3"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter une entrée {suggestedSignal ? `(signal actuel : ${suggestedSignal})` : ""}
        </button>
      ) : (
        <div className="mb-3">
          <NewEntryForm
            symbol={symbol} currency={currency} currentPrice={currentPrice} suggestedSignal={suggestedSignal}
            onAdded={() => { setShowForm(false); refresh(); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Aucune entrée pour {symbol} pour le moment.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <EntryRow
              key={e.id} entry={e} currentPrice={currentPrice}
              onRemove={(id) => { removeJournalEntry(id); refresh(); }}
              onClose={(id) => { closeJournalEntry(id, currentPrice); refresh(); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

EOF_WMM_PATCH

echo ">> Écriture de src/pages/QuoteDetail.tsx"
mkdir -p "$(dirname 'src/pages/QuoteDetail.tsx')"
cat > 'src/pages/QuoteDetail.tsx' << 'EOF_WMM_PATCH'
import { useGetQuote, useGetQuoteHistory, useAddToWatchlist, getGetWatchlistQueryKey } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { formatPrice, formatChange, formatPercent, formatVolume, formatMarketCap, changeClass } from "@/lib/format";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, ArrowDownRight, Bookmark, TrendingUp, BarChart2 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import TechnicalAnalysis from "@/components/TechnicalAnalysis";

const RANGES: { value: string; label: string }[] = [
  { value: "1d", label: "1j" },
  { value: "5d", label: "5j" },
  { value: "1mo", label: "1m" },
  { value: "3mo", label: "3m" },
  { value: "6mo", label: "6m" },
  { value: "1y", label: "1a" },
];

function StatBox({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-3">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-sm font-mono font-semibold text-foreground">{value ?? "—"}</div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-card border border-card-border rounded-lg px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-mono font-bold">
        {payload[0]?.value !== undefined ? `$${payload[0].value.toFixed(2)}` : "—"}
      </p>
    </div>
  );
};

export default function QuoteDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const decodedSymbol = symbol ? decodeURIComponent(symbol) : "";
  const [range, setRange] = useState("1mo");
  const [tab, setTab] = useState<"chart" | "analysis">("chart");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: quote, isLoading } = useGetQuote(decodedSymbol, {
    query: { enabled: !!decodedSymbol, refetchInterval: 30_000 },
  });

  const { data: history = [], isLoading: histLoading } = useGetQuoteHistory(decodedSymbol, range, {
    query: { enabled: !!decodedSymbol },
  });

  const add = useAddToWatchlist({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
        toast({ title: `${decodedSymbol} ajouté à votre liste de suivi` });
      },
      onError: () => toast({ title: "Déjà suivi ou erreur", variant: "destructive" }),
    },
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-6 bg-muted rounded w-32 mb-6 animate-pulse" />
        <div className="h-10 bg-muted rounded w-48 mb-2 animate-pulse" />
        <div className="h-6 bg-muted rounded w-32 mb-8 animate-pulse" />
        <div className="h-64 bg-card border border-card-border rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="p-6">
        <Link href="/">
          <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Retour
          </button>
        </Link>
        <p className="text-muted-foreground">Symbole introuvable : {decodedSymbol}</p>
      </div>
    );
  }

  const cls = changeClass(quote.changePercent);
  const isUp = quote.changePercent >= 0;
  const chartColor = isUp ? "hsl(168, 60%, 42%)" : "hsl(0, 72%, 51%)";

  const simpleChartData = history.map((p) => ({
    date: new Date(p.date).toLocaleDateString("fr-CA", { month: "short", day: "numeric" }),
    close: p.close,
  }));

  const ohlcHistory = history.map((p) => ({
    date: p.date,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
  }));

  const typeLabel: Record<string, string> = {
    stock: "Action",
    etf: "FNB/ETF",
    crypto: "Crypto",
    index: "Indice",
  };

  return (
    <div className="p-6 max-w-4xl">
      <Link href="/">
        <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold font-mono">{quote.symbol}</h1>
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded capitalize">
              {typeLabel[quote.type] ?? quote.type}
            </span>
            {quote.exchange && (
              <span className="text-xs text-muted-foreground">{quote.exchange}</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{quote.name}</p>
        </div>
        <button
          onClick={() => add.mutate({ data: { symbol: quote.symbol, name: quote.name } })}
          disabled={add.isPending}
          className="flex items-center gap-1.5 px-3 py-2 border border-border text-sm font-medium rounded-md hover:bg-muted transition-colors shrink-0"
        >
          <Bookmark className="w-4 h-4" />
          Suivre
        </button>
      </div>

      <div className="mb-6">
        <div className="text-4xl font-bold font-mono">
          {formatPrice(quote.price, quote.currency)}
        </div>
        <div className={`flex items-center gap-1.5 mt-1 text-base font-mono font-semibold ${cls}`}>
          {isUp ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
          {formatChange(quote.change, quote.currency)} ({formatPercent(quote.changePercent)}) aujourd'hui
        </div>
      </div>

      <div className="flex border-b border-border mb-5">
        <button
          onClick={() => setTab("chart")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "chart" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Graphique prix
        </button>
        <button
          onClick={() => setTab("analysis")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "analysis" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          Analyse technique
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-muted-foreground">Période</span>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                range === r.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "chart" && (
        <>
          <div className="bg-card border border-card-border rounded-xl p-4 mb-6">
            {histLoading ? (
              <div className="h-56 bg-muted rounded animate-pulse" />
            ) : simpleChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={simpleChartData}>
                  <defs>
                    <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColor} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={(v) => `$${v.toFixed(0)}`} width={58} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="close" stroke={chartColor} strokeWidth={2} fill="url(#colorClose)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                Aucune donnée disponible
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatBox label="Ouverture" value={quote.open ? formatPrice(quote.open, quote.currency) : null} />
            <StatBox label="Clôture préc." value={quote.previousClose ? formatPrice(quote.previousClose, quote.currency) : null} />
            <StatBox label="Plus haut du jour" value={quote.high ? formatPrice(quote.high, quote.currency) : null} />
            <StatBox label="Plus bas du jour" value={quote.low ? formatPrice(quote.low, quote.currency) : null} />
            <StatBox label="Volume" value={formatVolume(quote.volume)} />
            <StatBox label="Capitalisation" value={formatMarketCap(quote.marketCap)} />
            <StatBox label="Devise" value={quote.currency} />
            <StatBox label="Type" value={typeLabel[quote.type] ?? quote.type} />
          </div>
        </>
      )}

      {tab === "analysis" && (
        histLoading ? (
          <div className="space-y-4">
            {[220, 80, 100, 110].map((h, i) => (
              <div key={i} className="bg-card border border-card-border rounded-xl animate-pulse" style={{ height: h }} />
            ))}
          </div>
        ) : (
          <TechnicalAnalysis history={ohlcHistory} currentPrice={quote.price} currency={quote.currency} symbol={quote.symbol} />
        )
      )}
    </div>
  );
}

EOF_WMM_PATCH

echo ">> Terminé. Relance le serveur dev (npm run dev) pour voir les changements."
echo ">> Nouveautés : Divergences RSI/MACD, ATR + stop-loss, Structure de marché, Fibonacci, Backtest de patterns, Journal de trading/simulateur."
echo ">> Pour revenir en arrière : renomme chaque fichier .bak (ex: mv src/lib/indicators.ts.bak src/lib/indicators.ts)"
