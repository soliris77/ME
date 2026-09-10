import { analyzeSignal } from "./analyze";
import { atr, ema, macd, rsi, sma } from "./core";
import type { Candle } from "./types";

export interface OHLCPoint {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export interface IndicatorPoint extends OHLCPoint {
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

export function isIntradayHistory(history: readonly { date: string }[]): boolean {
  if (history.length < 2) return false;
  const gap = Math.abs(new Date(history[1].date).getTime() - new Date(history[0].date).getTime());
  return gap > 0 && gap < 20 * 60 * 60 * 1000;
}

export function formatCandleDate(iso: string, intraday: boolean, fineGrained = false): string {
  const date = new Date(iso);
  if (intraday) {
    return date.toLocaleTimeString("fr-CA", {
      hour: "2-digit",
      minute: "2-digit",
      second: fineGrained ? "2-digit" : undefined,
    });
  }
  return date.toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
}

function toCandles(history: readonly OHLCPoint[]): Candle[] {
  return history.map((point, index) => ({
    timestamp: Number.isFinite(new Date(point.date).getTime())
      ? new Date(point.date).getTime()
      : index,
    open: point.open ?? point.close,
    high: point.high ?? Math.max(point.open ?? point.close, point.close),
    low: point.low ?? Math.min(point.open ?? point.close, point.close),
    close: point.close,
    volume: point.volume ?? 0,
  }));
}

function bollingerBands(closes: readonly number[], period = 20, multiplier = 2) {
  return closes.map((_, index) => {
    if (index < period - 1) return undefined;
    const window = closes.slice(index - period + 1, index + 1);
    const mean = window.reduce((sum, value) => sum + value, 0) / period;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    const deviation = Math.sqrt(variance);
    return {
      upper: mean + multiplier * deviation,
      middle: mean,
      lower: mean - multiplier * deviation,
    };
  });
}

export function computeIndicators(history: readonly OHLCPoint[]): IndicatorPoint[] {
  const candles = toCandles(history);
  const closes = history.map((point) => point.close);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const rsiValues = rsi(closes, 14);
  const macdValues = macd(closes, 12, 26, 9);
  const atrValues = atr(candles, 14);
  const bands = bollingerBands(closes);
  const intraday = isIntradayHistory(history);
  const fineGrained =
    history.length > 1 &&
    Math.abs(new Date(history[1].date).getTime() - new Date(history[0].date).getTime()) <= 60_000;

  return history.map((point, index) => ({
    ...point,
    date: formatCandleDate(point.date, intraday, fineGrained),
    sma20: sma20[index],
    sma50: sma50[index],
    ema12: ema12[index],
    ema26: ema26[index],
    bbUpper: bands[index]?.upper,
    bbMiddle: bands[index]?.middle,
    bbLower: bands[index]?.lower,
    rsi: rsiValues[index],
    macdLine: index >= 0 && ema12[index] !== undefined && ema26[index] !== undefined
      ? (ema12[index] as number) - (ema26[index] as number)
      : undefined,
    macdSignal: macdValues[index]?.signal,
    macdHist: macdValues[index]?.histogram,
    atr: atrValues[index],
  }));
}

function rawHistoryFromIndicators(data: readonly IndicatorPoint[]): OHLCPoint[] {
  return data.map((point, index) => ({
    date: Number.isFinite(new Date(point.date).getTime())
      ? point.date
      : new Date(index * 86_400_000).toISOString(),
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close,
    volume: point.volume,
  }));
}

function signalPresentation(reason: string, direction: "long" | "short" | "neutral") {
  const lower = reason.toLowerCase();
  const verdict =
    lower.includes("haussi") || lower.includes("survente") || lower.includes("au-dessus")
      ? "buy"
      : lower.includes("baissi") || lower.includes("surachat") || lower.includes("sous")
        ? "sell"
        : direction === "long"
          ? "buy"
          : direction === "short"
            ? "sell"
            : "neutral";
  const name =
    lower.includes("rsi") ? "RSI (Force relative)"
      : lower.includes("macd") ? "MACD (Momentum)"
        : lower.includes("moyennes") ? "Tendance (MM 20/50)"
          : lower.includes("bollinger") ? "Bandes de Bollinger"
            : lower.includes("volume") ? "Volume"
              : lower.includes("divergence") ? "Divergence"
                : "Analyse";
  return {
    name,
    value: reason,
    verdict: verdict as "buy" | "sell" | "neutral",
    description: reason,
    beginnerTip: "",
  };
}

export function analyzeTradingSignals(
  data: readonly IndicatorPoint[],
  currentPrice: number,
  history?: readonly OHLCPoint[],
): TradingSignal {
  const source = history?.length ? history : rawHistoryFromIndicators(data);
  const candles = toCandles(source).map((candle, index, all) =>
    index === all.length - 1 ? { ...candle, close: currentPrice } : candle,
  );
  const result = analyzeSignal(candles);
  const score = result.direction === "long"
    ? Math.round(result.confidence * 100)
    : result.direction === "short"
      ? -Math.round(result.confidence * 100)
      : 0;

  let overall: SignalStrength;
  let recommendation: string;
  let beginnerSummary: string;
  if (score >= 60) {
    overall = "FORT ACHAT";
    recommendation = "Plusieurs indicateurs s'alignent en faveur des acheteurs.";
    beginnerSummary = "La majorité des signaux sont fortement positifs. Utilisez toujours un stop-loss.";
  } else if (score >= 20) {
    overall = "ACHAT";
    recommendation = "Les indicateurs penchent vers le haussier.";
    beginnerSummary = "Les signaux sont plutôt positifs, mais pas unanimes.";
  } else if (score <= -60) {
    overall = "FORTE VENTE";
    recommendation = "Plusieurs indicateurs s'alignent vers le baissier.";
    beginnerSummary = "La majorité des signaux sont fortement négatifs.";
  } else if (score <= -20) {
    overall = "VENTE";
    recommendation = "Les indicateurs penchent vers le baissier.";
    beginnerSummary = "Les signaux sont plutôt négatifs.";
  } else {
    overall = "NEUTRE";
    recommendation = "Signaux mixtes — pas d'avantage clair.";
    beginnerSummary = "Les signaux s'annulent mutuellement.";
  }

  return {
    overall,
    score,
    signals: result.reasons.map((reason) => signalPresentation(reason, result.direction)),
    recommendation,
    beginnerSummary,
  };
}