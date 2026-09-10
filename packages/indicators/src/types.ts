export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MacdValue {
  line: number;
  signal: number;
  histogram: number;
}

export interface SignalResult {
  direction: "long" | "short" | "neutral";
  confidence: number;
  reasons: string[];
  indicators: {
    rsi?: number;
    macd?: MacdValue;
    atr?: number;
    supports: number[];
    resistances: number[];
    fibonacci?: Record<string, number>;
    patterns: string[];
    divergences: string[];
    marketStructure?: "uptrend" | "downtrend" | "range";
  };
  suggestedStopLoss?: number;
  suggestedTakeProfit?: number;
}

export interface AnalyzeOptions {
  rsiPeriod?: number;
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  atrPeriod?: number;
  atrStopMultiplier?: number;
}

export interface SupportResistanceResult {
  supports: number[];
  resistances: number[];
}

export interface CandlestickPattern {
  index: number;
  name: string;
  direction: "long" | "short" | "neutral";
}

export interface Divergence {
  index: number;
  indicator: "rsi" | "macd";
  direction: "long" | "short";
}