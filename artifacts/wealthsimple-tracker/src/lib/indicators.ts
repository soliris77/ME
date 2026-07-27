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

// Détecte si un historique est "intraday" (bougies de quelques minutes à
// quelques heures, ex: 1j/5j avec intervalles 5m/15m) plutôt que journalier
// ou plus large. Sert à choisir un format d'affichage de date pertinent :
// heure:minute(:seconde) pour l'intraday, jour/mois pour le reste.
export function isIntradayHistory(history: { date: string }[]): boolean {
  if (history.length < 2) return false;
  const d0 = new Date(history[0].date).getTime();
  const d1 = new Date(history[1].date).getTime();
  const gapMs = Math.abs(d1 - d0);
  return gapMs > 0 && gapMs < 20 * 60 * 60 * 1000; // écart entre 2 bougies < 20h
}

// Formate une date de bougie selon le contexte : si l'historique est
// intraday, on affiche l'heure (avec les secondes si l'écart entre bougies
// est très fin, ex: 1 minute) plutôt que seulement le jour — sinon deux
// bougies du même jour affichaient exactement le même texte sur l'axe.
export function formatCandleDate(iso: string, intraday: boolean, fineGrained = false): string {
  const d = new Date(iso);
  if (intraday) {
    return d.toLocaleTimeString("fr-CA", {
      hour: "2-digit",
      minute: "2-digit",
      second: fineGrained ? "2-digit" : undefined,
    });
  }
  return d.toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
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
  const intraday = isIntradayHistory(history);
  const fineGrained =
    history.length > 1 &&
    Math.abs(new Date(history[1].date).getTime() - new Date(history[0].date).getTime()) <= 60_000;
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
      date: formatCandleDate(p.date, intraday, fineGrained),
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
  const intraday = isIntradayHistory(history);
  const fineGrained =
    history.length > 1 &&
    Math.abs(new Date(history[1].date).getTime() - new Date(history[0].date).getTime()) <= 60_000;

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
    const dateStr = formatCandleDate(c.date, intraday, fineGrained);

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
  const intraday = isIntradayHistory(history);

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
      date: formatCandleDate(c.date, intraday),
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
  const intraday = isIntradayHistory(history);

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
    const dateStr = formatCandleDate(history[i].date, intraday);
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
 * Volume on Balance (OBV) : cumule le volume en l'ajoutant quand le prix
 * monte et en le soustrayant quand il baisse. Sert à confirmer une tendance
 * (OBV qui monte avec le prix = hausse confirmée par le volume).
 */
export function computeOBV(history: OHLCPoint[]): number[] {
  const result: number[] = [];
  let obv = 0;
  for (let i = 0; i < history.length; i++) {
    if (i === 0) {
      result.push(0);
      continue;
    }
    const prevClose = history[i - 1].close;
    const vol = history[i].volume ?? 0;
    if (history[i].close > prevClose) obv += vol;
    else if (history[i].close < prevClose) obv -= vol;
    result.push(obv);
  }
  return result;
}

/**
 * Momentum simple (taux de variation / Rate of Change) : variation en % du
 * prix de clôture entre aujourd'hui et N séances plus tôt.
 */
export function computeMomentum(history: OHLCPoint[], period = 10): number | undefined {
  if (history.length < period + 1) return undefined;
  const last = history[history.length - 1].close;
  const prev = history[history.length - 1 - period].close;
  if (!prev) return undefined;
  return ((last - prev) / prev) * 100;
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

/**
 * Prédiction du prochain mouvement probable, à partir d'un pattern de
 * chandelier détecté récemment. Combine 3 sources de preuve concrètes plutôt
 * que de deviner :
 *  1. Le taux de réussite historique de CE pattern sur CET actif (backtest local)
 *  2. La confluence avec le signal global (RSI/MACD/moyennes mobiles)
 *  3. La proximité d'un support/résistance pour donner un point d'entrée concret
 *
 * Ce n'est pas une prédiction magique — c'est un résumé probabiliste basé sur
 * ce qui s'est passé les fois précédentes, présenté simplement.
 */
export type PredictionAction = "Acheter" | "Vendre" | "Attendre";
export type ConfidenceLabel = "faible" | "moyenne" | "élevée";

export interface CandlePrediction {
  patternName: string;
  patternIdx: number;
  date: string;
  signal: "haussier" | "baissier" | "neutre";
  confidence: number; // 0-100
  confidenceLabel: ConfidenceLabel;
  action: PredictionAction;
  timing: string;
  targetZone: string;
  rationale: string;
}

export function predictNextMove(
  patterns: CandlePattern[],
  backtest: Record<string, PatternBacktestStat>,
  signal: TradingSignal,
  srLevels: SRLevel[],
  currentPrice: number,
): CandlePrediction[] {
  return patterns
    .filter((p) => p.signal !== "neutre")
    .map((p) => {
      const stat = backtest[p.name];

      // 1. Confiance de base : taux de réussite historique s'il y en a assez,
      //    sinon une estimation prudente selon la force théorique du pattern.
      let confidence = stat ? stat.winRate : p.strength === "fort" ? 58 : p.strength === "moyen" ? 52 : 47;

      // 2. Ajustement selon la confluence avec le signal global (RSI/MACD/etc.)
      const signalAgrees =
        (p.signal === "haussier" && signal.score > 15) ||
        (p.signal === "baissier" && signal.score < -15);
      const signalDisagrees =
        (p.signal === "haussier" && signal.score < -15) ||
        (p.signal === "baissier" && signal.score > 15);
      if (signalAgrees) confidence += 12;
      if (signalDisagrees) confidence -= 15;
      confidence = Math.max(5, Math.min(95, Math.round(confidence)));

      const confidenceLabel: ConfidenceLabel = confidence >= 65 ? "élevée" : confidence >= 50 ? "moyenne" : "faible";

      // 3. Timing : cherche le support/résistance le plus proche dans le bon sens
      const relevantLevels = srLevels.filter((l) =>
        p.signal === "haussier" ? l.type === "support" : l.type === "resistance"
      );
      const nearest = relevantLevels.sort((a, b) => a.distancePct - b.distancePct)[0];

      let timing: string;
      let targetZone: string;
      if (nearest && nearest.distancePct <= 1.5) {
        timing = p.signal === "haussier"
          ? `Le prix est déjà proche du support à $${nearest.price.toFixed(2)} (${nearest.distancePct.toFixed(1)}% d'écart) — c'est une zone d'entrée envisageable maintenant.`
          : `Le prix est déjà proche de la résistance à $${nearest.price.toFixed(2)} (${nearest.distancePct.toFixed(1)}% d'écart) — zone de sortie/prudence dès maintenant.`;
        targetZone = `$${nearest.price.toFixed(2)}`;
      } else if (nearest) {
        timing = p.signal === "haussier"
          ? `Idéalement, attendre un repli vers le support à $${nearest.price.toFixed(2)} (${nearest.distancePct.toFixed(1)}% plus bas) avant d'acheter, plutôt qu'entrer immédiatement.`
          : `Idéalement, attendre un rebond vers la résistance à $${nearest.price.toFixed(2)} (${nearest.distancePct.toFixed(1)}% plus haut) avant de vendre/sortir.`;
        targetZone = `$${nearest.price.toFixed(2)}`;
      } else {
        timing = "Aucun support/résistance clair à proximité — confirmez avec la bougie suivante avant d'agir.";
        targetZone = `~$${currentPrice.toFixed(2)}`;
      }

      // Action recommandée
      let action: PredictionAction;
      if (confidence >= 60 && !signalDisagrees) {
        action = p.signal === "haussier" ? "Acheter" : "Vendre";
      } else {
        action = "Attendre";
      }

      const rationale = stat
        ? `Historiquement sur cet actif, ce pattern a été suivi d'un mouvement ${p.signal} ${stat.occurrences} fois sur les dernières données, avec ${stat.winRate}% de réussite et un rendement moyen de ${stat.avgReturnPct >= 0 ? "+" : ""}${stat.avgReturnPct}% sur ${stat.lookaheadDays} bougies.`
        : `Pas encore assez d'occurrences historiques de ce pattern sur cet actif pour un taux de réussite fiable — estimation basée sur la force théorique du pattern (${p.strength}).`;

      return {
        patternName: p.name,
        patternIdx: p.idx,
        date: p.date,
        signal: p.signal,
        confidence,
        confidenceLabel,
        action,
        timing,
        targetZone,
        rationale,
      };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

