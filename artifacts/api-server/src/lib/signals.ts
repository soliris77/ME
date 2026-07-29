import type { OHLCPoint } from "./patternDetect";

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

export type SignalStrength = "FORT ACHAT" | "ACHAT" | "NEUTRE" | "VENTE" | "FORTE VENTE";

export interface TradingSignal {
  overall: SignalStrength;
  score: number;
  signals: { name: string; value: string; verdict: "buy" | "sell" | "neutral"; description: string; beginnerTip: string }[];
  recommendation: string;
  beginnerSummary: string;
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
    if (i < period - 1) result.push(NaN);
    else if (i === period - 1) {
      let s = 0;
      for (let j = 0; j < period; j++) s += data[j];
      result.push(s / period);
    } else result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function rsi(closes: number[], period = 14): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(closes.length).fill(undefined);
  if (closes.length < period + 1) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;
  const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result[period] = 100 - 100 / (1 + rs0);
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
    return { upper: mean + stdDevMult * sd, middle: mean, lower: mean - stdDevMult * sd };
  });
}

export function computeIndicators(history: OHLCPoint[]): IndicatorPoint[] {
  const closes = history.map((p) => p.close);
  const ema12Arr = ema(closes, 12);
  const ema26Arr = ema(closes, 26);
  const macdLineArr = ema12Arr.map((v, i) => (isNaN(v) || isNaN(ema26Arr[i]) ? NaN : v - ema26Arr[i]));
  const validMacd = macdLineArr.filter((v) => !isNaN(v));
  const signalOffset = macdLineArr.findIndex((v) => !isNaN(v));
  const macdSignalFull = ema(validMacd, 9);
  const rsiArr = rsi(closes, 14);
  const bbArr = bollingerBands(closes, 20, 2);

  return history.map((p, i) => {
    const macdHistVal = !isNaN(macdLineArr[i]) && i - signalOffset >= 0 && !isNaN(macdSignalFull[i - signalOffset])
      ? macdLineArr[i] - macdSignalFull[i - signalOffset] : undefined;
    return {
      date: p.date, close: p.close, open: p.open, high: p.high, low: p.low, volume: p.volume,
      sma20: sma(closes, 20, i), sma50: sma(closes, 50, i),
      ema12: !isNaN(ema12Arr[i]) ? ema12Arr[i] : undefined,
      ema26: !isNaN(ema26Arr[i]) ? ema26Arr[i] : undefined,
      bbUpper: bbArr[i].upper, bbMiddle: bbArr[i].middle, bbLower: bbArr[i].lower,
      rsi: rsiArr[i],
      macdLine: !isNaN(macdLineArr[i]) ? macdLineArr[i] : undefined,
      macdSignal: i - signalOffset >= 0 && !isNaN(macdSignalFull[i - signalOffset]) ? macdSignalFull[i - signalOffset] : undefined,
      macdHist: macdHistVal,
    };
  });
}

export function analyzeTradingSignals(data: IndicatorPoint[], currentPrice: number): TradingSignal {
  const signals: TradingSignal["signals"] = [];
  let score = 0;
  const last = data[data.length - 1];
  const prev = data.length > 1 ? data[data.length - 2] : null;

  if (last.rsi !== undefined) {
    const r = last.rsi;
    if (r < 30) { signals.push({ name: "RSI", value: r.toFixed(1), verdict: "buy", description: "RSI en zone de survente", beginnerTip: "" }); score += 25; }
    else if (r > 70) { signals.push({ name: "RSI", value: r.toFixed(1), verdict: "sell", description: "RSI en zone de surachat", beginnerTip: "" }); score -= 25; }
    else if (r >= 45 && r <= 60) { signals.push({ name: "RSI", value: r.toFixed(1), verdict: "buy", description: "Momentum haussier sain", beginnerTip: "" }); score += 10; }
    else { signals.push({ name: "RSI", value: r.toFixed(1), verdict: "neutral", description: "Zone neutre", beginnerTip: "" }); }
  }
  if (last.macdLine !== undefined && last.macdSignal !== undefined && prev?.macdLine !== undefined && prev?.macdSignal !== undefined) {
    const crossedUp = prev.macdLine < prev.macdSignal && last.macdLine > last.macdSignal;
    const crossedDown = prev.macdLine > prev.macdSignal && last.macdLine < last.macdSignal;
    if (crossedUp) { signals.push({ name: "MACD", value: "Croisement haussier", verdict: "buy", description: "Croisement haussier", beginnerTip: "" }); score += 30; }
    else if (crossedDown) { signals.push({ name: "MACD", value: "Croisement baissier", verdict: "sell", description: "Croisement baissier", beginnerTip: "" }); score -= 30; }
    else if (last.macdLine > last.macdSignal) { signals.push({ name: "MACD", value: "Haussier", verdict: "buy", description: "MACD au-dessus du signal", beginnerTip: "" }); score += 15; }
    else { signals.push({ name: "MACD", value: "Baissier", verdict: "sell", description: "MACD en dessous du signal", beginnerTip: "" }); score -= 15; }
  }
  if (last.sma20 !== undefined && last.sma50 !== undefined) {
    const golden = last.sma20 > last.sma50;
    signals.push({ name: "SMA 20/50", value: golden ? "Croix dorée" : "Croix de la mort", verdict: golden ? "buy" : "sell", description: "", beginnerTip: "" });
    score += golden ? 20 : -20;
  }
  if (last.sma20 !== undefined) {
    const above = currentPrice > last.sma20;
    signals.push({ name: "Prix vs SMA20", value: above ? "Au-dessus" : "En dessous", verdict: above ? "buy" : "sell", description: "", beginnerTip: "" });
    score += above ? 10 : -10;
  }
  if (last.bbUpper !== undefined && last.bbLower !== undefined) {
    if (currentPrice < last.bbLower) { signals.push({ name: "Bollinger", value: "Sous la bande basse", verdict: "buy", description: "", beginnerTip: "" }); score += 20; }
    else if (currentPrice > last.bbUpper) { signals.push({ name: "Bollinger", value: "Au-dessus de la bande haute", verdict: "sell", description: "", beginnerTip: "" }); score -= 20; }
  }

  const clampedScore = Math.max(-100, Math.min(100, score));
  let overall: SignalStrength, recommendation: string, beginnerSummary: string;
  if (clampedScore >= 60) { overall = "FORT ACHAT"; recommendation = "Plusieurs indicateurs s'alignent en faveur des acheteurs."; beginnerSummary = ""; }
  else if (clampedScore >= 20) { overall = "ACHAT"; recommendation = "Les indicateurs penchent vers le haussier."; beginnerSummary = ""; }
  else if (clampedScore <= -60) { overall = "FORTE VENTE"; recommendation = "Plusieurs indicateurs s'alignent vers le baissier."; beginnerSummary = ""; }
  else if (clampedScore <= -20) { overall = "VENTE"; recommendation = "Les indicateurs penchent vers le baissier."; beginnerSummary = ""; }
  else { overall = "NEUTRE"; recommendation = "Signaux mixtes."; beginnerSummary = ""; }

  return { overall, score: clampedScore, signals, recommendation, beginnerSummary };
}
