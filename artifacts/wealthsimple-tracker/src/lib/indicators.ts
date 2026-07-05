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
      signals.push({
        name: "RSI (Force relative)",
        value: r.toFixed(1),
        verdict: "buy",
        description: "RSI en zone de survente — rebond probable",
        beginnerTip: "Le RSI mesure si un actif a trop baissé. En dessous de 30, les vendeurs sont épuisés — le prix remonte souvent.",
      });
      score += 25;
    } else if (r > 70) {
      signals.push({
        name: "RSI (Force relative)",
        value: r.toFixed(1),
        verdict: "sell",
        description: "RSI en zone de surachat — correction possible",
        beginnerTip: "Au-dessus de 70, le prix a trop monté trop vite. Un recul est fréquent — prudence avant d'acheter.",
      });
      score -= 25;
    } else if (r >= 45 && r <= 60) {
      signals.push({
        name: "RSI (Force relative)",
        value: r.toFixed(1),
        verdict: "buy",
        description: "Momentum haussier sain",
        beginnerTip: "Le RSI est dans une zone idéale — ni trop haut ni trop bas. La tendance est positive.",
      });
      score += 10;
    } else {
      signals.push({
        name: "RSI (Force relative)",
        value: r.toFixed(1),
        verdict: "neutral",
        description: "Zone neutre — pas de signal clair",
        beginnerTip: "Le RSI ne donne pas de direction claire. Attendez qu'il sorte de cette zone.",
      });
    }
  }

  // MACD
  if (last.macdLine !== undefined && last.macdSignal !== undefined && prev?.macdLine !== undefined && prev?.macdSignal !== undefined) {
    const crossedUp = prev.macdLine < prev.macdSignal && last.macdLine > last.macdSignal;
    const crossedDown = prev.macdLine > prev.macdSignal && last.macdLine < last.macdSignal;
    if (crossedUp) {
      signals.push({
        name: "MACD (Momentum)",
        value: "Croisement haussier",
        verdict: "buy",
        description: "Le MACD vient de croiser la ligne signal vers le haut — signal d'achat",
        beginnerTip: "Quand la ligne MACD (bleue) croise vers le haut la ligne signal (rouge), c'est souvent le début d'une hausse. C'est l'un des signaux les plus fiables.",
      });
      score += 30;
    } else if (crossedDown) {
      signals.push({
        name: "MACD (Momentum)",
        value: "Croisement baissier",
        verdict: "sell",
        description: "Le MACD a croisé la ligne signal vers le bas — signal de vente",
        beginnerTip: "Quand la ligne MACD croise vers le bas, les vendeurs reprennent le contrôle. Prudence ou moment de vendre.",
      });
      score -= 30;
    } else if (last.macdLine > last.macdSignal) {
      signals.push({
        name: "MACD (Momentum)",
        value: "Haussier",
        verdict: "buy",
        description: "MACD au-dessus de la ligne signal",
        beginnerTip: "Le MACD est positif — le momentum est encore favorable aux acheteurs.",
      });
      score += 15;
    } else {
      signals.push({
        name: "MACD (Momentum)",
        value: "Baissier",
        verdict: "sell",
        description: "MACD en dessous de la ligne signal",
        beginnerTip: "Le MACD est négatif — les vendeurs ont l'avantage pour l'instant.",
      });
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
      description: golden
        ? `MM20 ($${last.sma20.toFixed(2)}) au-dessus de MM50 ($${last.sma50.toFixed(2)}) — tendance haussière`
        : `MM20 ($${last.sma20.toFixed(2)}) en dessous de MM50 ($${last.sma50.toFixed(2)}) — tendance baissière`,
      beginnerTip: golden
        ? "La 'croix dorée' se produit quand la moyenne courte dépasse la moyenne longue. C'est un signe que la tendance haussière s'installe."
        : "La 'croix de la mort' est l'inverse — la tendance baissière prend le dessus. Beaucoup de traders l'utilisent comme signal de sortie.",
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
      description: above
        ? `Prix au-dessus de la MM20 ($${last.sma20.toFixed(2)})`
        : `Prix en dessous de la MM20 ($${last.sma20.toFixed(2)})`,
      beginnerTip: above
        ? "Le prix est plus haut que sa moyenne des 20 derniers jours — c'est un signe de force à court terme."
        : "Le prix est plus bas que sa moyenne des 20 jours — signal de faiblesse. Un retour au-dessus serait bullish.",
    });
    score += above ? 10 : -10;
  }

  // Bollinger Bands
  if (last.bbUpper !== undefined && last.bbLower !== undefined && last.bbMiddle !== undefined) {
    if (currentPrice < last.bbLower) {
      signals.push({
        name: "Bandes de Bollinger",
        value: "Sous la bande basse",
        verdict: "buy",
        description: "Prix en dessous de la bande inférieure — zone de retournement potentielle",
        beginnerTip: "Les bandes de Bollinger sont comme des murs élastiques. Quand le prix touche la bande du bas, il rebondit souvent vers le haut — opportunité d'achat.",
      });
      score += 20;
    } else if (currentPrice > last.bbUpper) {
      signals.push({
        name: "Bandes de Bollinger",
        value: "Au-dessus de la bande haute",
        verdict: "sell",
        description: "Prix au-dessus de la bande supérieure — zone d'épuisement potentielle",
        beginnerTip: "Quand le prix touche la bande du haut, il peut se retrouver 'étiré' et revenir vers le milieu. Signe de prudence pour les nouveaux acheteurs.",
      });
      score -= 20;
    } else {
      const pct = ((currentPrice - last.bbLower) / (last.bbUpper - last.bbLower)) * 100;
      signals.push({
        name: "Bandes de Bollinger",
        value: `${pct.toFixed(0)}% de la plage`,
        verdict: "neutral",
        description: `Prix dans les bandes à ${pct.toFixed(0)}% de la plage`,
        beginnerTip: "Le prix est entre les deux bandes — c'est normal. Observez s'il tend vers le haut ou le bas des bandes pour anticiper le prochain mouvement.",
      });
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
