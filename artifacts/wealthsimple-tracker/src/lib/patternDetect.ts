/**
 * Détection de patterns de chandeliers — logique partagée avec le serveur
 * (artifacts/api-server/src/lib/patternDetect.ts). Garder les deux en sync.
 */

export interface OHLCPoint {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
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

    // Doji
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

    // Spinning Top
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

    // Hammer / Hanging Man
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

    // Marubozu Bullish
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
          howToUse: "L'un des patterns de retournement les plus fiables. Très efficace au bas d'une tendance.",
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
          howToUse: "Excellent signal de sortie au sommet d'une hausse.",
          candles: 2,
        });
      }

      // Tweezer Bottom
      if (prevBearish && isBullish && Math.abs((prev.low ?? 0) - (c.low ?? 0)) < range * 0.02) {
        patterns.push({
          idx: i, date: dateStr,
          name: "Double plancher",
          nameEn: "Tweezer Bottom",
          signal: "haussier",
          strength: "moyen",
          description: "Deux bougies consécutives touchent exactement le même bas — fort support à ce niveau.",
          howToUse: "Signal que le marché refuse de descendre sous ce niveau. Bon point d'entrée avec un stop sous le support.",
          candles: 2,
        });
      }

      // Tweezer Top
      if (prevBullish && isBearish && Math.abs((prev.high ?? 0) - (c.high ?? 0)) < range * 0.02) {
        patterns.push({
          idx: i, date: dateStr,
          name: "Double plafond",
          nameEn: "Tweezer Top",
          signal: "baissier",
          strength: "moyen",
          description: "Deux bougies consécutives touchent exactement le même haut — forte résistance à ce niveau.",
          howToUse: "Signal que le marché refuse de monter au-delà de ce niveau. Potentiel point de vente.",
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
          description: "3 bougies : baisse, hésitation, puis forte hausse — signal de retournement haussier très fiable.",
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
          description: "3 bougies : hausse, hésitation, puis forte baisse — signal de retournement baissier très fiable.",
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
