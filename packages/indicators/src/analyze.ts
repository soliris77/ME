import { atr, macd, rsi, sma } from "./core";
import { detectDivergences } from "./divergences";
import { detectSupportResistance, fibonacciLevels } from "./levels";
import { detectCandlestickPatterns } from "./patterns";
import { detectMarketStructure } from "./structure";
import type { AnalyzeOptions, Candle, SignalResult } from "./types";

function latest<T>(values: readonly (T | undefined)[]): T | undefined {
  return values.at(-1);
}

function confidenceFromScore(score: number): number {
  return Math.min(1, Math.abs(score) / 100);
}

export function analyzeSignal(
  candles: readonly Candle[],
  options: AnalyzeOptions = {},
): SignalResult {
  if (candles.length === 0) {
    return {
      direction: "neutral",
      confidence: 0,
      reasons: ["Historique vide"],
      indicators: {
        supports: [],
        resistances: [],
        patterns: [],
        divergences: [],
      },
    };
  }

  const rsiPeriod = options.rsiPeriod ?? 14;
  const macdFast = options.macdFast ?? 12;
  const macdSlow = options.macdSlow ?? 26;
  const macdSignal = options.macdSignal ?? 9;
  const atrPeriod = options.atrPeriod ?? 14;
  const atrStopMultiplier = options.atrStopMultiplier ?? 1.5;
  const closes = candles.map((candle) => candle.close);
  const currentPrice = candles.at(-1)!.close;

  const rsiValue = latest(rsi(closes, rsiPeriod));
  const macdSeries = macd(closes, macdFast, macdSlow, macdSignal);
  const macdValue = latest(macdSeries);
  const atrValue = latest(atr(candles, atrPeriod));
  const sma20 = latest(sma(closes, 20));
  const sma50 = latest(sma(closes, 50));
  const bollingerPeriod = 20;
  let bollingerUpper: number | undefined;
  let bollingerLower: number | undefined;
  if (closes.length >= bollingerPeriod) {
    const window = closes.slice(-bollingerPeriod);
    const mean = window.reduce((sum, value) => sum + value, 0) / bollingerPeriod;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / bollingerPeriod;
    const deviation = Math.sqrt(variance);
    bollingerUpper = mean + deviation * 2;
    bollingerLower = mean - deviation * 2;
  }
  const structure = detectMarketStructure(candles);
  const levels = detectSupportResistance(candles);
  const fibonacci = fibonacciLevels(candles);
  const patterns = detectCandlestickPatterns(candles);
  const divergences = detectDivergences(
    candles,
    3,
    rsiPeriod,
    macdFast,
    macdSlow,
    macdSignal,
  );

  let score = 0;
  const reasons: string[] = [];
  const isRange = structure === "range";

  for (const divergence of divergences.filter((item) => item.index >= candles.length - 10)) {
    const points = divergence.direction === "long" ? 20 : -20;
    score += points;
    reasons.push(`Divergence ${divergence.direction === "long" ? "haussière" : "baissière"} ${divergence.indicator.toUpperCase()}`);
  }

  if (rsiValue !== undefined) {
    if (rsiValue < 30) {
      score += isRange ? 30 : structure === "uptrend" ? 20 : 15;
      reasons.push("RSI en zone de survente");
    } else if (rsiValue > 70) {
      score -= isRange ? 30 : structure === "downtrend" ? 20 : 15;
      reasons.push("RSI en zone de surachat");
    } else if (rsiValue >= 45 && rsiValue <= 60 && structure !== "downtrend") {
      score += 10;
      reasons.push("RSI dans une zone de momentum haussier");
    }
  }

  if (macdValue !== undefined) {
    let crossedUp = false;
    let crossedDown = false;
    for (let index = Math.max(1, macdSeries.length - 3); index < macdSeries.length; index++) {
      const previous = macdSeries[index - 1];
      const current = macdSeries[index];
      if (!previous || !current) continue;
      if (previous.line < previous.signal && current.line > current.signal) crossedUp = true;
      if (previous.line > previous.signal && current.line < current.signal) crossedDown = true;
    }
    const crossWeight = isRange ? 20 : 30;
    const trendWeight = isRange ? 10 : 15;
    if (crossedUp) {
      score += crossWeight;
      reasons.push("Croisement MACD haussier récent");
    } else if (crossedDown) {
      score -= crossWeight;
      reasons.push("Croisement MACD baissier récent");
    } else if (macdValue.line > macdValue.signal) {
      score += trendWeight;
      reasons.push("MACD au-dessus de sa ligne de signal");
    } else {
      score -= trendWeight;
      reasons.push("MACD sous sa ligne de signal");
    }
  }

  if (sma20 !== undefined && sma50 !== undefined) {
    const bullishAverage = sma20 > sma50;
    const aboveShortAverage = currentPrice > sma20;
    if (bullishAverage && aboveShortAverage) {
      score += 25;
      reasons.push("Tendance haussière confirmée par les moyennes mobiles");
    } else if (!bullishAverage && !aboveShortAverage) {
      score -= 25;
      reasons.push("Tendance baissière confirmée par les moyennes mobiles");
    } else {
      score += bullishAverage ? 5 : -5;
      reasons.push("Moyennes mobiles en configuration mixte");
    }
  }

  if (bollingerUpper !== undefined && bollingerLower !== undefined) {
    const weight = isRange ? 25 : 15;
    if (currentPrice < bollingerLower) {
      score += weight;
      reasons.push("Prix sous la bande de Bollinger basse");
    } else if (currentPrice > bollingerUpper) {
      score -= weight;
      reasons.push("Prix au-dessus de la bande de Bollinger haute");
    }
  }

  const latestPatterns = patterns.filter((pattern) => pattern.index >= candles.length - 3);
  const recentVolumes = candles.slice(-20).map((candle) => candle.volume);
  if (recentVolumes.length === 20 && candles.at(-1)!.volume > 0) {
    const averageVolume = recentVolumes.reduce((sum, volume) => sum + volume, 0) / 20;
    const ratio = averageVolume > 0 ? candles.at(-1)!.volume / averageVolume : 0;
    if (ratio >= 1.5) {
      score += score > 0 ? 10 : score < 0 ? -10 : 0;
      reasons.push("Volume supérieur à 150 % de la moyenne");
    } else if (ratio < 0.5) {
      score = Math.round(score * 0.85);
      reasons.push("Volume très faible, confiance réduite");
    }
  }

  score = Math.max(-100, Math.min(100, score));
  const direction = score >= 20 ? "long" : score <= -20 ? "short" : "neutral";
  const result: SignalResult = {
    direction,
    confidence: confidenceFromScore(score),
    reasons,
    indicators: {
      rsi: rsiValue,
      macd: macdValue,
      atr: atrValue,
      supports: levels.supports,
      resistances: levels.resistances,
      fibonacci,
      patterns: latestPatterns.map((pattern) => pattern.name),
      divergences: divergences.map(
        (divergence) => `${divergence.direction}:${divergence.indicator}`,
      ),
      marketStructure: structure,
    },
  };

  if (direction !== "neutral" && atrValue !== undefined && atrValue > 0) {
    result.suggestedStopLoss = direction === "long"
      ? currentPrice - atrValue * atrStopMultiplier
      : currentPrice + atrValue * atrStopMultiplier;
    result.suggestedTakeProfit = direction === "long"
      ? currentPrice + atrValue * atrStopMultiplier * (5 / 3)
      : currentPrice - atrValue * atrStopMultiplier * (5 / 3);
  }
  return result;
}