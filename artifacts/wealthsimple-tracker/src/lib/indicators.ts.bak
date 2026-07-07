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
