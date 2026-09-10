import type { Candle, MacdValue } from "./types";

function assertPeriod(period: number): void {
  if (!Number.isInteger(period) || period <= 0) {
    throw new RangeError("La période doit être un entier positif");
  }
}

export function sma(values: readonly number[], period: number): (number | undefined)[] {
  assertPeriod(period);
  const result = new Array<number | undefined>(values.length).fill(undefined);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

export function ema(values: readonly number[], period: number): (number | undefined)[] {
  assertPeriod(period);
  const result = new Array<number | undefined>(values.length).fill(undefined);
  if (values.length < period) return result;

  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  result[period - 1] = seed / period;

  const multiplier = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    result[i] = values[i] * multiplier + (result[i - 1] as number) * (1 - multiplier);
  }
  return result;
}

export function rsi(closes: readonly number[], period = 14): (number | undefined)[] {
  assertPeriod(period);
  const result = new Array<number | undefined>(closes.length).fill(undefined);
  if (closes.length < period + 1) return result;

  let averageGain = 0;
  let averageLoss = 0;
  for (let i = 1; i <= period; i++) {
    const difference = closes[i] - closes[i - 1];
    if (difference >= 0) averageGain += difference;
    else averageLoss -= difference;
  }
  averageGain /= period;
  averageLoss /= period;
  result[period] = averageLoss === 0
    ? 100
    : 100 - 100 / (1 + averageGain / averageLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const difference = closes[i] - closes[i - 1];
    const gain = difference > 0 ? difference : 0;
    const loss = difference < 0 ? -difference : 0;
    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
    result[i] = averageLoss === 0
      ? 100
      : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return result;
}

export function macd(
  closes: readonly number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): (MacdValue | undefined)[] {
  assertPeriod(fastPeriod);
  assertPeriod(slowPeriod);
  assertPeriod(signalPeriod);
  if (fastPeriod >= slowPeriod) {
    throw new RangeError("La période MACD rapide doit être inférieure à la période lente");
  }

  const fast = ema(closes, fastPeriod);
  const slow = ema(closes, slowPeriod);
  const line = closes.map((_, index) =>
    fast[index] === undefined || slow[index] === undefined
      ? undefined
      : (fast[index] as number) - (slow[index] as number),
  );
  const firstLineIndex = line.findIndex((value) => value !== undefined);
  if (firstLineIndex < 0) return new Array(closes.length).fill(undefined);

  const compactLine = line.slice(firstLineIndex) as number[];
  const signal = ema(compactLine, signalPeriod);
  return line.map((value, index) => {
    if (value === undefined) return undefined;
    const signalValue = signal[index - firstLineIndex];
    if (signalValue === undefined) return undefined;
    return {
      line: value,
      signal: signalValue,
      histogram: value - signalValue,
    };
  });
}

export function atr(candles: readonly Candle[], period = 14): (number | undefined)[] {
  assertPeriod(period);
  const result = new Array<number | undefined>(candles.length).fill(undefined);
  if (candles.length < period) return result;

  const trueRanges = candles.map((candle, index) => {
    const previousClose = index === 0 ? candle.close : candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });

  let seed = 0;
  for (let i = 0; i < period; i++) seed += trueRanges[i];
  result[period - 1] = seed / period;
  for (let i = period; i < candles.length; i++) {
    result[i] = ((result[i - 1] as number) * (period - 1) + trueRanges[i]) / period;
  }
  return result;
}