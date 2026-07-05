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
      date: new Date(p.date).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
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

export type SignalStrength = "STRONG BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG SELL";

export interface TradingSignal {
  overall: SignalStrength;
  score: number; // -100 to +100
  signals: {
    name: string;
    value: string;
    verdict: "buy" | "sell" | "neutral";
    description: string;
  }[];
  recommendation: string;
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
      signals.push({ name: "RSI", value: r.toFixed(1), verdict: "buy", description: "Oversold — potential bounce zone" });
      score += 25;
    } else if (r > 70) {
      signals.push({ name: "RSI", value: r.toFixed(1), verdict: "sell", description: "Overbought — risk of pullback" });
      score -= 25;
    } else if (r >= 45 && r <= 60) {
      signals.push({ name: "RSI", value: r.toFixed(1), verdict: "buy", description: "Healthy bullish momentum" });
      score += 10;
    } else {
      signals.push({ name: "RSI", value: r.toFixed(1), verdict: "neutral", description: "Neutral momentum zone" });
    }
  }

  // MACD crossover
  if (last.macdLine !== undefined && last.macdSignal !== undefined && prev?.macdLine !== undefined && prev?.macdSignal !== undefined) {
    const crossedUp = prev.macdLine < prev.macdSignal && last.macdLine > last.macdSignal;
    const crossedDown = prev.macdLine > prev.macdSignal && last.macdLine < last.macdSignal;
    if (crossedUp) {
      signals.push({ name: "MACD", value: "Bullish cross", verdict: "buy", description: "MACD crossed above signal — buy signal" });
      score += 30;
    } else if (crossedDown) {
      signals.push({ name: "MACD", value: "Bearish cross", verdict: "sell", description: "MACD crossed below signal — sell signal" });
      score -= 30;
    } else if (last.macdLine > last.macdSignal) {
      signals.push({ name: "MACD", value: "Bullish", verdict: "buy", description: "MACD above signal line" });
      score += 15;
    } else {
      signals.push({ name: "MACD", value: "Bearish", verdict: "sell", description: "MACD below signal line" });
      score -= 15;
    }
  }

  // SMA 20 vs SMA 50 (golden/death cross)
  if (last.sma20 !== undefined && last.sma50 !== undefined) {
    const golden = last.sma20 > last.sma50;
    signals.push({
      name: "SMA 20/50",
      value: golden ? "Golden cross" : "Death cross",
      verdict: golden ? "buy" : "sell",
      description: golden
        ? `SMA20 ($${last.sma20.toFixed(2)}) above SMA50 ($${last.sma50.toFixed(2)}) — uptrend`
        : `SMA20 ($${last.sma20.toFixed(2)}) below SMA50 ($${last.sma50.toFixed(2)}) — downtrend`,
    });
    score += golden ? 20 : -20;
  }

  // Price vs SMA 20
  if (last.sma20 !== undefined) {
    const aboveSma = currentPrice > last.sma20;
    signals.push({
      name: "Price vs SMA20",
      value: aboveSma ? "Above" : "Below",
      verdict: aboveSma ? "buy" : "sell",
      description: aboveSma
        ? `Price above 20-day average ($${last.sma20.toFixed(2)})`
        : `Price below 20-day average ($${last.sma20.toFixed(2)})`,
    });
    score += aboveSma ? 10 : -10;
  }

  // Bollinger Bands
  if (last.bbUpper !== undefined && last.bbLower !== undefined && last.bbMiddle !== undefined) {
    if (currentPrice < last.bbLower) {
      signals.push({ name: "Bollinger Bands", value: "Below lower band", verdict: "buy", description: "Price at lower band — possible reversal zone" });
      score += 20;
    } else if (currentPrice > last.bbUpper) {
      signals.push({ name: "Bollinger Bands", value: "Above upper band", verdict: "sell", description: "Price at upper band — possible exhaustion" });
      score -= 20;
    } else {
      const pct = ((currentPrice - last.bbLower) / (last.bbUpper - last.bbLower)) * 100;
      signals.push({
        name: "Bollinger Bands",
        value: `${pct.toFixed(0)}% of range`,
        verdict: "neutral",
        description: `Price within bands at ${pct.toFixed(0)}% of the range`,
      });
    }
  }

  const clampedScore = Math.max(-100, Math.min(100, score));

  let overall: SignalStrength;
  let recommendation: string;
  if (clampedScore >= 60) {
    overall = "STRONG BUY";
    recommendation = "Multiple indicators aligned bullish. Strong entry opportunity — confirm with volume and news catalyst.";
  } else if (clampedScore >= 20) {
    overall = "BUY";
    recommendation = "Indicators lean bullish. Consider a partial position with a stop-loss below the nearest support.";
  } else if (clampedScore <= -60) {
    overall = "STRONG SELL";
    recommendation = "Multiple indicators aligned bearish. Consider exiting or avoiding new positions until reversal signals appear.";
  } else if (clampedScore <= -20) {
    overall = "SELL";
    recommendation = "Indicators lean bearish. Caution advised — wait for a confirmed reversal before buying.";
  } else {
    overall = "NEUTRAL";
    recommendation = "Mixed signals. No clear edge. Wait for a cleaner setup or higher-conviction confirmation.";
  }

  return { overall, score: clampedScore, signals, recommendation };
}
