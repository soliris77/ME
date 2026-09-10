import { useMemo, useState, useEffect } from "react";
import { useGetQuoteHistory } from "@workspace/api-client-react";
import {
  ComposedChart, Line, Bar, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceArea, Area, AreaChart, Brush,
} from "recharts";
import {
  computeIndicators,
  analyzeTradingSignals,
} from "@workspace/indicators";
import type {
  IndicatorPoint,
  OHLCPoint,
  SignalStrength,
} from "@workspace/indicators";
import {
  detectCandlePatterns, detectPriceGaps, detectSupportResistance,
  getVolatilityInfo, detectMarketStructure, computeFibonacciLevels, detectDivergences, backtestPatterns, predictNextMove,
} from "@/lib/indicators";
import type {
  CandlePattern, PriceGap, SRLevel, VolatilityInfo, MarketStructure, FibonacciResult, Divergence, PatternBacktestStat, CandlePrediction,
} from "@/lib/indicators";
import {
  TrendingUp, TrendingDown, Minus, AlertCircle, ChevronDown, ChevronUp, BookOpen, X, CandlestickChart,
  Radio, ArrowUpRight, ArrowDownRight, Gauge, GitCompareArrows, History, Sparkles, Target,
  ShoppingCart, ArrowDownToLine, Layers,
} from "lucide-react";
import TradingJournal from "@/components/TradingJournal";

interface Props {
  history: OHLCPoint[];
  currentPrice: number;
  currency: string;
  symbol?: string;
  onTrade?: (side: "BUY" | "SELL", source: string) => void;
}

const SIGNAL_COLORS = {
  "FORT ACHAT":  { bg: "bg-[rgba(22,163,74,0.12)]",  text: "text-[#16A34A]",  border: "border-[rgba(22,163,74,0.30)]" },
  "ACHAT":       { bg: "bg-[rgba(22,163,74,0.07)]",  text: "text-[#16A34A]",  border: "border-[rgba(22,163,74,0.18)]" },
  "NEUTRE":      { bg: "bg-muted",                    text: "text-muted-foreground", border: "border-border" },
  "VENTE":       { bg: "bg-[rgba(220,38,38,0.07)]",  text: "text-[#DC2626]",  border: "border-[rgba(220,38,38,0.18)]" },
  "FORTE VENTE": { bg: "bg-[rgba(220,38,38,0.12)]",  text: "text-[#DC2626]",  border: "border-[rgba(220,38,38,0.30)]" },
};

type ActiveOverlay = "sma" | "ema" | "bb" | "sr" | "fib";

// Nombre minimum de bougies nécessaires pour que chaque indicateur ait des
// valeurs à afficher (ex : EMA 26 a besoin d'au moins 26 jours). En dessous
// de ce seuil, on désactive le bouton plutôt que d'afficher un graphique vide.
const OVERLAY_MIN_HISTORY: Record<ActiveOverlay, number> = {
  sma: 50, // SMA 50 est la plus exigeante des deux moyennes mobiles
  ema: 26, // EMA 26
  bb: 20, // Bandes de Bollinger (période 20)
  sr: 15,
  fib: 15,
};

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.5rem",
  fontSize: 11,
  color: "hsl(var(--foreground))",
};

// Guide pour débutants
const BEGINNER_GUIDE = [
  {
    term: "RSI (Force Relative)",
    simple: "Jauge de fatigue",
    explain: "Imaginez un ressort qu'on tire trop fort. Au-dessus de 70, le prix est 'épuisé' vers le haut et risque de redescendre. En dessous de 30, il est 'épuisé' vers le bas et peut rebondir.",
    action: "En dessous de 30 → chercher à acheter. Au-dessus de 70 → prudence ou vendre.",
    color: "text-blue-500",
  },
  {
    term: "MACD",
    simple: "Détecteur de changement de tendance",
    explain: "Le MACD compare deux moyennes de vitesse du prix. Quand la ligne bleue croise vers le haut la ligne rouge, c'est souvent le début d'une hausse. L'inverse annonce une baisse.",
    action: "Croix bleue vers le haut → signal d'achat. Croix bleue vers le bas → signal de vente.",
    color: "text-violet-500",
  },
  {
    term: "Moyennes Mobiles (SMA/EMA)",
    simple: "Prix moyen lissé",
    explain: "La MM20 est la moyenne des 20 derniers jours de prix. Si le prix actuel est au-dessus, la tendance est haussière. La 'Croix dorée' (MM20 > MM50) est l'un des signaux les plus populaires chez les traders.",
    action: "Prix > MM20 et MM20 > MM50 → tendance haussière confirmée.",
    color: "text-emerald-500",
  },
  {
    term: "Bandes de Bollinger",
    simple: "Enveloppe élastique du prix",
    explain: "Ces bandes s'élargissent quand le marché est volatile et se resserrent quand il est calme. Quand le prix touche la bande du bas, il rebondit souvent vers le milieu. La bande du haut est une zone de résistance.",
    action: "Prix à la bande basse → rebond probable (achat). Prix à la bande haute → résistance (prudence).",
    color: "text-orange-500",
  },
  {
    term: "Supports & Résistances",
    simple: "Planchers et plafonds invisibles",
    explain: "Un support est un niveau de prix où les acheteurs reviennent souvent (le prix a du mal à descendre plus bas). Une résistance est un niveau où les vendeurs reviennent souvent (le prix a du mal à monter plus haut). Plus un niveau a été touché de fois, plus il est fiable.",
    action: "Prix proche d'un support → rebond possible (achat prudent). Prix proche d'une résistance → ralentissement probable (prudence).",
    color: "text-cyan-500",
  },
  {
    term: "Gaps de prix (écarts)",
    simple: "Trou entre deux séances",
    explain: "Un gap se produit quand le prix ouvre nettement au-dessus ou en dessous de la clôture précédente — souvent après une nouvelle importante ou un rapport de résultats. Beaucoup de gaps finissent par être 'comblés' : le prix revient éventuellement toucher le niveau d'avant le gap.",
    action: "Gap haussier non comblé → tendance forte. Gap baissier non comblé → faiblesse. Un gap non comblé depuis longtemps agit souvent comme aimant pour le prix.",
    color: "text-pink-500",
  },
  {
    term: "ATR (volatilité)",
    simple: "Combien ça bouge, en moyenne",
    explain: "L'ATR mesure de combien le prix bouge en moyenne chaque jour, en dollars. Plus il est élevé, plus le titre est volatile (mouvements amples et rapides, risqué mais potentiel de gain plus grand). Plus il est faible, plus le titre est calme.",
    action: "Utilise l'ATR pour placer ton stop-loss : trop proche du prix actuel, un titre volatile te sortira pour rien. Vise environ 1,5x l'ATR de distance.",
    color: "text-amber-500",
  },
  {
    term: "Structure de marché",
    simple: "Sommets et creux qui racontent une histoire",
    explain: "En regardant la suite des sommets (hauts) et des creux (bas) récents, on peut dire si le marché est en tendance haussière (sommets et creux de plus en plus hauts), baissière (de plus en plus bas), ou en range (ça oscille sans direction).",
    action: "En tendance haussière, cherche à acheter sur les replis. En tendance baissière, évite d'acheter à contre-courant. En range, achète bas et vends haut dans la fourchette.",
    color: "text-indigo-500",
  },
  {
    term: "Fibonacci (retracement)",
    simple: "Les niveaux de pause préférés du marché",
    explain: "Après un grand mouvement de prix, une correction s'arrête souvent à des niveaux précis : 38,2%, 50% ou 61,8% du mouvement. Ce n'est pas magique — c'est parce que beaucoup de traders regardent les mêmes niveaux et y placent des ordres.",
    action: "Le niveau 61,8% est souvent surveillé comme zone d'achat en tendance haussière. Combine-le avec un autre signal (RSI, pattern de chandelier) pour plus de fiabilité.",
    color: "text-rose-500",
  },
  {
    term: "Divergences RSI/MACD",
    simple: "Quand le prix et l'indicateur ne sont plus d'accord",
    explain: "Normalement, quand le prix monte, le RSI et le MACD montent aussi. Une divergence, c'est quand le prix fait un nouveau sommet (ou creux) mais que l'indicateur ne le confirme pas — un signal que la tendance s'essouffle même si le prix ne le montre pas encore.",
    action: "Divergence baissière (prix monte, indicateur baisse) → signal de prudence. Divergence haussière (prix baisse, indicateur monte) → signal de retournement possible.",
    color: "text-teal-500",
  },
];

// Tooltip enrichi pour le graphique chandelier — affiche OHLCV complet
function CandleTooltip({
  active, payload, label,
}: {
  active?: boolean;
  label?: string;
  payload?: { payload?: { open: number; high: number; low: number; close: number; volume: number | null; isUp: boolean } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-card border border-card-border rounded-lg px-3 py-2 shadow-lg text-xs min-w-[130px]">
      <p className="text-muted-foreground font-medium mb-1.5">{label}</p>
      <div className="space-y-0.5 font-mono">
        <div className="flex justify-between gap-4"><span className="text-muted-foreground">Ouv.</span><span>${d.open.toFixed(2)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-muted-foreground">Haut</span><span className="text-emerald-500">${d.high.toFixed(2)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-muted-foreground">Bas</span><span className="text-red-500">${d.low.toFixed(2)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-muted-foreground">Clôt.</span>
          <span className={d.isUp ? "text-emerald-500 font-bold" : "text-red-500 font-bold"}>${d.close.toFixed(2)}</span>
        </div>
        {d.volume != null && (
          <div className="flex justify-between gap-4 border-t border-border/50 pt-0.5 mt-0.5">
            <span className="text-muted-foreground">Vol.</span>
            <span>{d.volume >= 1e9 ? `${(d.volume/1e9).toFixed(1)}G` : d.volume >= 1e6 ? `${(d.volume/1e6).toFixed(1)}M` : d.volume >= 1e3 ? `${(d.volume/1e3).toFixed(0)}K` : d.volume}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PriceTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-card border border-card-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span style={{ color: p.color }} className="font-semibold">{p.name} :</span>
          <span className="font-mono">${typeof p.value === "number" ? p.value.toFixed(2) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function RSITooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const val = payload[0]?.value;
  const zone = val < 30 ? "Survente (potentiel rebond)" : val > 70 ? "Surachat (risque de recul)" : "Zone neutre";
  const color = val < 30 ? "#22c55e" : val > 70 ? "#ef4444" : "hsl(var(--muted-foreground))";
  return (
    <div className="bg-card border border-card-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p className="font-mono font-bold">{val?.toFixed(1)}</p>
      <p style={{ color }} className="font-medium">{zone}</p>
    </div>
  );
}

function MACDTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-card border border-card-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span style={{ color: p.color }} className="font-semibold">{p.name} :</span>
          <span className="font-mono">{typeof p.value === "number" ? p.value.toFixed(4) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function BeginnerGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-card-border rounded-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">Guide des indicateurs — Pour débutants</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          {BEGINNER_GUIDE.map((g) => (
            <div key={g.term} className="border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm font-bold ${g.color}`}>{g.term}</span>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{g.simple}</span>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed mb-2">{g.explain}</p>
              <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                <p className="text-xs font-medium text-primary">💡 Comment l'utiliser : {g.action}</p>
              </div>
            </div>
          ))}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">⚠️ Rappel important</p>
            <p className="text-xs text-foreground/70 leading-relaxed">
              Aucun indicateur n'est parfait seul. Les meilleurs traders utilisent une <strong>combinaison</strong> d'indicateurs et attendent que plusieurs signaux s'alignent avant d'agir.
              Ne risquez jamais plus que vous ne pouvez vous permettre de perdre.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label, dashed, box }: { color: string; label: string; dashed?: boolean; box?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {box ? (
        <span className="w-3 h-2.5 rounded-sm inline-block" style={{ background: color }} />
      ) : (
        <span
          className="w-5 inline-block rounded"
          style={{ background: dashed ? "transparent" : color, borderTop: dashed ? `2px dashed ${color}` : undefined, height: dashed ? 0 : "2px" }}
        />
      )}
      {label}
    </div>
  );
}

function CandlePatternBadge({
  p, backtest, hasPrediction, highlighted, onJumpToPrediction,
}: {
  p: CandlePattern;
  backtest?: PatternBacktestStat;
  hasPrediction?: boolean;
  highlighted?: boolean;
  onJumpToPrediction?: () => void;
}) {
  const isUp = p.signal === "haussier";
  const isDown = p.signal === "baissier";
  const strengthLabel = p.strength === "fort" ? "⭐⭐ Fort" : p.strength === "moyen" ? "⭐ Moyen" : "Faible";
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div
      id={`pattern-${p.idx}-${p.name}`}
      className={`border rounded-xl p-3 cursor-pointer transition-all ${highlighted ? "ring-2 ring-primary/60" : ""} ${!isUp && !isDown ? "bg-muted/30 border-border hover:border-border/80" : ""}`}
      style={isUp || isDown ? {
        background: isUp ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)",
        borderColor: isUp ? "rgba(22,163,74,0.20)" : "rgba(220,38,38,0.20)",
      } : undefined}
      onClick={() => setShowDetail((v) => !v)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-sm font-bold"
              style={{ color: isUp ? "#16A34A" : isDown ? "#DC2626" : undefined }}
            >
              {isUp ? "🟢" : isDown ? "🔴" : "⚪"} {p.name}
            </span>
            <span className="text-xs text-muted-foreground italic">{p.nameEn}</span>
            {p.candles > 1 && (
              <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{p.candles} bougies</span>
            )}
            {hasPrediction && (
              <button
                onClick={(e) => { e.stopPropagation(); onJumpToPrediction?.(); }}
                className="text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded flex items-center gap-1 hover:bg-primary/25 transition-colors"
                title="Voir la prédiction liée à ce chandelier"
              >
                <Sparkles className="w-3 h-3" /> Prédiction
              </button>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{p.date} · {strengthLabel}</div>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform mt-0.5 ${showDetail ? "rotate-180" : ""}`} />
      </div>
      {showDetail && (
        <div className="mt-2 space-y-1.5 border-t border-border/50 pt-2">
          <p className="text-xs text-foreground/80 leading-relaxed">{p.description}</p>
          <div className="bg-background/60 rounded-lg px-2.5 py-1.5">
            <p className="text-xs font-medium text-primary">💡 Comment l'utiliser :</p>
            <p className="text-xs text-foreground/70 mt-0.5 leading-relaxed">{p.howToUse}</p>
          </div>
          {backtest && (
            <div className="bg-background/60 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-xs text-foreground/70 leading-relaxed">
                Sur ce titre : <strong>{backtest.occurrences} occurrences</strong> passées, <strong>{backtest.winRate}%</strong> ont évolué dans le sens attendu sur {backtest.lookaheadDays} jours (rendement moyen {backtest.avgReturnPct > 0 ? "+" : ""}{backtest.avgReturnPct}%).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ACTION_STYLE: Record<CandlePrediction["action"], { bg: string; text: string; border: string }> = {
  Acheter:  { bg: "bg-[rgba(22,163,74,0.10)]",  text: "text-[#16A34A]",  border: "border-[rgba(22,163,74,0.25)]" },
  Vendre:   { bg: "bg-[rgba(220,38,38,0.10)]",  text: "text-[#DC2626]",  border: "border-[rgba(220,38,38,0.25)]" },
  Attendre: { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" },
};

// Point 1 : mini-graphique de chandeliers dans la section "Prédictions & signaux
// d'entrée", pour voir visuellement sur quelles bougies les prédictions se
// basent (contour violet = bougie liée à une prédiction active).
function PredictionCandleChart({
  history, data, predictions,
}: {
  history: OHLCPoint[];
  data: IndicatorPoint[];
  predictions: CandlePrediction[];
}) {
  const mutedFg = "hsl(var(--muted-foreground))";
  const WINDOW = 40;
  const startIdx = Math.max(0, history.length - WINDOW);
  const predictedIdx = useMemo(() => new Set(predictions.map((p) => p.patternIdx)), [predictions]);

  const chartData = useMemo(
    () =>
      data.slice(startIdx).map((d, i) => {
        const idx = startIdx + i;
        const open = d.open ?? d.close;
        const low = d.low ?? d.close;
        const high = d.high ?? d.close;
        const isUp = d.close >= open;
        return {
          ...d,
          open,
          low,
          high,
          idx,
          isUp,
          hasPrediction: predictedIdx.has(idx),
          wickRange: [low, high] as [number, number],
          bodyRange: [Math.min(open, d.close), Math.max(open, d.close)] as [number, number],
        };
      }),
    [data, startIdx, predictedIdx]
  );

  const [pcBrushStart, setPcBrushStart] = useState(() => 0);
  const [pcBrushEnd, setPcBrushEnd] = useState(() => Math.max(0, chartData.length - 1));

  if (chartData.length === 0) return null;

  return (
    <div className="mb-3">
      <div className="h-64 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: mutedFg }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: mutedFg }} axisLine={false} tickLine={false} width={38} />
            <Tooltip content={<CandleTooltip />} />
            <Bar dataKey="wickRange" barSize={2} isAnimationActive={false}>
              {chartData.map((d, i) => (
                <Cell key={`wick-${d.idx}-${i}`} fill={d.isUp ? "#22c55e" : "#ef4444"} />
              ))}
            </Bar>
            <Bar dataKey="bodyRange" barSize={7} isAnimationActive={false}>
              {chartData.map((d, i) => (
                <Cell
                  key={`body-${d.idx}-${i}`}
                  fill={d.isUp ? "#22c55e" : "#ef4444"}
                  stroke={d.hasPrediction ? "#a855f7" : "none"}
                  strokeWidth={d.hasPrediction ? 2 : 0}
                />
              ))}
            </Bar>
            <Brush
              dataKey="date" height={24}
              stroke="hsl(var(--border) / 0.5)" fill="hsl(var(--card))"
              travellerWidth={7} tickFormatter={() => ""}
              startIndex={pcBrushStart}
              endIndex={Math.min(pcBrushEnd, chartData.length - 1)}
              onChange={(r) => {
                if (r && r.startIndex != null && r.endIndex != null) {
                  setPcBrushStart(r.startIndex);
                  setPcBrushEnd(r.endIndex);
                }
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground mt-1 px-1">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> Bougie haussière</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" /> Bougie baissière</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm border-2 border-purple-500 inline-block" /> Bougie liée à une prédiction ci-dessous</span>
      </div>
    </div>
  );
}

function PredictionRow({
  pred, highlighted, onJumpToPattern, onTrade,
}: {
  pred: CandlePrediction;
  highlighted?: boolean;
  onJumpToPattern?: () => void;
  onTrade?: (side: "BUY" | "SELL", source: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const style = ACTION_STYLE[pred.action];
  const isUp = pred.signal === "haussier";
  const tradeSide: "BUY" | "SELL" | null =
    pred.action === "Acheter" ? "BUY" : pred.action === "Vendre" ? "SELL" : null;

  return (
    <div
      id={`prediction-${pred.patternIdx}-${pred.patternName}`}
      className={`border rounded-lg overflow-hidden cursor-pointer transition-colors ${
        highlighted ? "ring-2 ring-primary/60 border-primary/40" : "border-card-border hover:border-primary/40"
      }`}
      onClick={() => setOpen((v) => !v)}
    >
      <div className="grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[1.5fr_1fr_1fr_auto] items-center gap-2 px-3 py-2.5 bg-card">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate flex items-center gap-1.5">
            {isUp ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />}
            {pred.patternName}
          </div>
          <div className="text-xs text-muted-foreground">{pred.date}</div>
        </div>
        <div className="hidden sm:block text-xs text-muted-foreground">
          Confiance : <strong className="text-foreground">{pred.confidence}%</strong> ({pred.confidenceLabel})
        </div>
        <div className="hidden sm:block text-xs text-muted-foreground truncate">Zone : {pred.targetZone}</div>
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <span className={`text-xs font-bold px-2 py-1 rounded-md border ${style.bg} ${style.text} ${style.border} whitespace-nowrap`}>
            {pred.action}
          </span>
          {onTrade && tradeSide && (
            <button
              title={tradeSide === "BUY" ? "Acheter maintenant" : "Vendre maintenant"}
              onClick={(e) => { e.stopPropagation(); onTrade(tradeSide, pred.patternName); }}
              className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border transition-all whitespace-nowrap ${
                tradeSide === "BUY"
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600"
                  : "bg-red-600 hover:bg-red-500 text-white border-red-600"
              }`}
            >
              {tradeSide === "BUY"
                ? <><ShoppingCart className="w-3 h-3" /> Acheter</>
                : <><ArrowDownToLine className="w-3 h-3" /> Vendre</>}
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="px-3 py-2.5 border-t border-card-border bg-background/50 space-y-2">
          <div className="sm:hidden text-xs text-muted-foreground">
            Confiance : <strong className="text-foreground">{pred.confidence}%</strong> ({pred.confidenceLabel}) · Zone : {pred.targetZone}
          </div>
          <div className="flex items-start gap-2">
            <Target className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/80 leading-relaxed">{pred.timing}</p>
          </div>
          <div className="flex items-start gap-2">
            <History className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/70 leading-relaxed">{pred.rationale}</p>
          </div>
          {onJumpToPattern && (
            <button
              onClick={(e) => { e.stopPropagation(); onJumpToPattern(); }}
              className="text-xs bg-primary/15 text-primary px-2 py-1 rounded-md flex items-center gap-1 hover:bg-primary/25 transition-colors"
            >
              <CandlestickChart className="w-3.5 h-3.5" /> Voir le chandelier détecté
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function GapBadge({ g, currency }: { g: PriceGap; currency: string }) {
  const isUp = g.type === "haussier";
  return (
    <div className={`border rounded-xl p-3 ${isUp ? "bg-emerald-500/8 border-emerald-500/20" : "bg-red-500/8 border-red-500/20"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isUp ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <ArrowDownRight className="w-3.5 h-3.5 text-red-500 shrink-0" />}
          <span className={`text-sm font-bold ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            Gap {isUp ? "haussier" : "baissier"} {g.gapPct > 0 ? "+" : ""}{g.gapPct}%
          </span>
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${g.filled ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
          {g.filled ? "Comblé" : "Non comblé"}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {g.date} · Clôture préc. {currency}{g.prevClose.toFixed(2)} → Ouverture {currency}{g.open.toFixed(2)}
      </div>
      {!g.filled && (
        <p className="text-xs text-foreground/60 mt-1 leading-relaxed italic border-t border-border/40 pt-1">
          💡 {isUp
            ? "Gap encore ouvert : le marché n'est pas revenu combler cet écart, signe de force. Certains traders surveillent ce niveau comme support potentiel."
            : "Gap encore ouvert : le marché n'est pas revenu combler cet écart, signe de faiblesse. Ce niveau peut agir comme résistance."}
        </p>
      )}
    </div>
  );
}

function SRLevelRow({ l, currency }: { l: SRLevel; currency: string }) {
  const isSupport = l.type === "support";
  const strengthLabel = l.strength === "fort" ? "⭐⭐ Fort" : l.strength === "moyen" ? "⭐ Moyen" : "Faible";
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${isSupport ? "bg-emerald-500/8 border-emerald-500/20" : "bg-red-500/8 border-red-500/20"}`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isSupport ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>
          {isSupport ? "Support" : "Résistance"}
        </span>
        <span className="font-mono text-sm font-semibold">{currency}{l.price.toFixed(2)}</span>
        <span className="text-xs text-muted-foreground">{l.touches}x touché · {strengthLabel}</span>
      </div>
      <span className={`text-xs font-mono ${isSupport ? "text-emerald-500" : "text-red-500"}`}>
        {l.distancePct > 0 ? "+" : ""}{l.distancePct}%
      </span>
    </div>
  );
}

function VolatilityCard({ vol, currency }: { vol: VolatilityInfo; currency: string }) {
  const labelColor = vol.label === "faible" ? "text-emerald-500" : vol.label === "modérée" ? "text-amber-500" : "text-red-500";
  const barPct = vol.label === "faible" ? 25 : vol.label === "modérée" ? 60 : 90;
  return (
    <div className="bg-card border border-card-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Gauge className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Volatilité (ATR) &amp; suggestion de stop-loss</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
        L'ATR mesure de combien le prix bouge en moyenne chaque jour. Les niveaux ci-dessous sont calculés à partir de cette volatilité réelle, pas d'un pourcentage arbitraire.
      </p>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${vol.label === "faible" ? "bg-emerald-500" : vol.label === "modérée" ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${barPct}%` }} />
        </div>
        <span className={`text-xs font-bold ${labelColor}`}>Volatilité {vol.label}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="bg-muted/40 rounded-lg px-2.5 py-1.5">
          <span className="text-muted-foreground">ATR (14 jours)</span>
          <div className="font-mono font-semibold">{currency}{vol.atr.toFixed(2)} ({vol.atrPct.toFixed(2)}%/jour)</div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="border border-emerald-500/20 bg-emerald-500/8 rounded-lg px-3 py-2">
          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">Si position acheteuse (long)</div>
          <div className="text-xs text-muted-foreground">Stop-loss suggéré : <span className="font-mono font-semibold text-foreground">{currency}{vol.stopLossLong.toFixed(2)}</span></div>
          <div className="text-xs text-muted-foreground">Take-profit suggéré : <span className="font-mono font-semibold text-foreground">{currency}{vol.takeProfitLong.toFixed(2)}</span></div>
        </div>
        <div className="border border-red-500/20 bg-red-500/8 rounded-lg px-3 py-2">
          <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">Si position vendeuse (short)</div>
          <div className="text-xs text-muted-foreground">Stop-loss suggéré : <span className="font-mono font-semibold text-foreground">{currency}{vol.stopLossShort.toFixed(2)}</span></div>
          <div className="text-xs text-muted-foreground">Take-profit suggéré : <span className="font-mono font-semibold text-foreground">{currency}{vol.takeProfitShort.toFixed(2)}</span></div>
        </div>
      </div>
      <p className="text-xs text-foreground/60 mt-2 italic">💡 Basé sur 1,5x l'ATR pour le stop-loss et 2,5x pour le take-profit — des multiples courants chez les traders. Ajuste selon ta tolérance au risque.</p>
    </div>
  );
}

function MarketStructureBanner({ structure }: { structure: MarketStructure }) {
  const color = structure.trend === "haussière" ? "text-emerald-500" : structure.trend === "baissière" ? "text-red-500" : "text-muted-foreground";
  return (
    <div className="bg-card border border-card-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <GitCompareArrows className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Structure de marché</span>
        <span className={`text-sm font-bold ml-auto ${color}`}>{structure.label}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{structure.description}</p>
    </div>
  );
}

function FibLevelRow({ level, currency, isKey }: { level: FibonacciResult["levels"][number]; currency: string; isKey: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-1.5 ${isKey ? "bg-rose-500/8 border-rose-500/25" : "bg-muted/30 border-border"}`}>
      <span className={`text-xs font-semibold ${isKey ? "text-rose-500" : "text-muted-foreground"}`}>{level.label}</span>
      <span className="font-mono text-sm">{currency}{level.price.toFixed(2)}</span>
    </div>
  );
}

function DivergenceBadge({ d }: { d: Divergence }) {
  const isBull = d.type === "haussière";
  const C = isBull ? "#16A34A" : "#DC2626";
  return (
    <div
      className="border rounded-xl p-3"
      style={{
        background: isBull ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)",
        borderColor: isBull ? "rgba(22,163,74,0.20)" : "rgba(220,38,38,0.20)",
      }}
    >
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        {isBull
          ? <TrendingUp   className="w-3.5 h-3.5" style={{ color: C }} />
          : <TrendingDown className="w-3.5 h-3.5" style={{ color: C }} />}
        <span className="text-sm font-bold" style={{ color: C }}>
          Divergence {d.type} ({d.indicator})
        </span>
        <span className="text-xs text-muted-foreground ml-auto">{d.date}</span>
      </div>
      <p className="text-xs text-foreground/70 leading-relaxed">{d.description}</p>
    </div>
  );
}

/* ─── PatternRadar — visualisation balayage radar ────────────────────────────
 * Remplace la grille de CandlePatternBadge par un cercle avec ligne de balayage
 * continu. Les patterns sont des points positionnés selon :
 *   - angle   : répartition uniforme des N patterns détectés sur 360°
 *   - rayon   : force du signal (winRate normalisé → 28–90% du rayon max)
 *   - couleur : haussier=#16A34A, baissier=#DC2626, neutre=#8B92A5
 * Cliquable → affiche le CandlePatternBadge du pattern sélectionné.
 * prefers-reduced-motion → balayage désactivé, dots visibles statiquement.
 * ─────────────────────────────────────────────────────────────────────────── */
function PatternRadar({
  patterns,
  backtestStats,
}: {
  patterns: CandlePattern[];
  backtestStats: Record<string, PatternBacktestStat>;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const SIZE   = 220;
  const CX     = SIZE / 2;
  const CY     = SIZE / 2;
  const MAX_R  = 84;
  const RINGS  = [0.35, 0.65, 1.0];

  // Couleurs de la charte
  const GRID_C  = "#232838";
  const ACCENT  = "#D4A72C";
  const GAIN    = "#16A34A";
  const LOSS    = "#DC2626";
  const MUTED_C = "#8B92A5";

  // Sector de traîne (30° CCW depuis la ligne de balayage qui pointe vers 12h)
  // 12h = 270° SVG. Traîne de 240° → 270° en sens horaire.
  const tRad = (240 * Math.PI) / 180;
  const tX = CX + MAX_R * Math.cos(tRad);
  const tY = CY + MAX_R * Math.sin(tRad);
  // Arc sens horaire (sweep-flag=1) de (tX,tY) à (CX, CY-MAX_R)
  const trailPath = `M ${CX} ${CY} L ${tX.toFixed(2)} ${tY.toFixed(2)} A ${MAX_R} ${MAX_R} 0 0 1 ${CX} ${(CY - MAX_R).toFixed(2)} Z`;

  const visible = patterns.slice(0, 12);
  const n = visible.length;

  const dots = visible.map((p, i) => {
    const angleDeg = n > 0 ? (i / n) * 360 - 90 : 0;
    const angleRad = (angleDeg * Math.PI) / 180;
    const stat = backtestStats[p.name];
    // winRate est un pourcentage (ex. 65), on normalise vers [0,1]
    const strength = stat ? Math.max(0, Math.min(1, stat.winRate / 100)) : 0.5;
    const r = (0.28 + strength * 0.62) * MAX_R;
    const dotColor =
      p.signal === "haussier" ? GAIN :
      p.signal === "baissier" ? LOSS : MUTED_C;
    return {
      x: CX + r * Math.cos(angleRad),
      y: CY + r * Math.sin(angleRad),
      p, dotColor,
      id: `${p.idx}-${p.name}-${i}`,
    };
  });

  const selectedDot = selectedIdx !== null ? (dots[selectedIdx] ?? null) : null;

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label="Radar de patterns en chandelier"
          style={{ display: "block", overflow: "visible" }}
        >
          {/* Anneaux de grille + labels de force */}
          {([{ s: 0.35, label: "Faible" }, { s: 0.65, label: "Moyen" }, { s: 1.0, label: "Fort" }] as const).map(({ s, label }) => (
            <g key={label}>
              <circle cx={CX} cy={CY} r={MAX_R * s} fill="none" stroke={GRID_C} strokeWidth={1} />
              <text
                x={CX + MAX_R * s * 0.71 + 2}
                y={CY - MAX_R * s * 0.71 - 2}
                fontSize={6.5}
                fill={MUTED_C}
                textAnchor="start"
                opacity={0.65}
              >{label}</text>
            </g>
          ))}
          {/* Axes */}
          <line x1={CX} y1={CY - MAX_R} x2={CX} y2={CY + MAX_R} stroke={GRID_C} strokeWidth={1} />
          <line x1={CX - MAX_R} y1={CY} x2={CX + MAX_R} y2={CY} stroke={GRID_C} strokeWidth={1} />

          {/* Ligne de balayage + traîne */}
          {!reduced && (
            <g style={{ transformOrigin: `${CX}px ${CY}px`, animation: "radarSweep 5s linear infinite" }}>
              <path d={trailPath} fill={ACCENT} fillOpacity={0.07} stroke="none" />
              <line x1={CX} y1={CY} x2={CX} y2={CY - MAX_R}
                stroke={ACCENT} strokeWidth={1.5} strokeLinecap="round" opacity={0.9} />
            </g>
          )}

          {/* Point central */}
          <circle cx={CX} cy={CY} r={2.5} fill={ACCENT} />

          {/* Points de patterns */}
          {dots.map((d, i) => {
            const isSel = selectedIdx === i;
            return (
              <g
                key={d.id}
                role="button"
                tabIndex={0}
                aria-label={d.p.name}
                onClick={() => setSelectedIdx(isSel ? null : i)}
                onKeyDown={(e) => e.key === "Enter" && setSelectedIdx(isSel ? null : i)}
                style={{
                  cursor: "pointer",
                  animation: reduced ? undefined : `radarFadeIn 0.35s ${i * 0.07}s both`,
                }}
              >
                {isSel && (
                  <circle cx={d.x} cy={d.y} r={11}
                    fill="none" stroke={d.dotColor} strokeWidth={1} opacity={0.35} />
                )}
                <circle cx={d.x} cy={d.y} r={isSel ? 6 : 4.5}
                  fill={d.dotColor} opacity={isSel ? 1 : 0.85} />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Détail du pattern sélectionné */}
      {selectedDot && (
        <div className="animate-fadeUp">
          <CandlePatternBadge p={selectedDot.p} backtest={backtestStats[selectedDot.p.name]} />
        </div>
      )}

      {patterns.length === 0 && (
        <p className="text-xs text-center py-3" style={{ color: "#8B92A5" }}>
          Aucun pattern de chandelier reconnu sur la bougie la plus récente.
        </p>
      )}
    </div>
  );
}

// ─── Multi-Timeframe Panel ────────────────────────────────────────────────────

interface TfSlot {
  label: string;
  shortLabel: string;
  signal: { overall: SignalStrength; score: number } | null;
  loading: boolean;
}

function MultiTimeframePanel({ frames }: { frames: TfSlot[] }) {
  const filled = frames.filter((f) => f.signal !== null);
  if (filled.length === 0 && frames.every((f) => f.loading)) {
    // Skeleton pendant le chargement initial
    return (
      <div className="bg-card border border-card-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm font-semibold">Analyse multi-timeframe</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {frames.map((f) => (
            <div key={f.shortLabel} className="rounded-lg border border-dashed border-border p-3 h-20 animate-pulse bg-muted/30" />
          ))}
        </div>
      </div>
    );
  }

  const bullCount = filled.filter((f) => f.signal!.score > 10).length;
  const bearCount = filled.filter((f) => f.signal!.score < -10).length;
  const total = filled.length;

  let confluenceText: string;
  let confluenceColor: string;
  if (total === 0) return null;
  if (bullCount === total) {
    confluenceText = "✅ Confluence haussière — tous les horizons s'accordent. Signal de forte conviction.";
    confluenceColor = "text-emerald-600 dark:text-emerald-400";
  } else if (bearCount === total) {
    confluenceText = "🔴 Confluence baissière — tous les horizons s'accordent. Signal de forte conviction.";
    confluenceColor = "text-red-500";
  } else if (bullCount >= 2) {
    confluenceText = "⚡ Majorité haussière — signal court terme dans le sens de la tendance de fond.";
    confluenceColor = "text-emerald-600 dark:text-emerald-400";
  } else if (bearCount >= 2) {
    confluenceText = "⚡ Majorité baissière — le rebond éventuel va à contre-courant de la tendance de fond.";
    confluenceColor = "text-red-500";
  } else {
    confluenceText = "⚠️ Signaux contradictoires — pas de direction claire sur tous les horizons. Prudence.";
    confluenceColor = "text-amber-500";
  }

  return (
    <div className="bg-card border border-card-border rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <Layers className="w-3.5 h-3.5 text-primary" />
        <span className="text-sm font-semibold">Analyse multi-timeframe</span>
        <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded ml-auto">
          1M · 3M · 6M — bougies journalières
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {frames.map(({ label, shortLabel, signal, loading }) => {
          if (loading && !signal) {
            return (
              <div key={shortLabel} className="rounded-lg border border-dashed border-border p-3 h-20 animate-pulse bg-muted/30" />
            );
          }
          if (!signal) {
            return (
              <div key={shortLabel} className="rounded-lg border border-dashed border-border p-3 flex flex-col items-center justify-center gap-1 opacity-40">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{shortLabel}</span>
                <span className="text-[10px] text-muted-foreground">Données insuffisantes</span>
              </div>
            );
          }
          const colors = SIGNAL_COLORS[signal.overall] ?? SIGNAL_COLORS["NEUTRE"];
          const icon =
            signal.overall.includes("ACHAT") ? <TrendingUp className="w-3.5 h-3.5" /> :
            signal.overall.includes("VENTE") ? <TrendingDown className="w-3.5 h-3.5" /> :
            <Minus className="w-3.5 h-3.5" />;
          return (
            <div key={shortLabel} className={`rounded-lg border p-3 flex flex-col gap-1.5 ${colors.bg} ${colors.border}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{shortLabel}</span>
                <span className={`text-[11px] font-mono font-bold ${colors.text}`}>
                  {signal.score > 0 ? "+" : ""}{signal.score}
                </span>
              </div>
              <div className={`flex items-center gap-1 text-[11px] font-semibold leading-tight ${colors.text}`}>
                {icon}
                <span>{signal.overall}</span>
              </div>
              <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
            </div>
          );
        })}
      </div>

      <p className={`text-xs font-medium ${confluenceColor}`}>{confluenceText}</p>
      <p className="text-[11px] text-muted-foreground/60 mt-1 leading-relaxed">
        Un signal court terme qui contredit le long terme est souvent un rebond dans la tendance principale — pas un retournement. La confluence entre horizons renforce la conviction.
      </p>
    </div>
  );
}

export default function TechnicalAnalysis({ history, currentPrice, currency, symbol, onTrade }: Props) {
  const [overlays, setOverlays] = useState<Set<ActiveOverlay>>(new Set(["sma"]));
  const [showDetails, setShowDetails] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [taZoomStart, setTaZoomStart] = useState(0);
  const [taZoomEnd, setTaZoomEnd] = useState(0);

  const data: IndicatorPoint[] = useMemo(() => computeIndicators(history), [history]);
  const analysis = useMemo(() => analyzeTradingSignals(data, currentPrice, history), [data, currentPrice, history]);

  // ── Multi-timeframe : fetch 3 horizons fixes (toujours journaliers) ────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: raw1mo, isLoading: loading1mo } = useGetQuoteHistory(symbol ?? "", "1mo", { query: { enabled: !!symbol, staleTime: 5 * 60_000 } as any });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: raw3mo, isLoading: loading3mo } = useGetQuoteHistory(symbol ?? "", "3mo", { query: { enabled: !!symbol, staleTime: 5 * 60_000 } as any });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: raw6mo, isLoading: loading6mo } = useGetQuoteHistory(symbol ?? "", "6mo", { query: { enabled: !!symbol, staleTime: 5 * 60_000 } as any });

  const multiTfSignals: TfSlot[] = useMemo(() => {
    const toOHLC = (raw: unknown): OHLCPoint[] => {
      if (!Array.isArray(raw)) return [];
      return (raw as OHLCPoint[]).map((p) => ({
        date: p.date, open: p.open ?? null, high: p.high ?? null,
        low: p.low ?? null, close: p.close, volume: p.volume ?? null,
      }));
    };
    const computeForHistory = (raw: unknown): { overall: SignalStrength; score: number } | null => {
      const h = toOHLC(raw);
      if (h.length < 30) return null;
      const d = computeIndicators(h);
      const last = h[h.length - 1];
      const sig = analyzeTradingSignals(d, last.close, h);
      return { overall: sig.overall, score: sig.score };
    };
    return [
      { label: "Court terme",  shortLabel: "1M", signal: computeForHistory(raw1mo), loading: loading1mo },
      { label: "Moyen terme",  shortLabel: "3M", signal: computeForHistory(raw3mo), loading: loading3mo },
      { label: "Long terme",   shortLabel: "6M", signal: computeForHistory(raw6mo), loading: loading6mo },
    ];
  }, [raw1mo, raw3mo, raw6mo, loading1mo, loading3mo, loading6mo]);
  // ── Données enrichies pour les graphiques ──────────────────────────────────
  // Volume avec moyenne glissante 20 périodes (pour la ligne sur le graphique volume)
  const enrichedData = useMemo(
    () =>
      data.map((d, i) => {
        const slice = data.slice(Math.max(0, i - 19), i + 1);
        const vols = slice.map((p) => p.volume ?? 0).filter((v) => v > 0);
        return {
          ...d,
          volumeAvg20: vols.length >= 5 ? vols.reduce((a, b) => a + b, 0) / vols.length : undefined,
        };
      }),
    [data]
  );

  // 4 couleurs MACD : vert vif (hausse qui s'accélère), vert pâle (hausse qui ralentit),
  // rouge vif (baisse qui s'accélère), rose pâle (baisse qui ralentit/retourne)
  const macdColors = useMemo(
    () =>
      data.map((d, i) => {
        const h = d.macdHist;
        const prevH = i > 0 ? data[i - 1].macdHist : undefined;
        if (h == null) return "hsl(var(--muted-foreground) / 0.3)";
        const rising = prevH == null || h > prevH;
        if (h >= 0) return rising ? "#16a34a" : "#4ade80";
        return rising ? "#fca5a5" : "#dc2626";
      }),
    [data]
  );

  const allPatterns = useMemo(() => detectCandlePatterns(history), [history]);
  // Show only patterns from the last 30 candles, most recent first, deduplicate by same idx+name
  const recentPatterns = useMemo(() => {
    const cutoff = history.length - 30;
    const seen = new Set<string>();
    return allPatterns
      .filter((p) => p.idx >= cutoff)
      .reverse()
      .filter((p) => {
        const key = `${p.idx}-${p.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 12);
  }, [allPatterns, history.length]);

  // Patterns détectés sur la toute dernière bougie — mis à jour à chaque rafraîchissement des données
  const livePatterns = useMemo(
    () => allPatterns.filter((p) => p.idx === history.length - 1),
    [allPatterns, history.length]
  );

  const priceGaps = useMemo(() => detectPriceGaps(history), [history]);
  const recentGaps = useMemo(() => [...priceGaps].reverse().slice(0, 8), [priceGaps]);
  const unfilledGaps = useMemo(() => priceGaps.filter((g) => !g.filled), [priceGaps]);

  const srLevels = useMemo(() => detectSupportResistance(history, currentPrice), [history, currentPrice]);

  const volatility = useMemo(() => getVolatilityInfo(data, currentPrice), [data, currentPrice]);
  const structure = useMemo(() => detectMarketStructure(history), [history]);
  const fibonacci = useMemo(() => computeFibonacciLevels(history), [history]);
  const divergences = useMemo(() => detectDivergences(data), [data]);
  const backtestStats = useMemo(() => backtestPatterns(history, allPatterns, 3), [history, allPatterns]);
  const predictions = useMemo(
    () => predictNextMove(recentPatterns, backtestStats, analysis, srLevels, currentPrice).slice(0, 8),
    [recentPatterns, backtestStats, analysis, srLevels, currentPrice]
  );

  // Petit indicateur visuel pour confirmer que tout se recalcule bien en
  // direct — se met à jour chaque fois que `history` change (donc à chaque
  // rafraîchissement automatique toutes les 10s dans QuoteDetail.tsx).
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  useEffect(() => {
    setLastUpdated(new Date());
  }, [history]);

  // ── Zoom partagé RSI / MACD / Prix — fenêtre initialisée à 50 % des données
  useEffect(() => {
    const n = data.length;
    if (n === 0) return;
    setTaZoomStart(Math.max(0, n - Math.round(n * 0.5)));
    setTaZoomEnd(n - 1);
  }, [data.length]);

  const toggleOverlay = (o: ActiveOverlay) => {
    setOverlays((prev) => {
      const next = new Set(prev);
      next.has(o) ? next.delete(o) : next.add(o);
      return next;
    });
  };

  // Connexion "Chandeliers détectés" <-> "Prédictions & signaux d'entrée" :
  // les deux sections dérivent déjà des mêmes patterns (predictNextMove
  // utilise recentPatterns), on ajoute ici un aller-retour visuel entre les
  // deux pour que ce lien soit évident, pas seulement logique.
  const predictionKeySet = useMemo(
    () => new Set(predictions.map((pr) => `${pr.patternIdx}-${pr.patternName}`)),
    [predictions]
  );
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const jumpTo = (elementId: string, key: string) => {
    setHighlightKey(key);
    // Léger délai pour laisser le DOM se stabiliser si une section vient de s'ouvrir
    requestAnimationFrame(() => {
      document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    setTimeout(() => setHighlightKey((k) => (k === key ? null : k)), 2200);
  };

  if (history.length < 20) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-6 flex items-center gap-3 text-muted-foreground text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Pas assez de données pour l'analyse technique. Sélectionnez une période plus longue (1m ou plus).
      </div>
    );
  }

  const colors = SIGNAL_COLORS[analysis.overall] ?? SIGNAL_COLORS["NEUTRE"];
  const overallIcon =
    analysis.overall.includes("ACHAT") ? <TrendingUp className="w-5 h-5" /> :
    analysis.overall.includes("VENTE") ? <TrendingDown className="w-5 h-5" /> :
    <Minus className="w-5 h-5" />;

  const scoreWidth = `${Math.abs(analysis.score)}%`;
  const scoreIsPos = analysis.score >= 0;
  const border = "hsl(var(--border))";
  const mutedFg = "hsl(var(--muted-foreground))";
  const font = 10;
  const yDomain: [string, string] = ["auto", "auto"];

  return (
    <div className="space-y-4">
      {showGuide && <BeginnerGuide onClose={() => setShowGuide(false)} />}

      {/* Résumé débutant */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
        <p className="text-sm text-foreground/80 leading-relaxed flex-1">{analysis.beginnerSummary}</p>
        <button
          onClick={() => setShowGuide(true)}
          className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0 mt-0.5"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Guide débutant
        </button>
      </div>

      {/* Radar de patterns — visualisation balayage continu */}
      <div className="bg-card border border-card-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: "#D4A72C" }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#D4A72C" }} />
          </span>
          <Radio className="w-3.5 h-3.5" style={{ color: "#D4A72C" }} />
          <span className="text-sm font-semibold">Radar de patterns — dernière bougie</span>
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded ml-auto">
            Mis à jour à chaque nouvelle donnée
          </span>
        </div>
        <PatternRadar patterns={livePatterns} backtestStats={backtestStats} />
      </div>

      {/* Indicateur "en direct" — confirme visuellement que tout se rafraîchit tout seul toutes les 10s */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        En direct — mis à jour à {lastUpdated.toLocaleTimeString("fr-CA")} (rafraîchissement automatique toutes les 5s)
      </div>

      {/* Prédictions IA — table interactive des signaux d'entrée/sortie */}
      <div className="bg-card border border-card-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm font-semibold">Prédictions &amp; signaux d'entrée</span>
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded ml-auto">Basé sur l'historique de ce titre — cliquez une ligne pour le détail</span>
        </div>
        <PredictionCandleChart history={history} data={data} predictions={predictions} />
        {predictions.length === 0 ? (
          <p className="text-xs text-muted-foreground">Pas assez de patterns récents pour établir une prédiction fiable.</p>
        ) : (
          <div className="space-y-1.5">
            {predictions.map((pred, i) => (
              <PredictionRow
                key={`pred-${pred.patternIdx}-${pred.patternName}-${i}`}
                pred={pred}
                highlighted={highlightKey === `${pred.patternIdx}-${pred.patternName}`}
                onJumpToPattern={() => jumpTo(`pattern-${pred.patternIdx}-${pred.patternName}`, `${pred.patternIdx}-${pred.patternName}`)}
                onTrade={onTrade}
              />
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground/70 mt-3 leading-relaxed">
          ⚠️ Ces prédictions se basent sur ce qui s'est produit après ce pattern les fois précédentes sur ce titre — ce n'est pas une garantie. Combinez toujours avec votre propre jugement et un stop-loss.
        </p>
      </div>

      {/* Structure de marché + Volatilité (ATR) */}
      <div className="grid grid-cols-1 gap-4">
        <MarketStructureBanner structure={structure} />
        {volatility && <VolatilityCard vol={volatility} currency={currency} />}
      </div>

      {/* Multi-timeframe */}
      {symbol && <MultiTimeframePanel frames={multiTfSignals} />}

      {/* Signal global */}
      <div className={`rounded-xl border p-5 ${colors.bg} ${colors.border}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={`flex items-center gap-2 font-bold text-lg ${colors.text}`}>
              {overallIcon}
              {analysis.overall}
            </div>
            <p className="text-sm text-foreground/80 mt-1 max-w-lg">{analysis.recommendation}</p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-xs text-muted-foreground mb-1">Score de conviction</div>
              <div className={`text-2xl font-bold font-mono ${colors.text}`}>
                {analysis.score > 0 ? "+" : ""}{analysis.score}
              </div>
            </div>
            {onTrade && analysis.overall !== "NEUTRE" && (
              <div className="flex gap-1.5">
                {(analysis.overall === "FORT ACHAT" || analysis.overall === "ACHAT") && (
                  <button
                    onClick={() => onTrade("BUY", analysis.overall)}
                    className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600 transition-colors whitespace-nowrap"
                  >
                    <ShoppingCart className="w-3 h-3" /> Acheter
                  </button>
                )}
                {(analysis.overall === "FORTE VENTE" || analysis.overall === "VENTE") && (
                  <button
                    onClick={() => onTrade("SELL", analysis.overall)}
                    className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border bg-red-600 hover:bg-red-500 text-white border-red-600 transition-colors whitespace-nowrap"
                  >
                    <ArrowDownToLine className="w-3 h-3" /> Vendre
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="relative h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
            <div className="absolute inset-0 flex">
              <div className="flex-1 flex justify-end pr-px">
                {!scoreIsPos && (
                  <div className="h-full rounded-l-full bg-red-500" style={{ width: scoreWidth }} />
                )}
              </div>
              <div className="w-px bg-black/20 dark:bg-white/20" />
              <div className="flex-1 pl-px">
                {scoreIsPos && (
                  <div className="h-full rounded-r-full bg-emerald-500" style={{ width: scoreWidth }} />
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Forte vente</span><span>Neutre</span><span>Fort achat</span>
          </div>
        </div>

        <button
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium mt-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showDetails ? "Masquer les signaux" : `Voir les ${analysis.signals.length} signaux détaillés`}
        </button>

        {showDetails && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {analysis.signals.map((sig) => (
              <div key={sig.name} className="bg-background/60 border border-border/50 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{sig.name}</span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    sig.verdict === "buy" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                    sig.verdict === "sell" ? "bg-red-500/15 text-red-600 dark:text-red-400" :
                    "bg-muted text-muted-foreground"
                  }`}>{sig.value}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{sig.description}</p>
                <p className="text-xs text-foreground/60 mt-1 leading-relaxed italic border-t border-border/40 pt-1">💡 {sig.beginnerTip}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Graphique prix + overlays */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold">Prix &amp; Indicateurs</span>
          <div className="flex items-center gap-1.5">
            {(["sma", "ema", "bb", "sr", "fib"] as ActiveOverlay[]).map((o) => {
              const hasEnoughData = history.length >= OVERLAY_MIN_HISTORY[o];
              const label = o === "sma" ? "MM 20/50" : o === "ema" ? "EMA 12/26" : o === "bb" ? "Bollinger" : o === "sr" ? "Support/Résist." : "Fibonacci";
              return (
                <button
                  key={o}
                  onClick={() => hasEnoughData && toggleOverlay(o)}
                  disabled={!hasEnoughData}
                  title={hasEnoughData ? undefined : `Besoin d'au moins ${OVERLAY_MIN_HISTORY[o]} bougies — choisis une période plus longue (3m ou plus) pour activer "${label}".`}
                  className={`px-2 py-1 text-xs font-medium rounded border transition-colors ${
                    !hasEnoughData
                      ? "bg-muted/50 text-muted-foreground/40 border-border cursor-not-allowed"
                      : overlays.has(o)
                      ? o === "sma" ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      : o === "ema" ? "bg-violet-500/20 text-violet-400 border-violet-500/30"
                      : o === "bb" ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
                      : o === "sr" ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
                      : "bg-rose-500/20 text-rose-400 border-rose-500/30"
                      : "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={yDomain} tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toFixed(0)}`} width={58} />
            <Tooltip content={<PriceTooltip />} />

            {overlays.has("sr") && srLevels.map((l) => (
              <ReferenceLine
                key={`sr-${l.price}`}
                y={l.price}
                stroke={l.type === "support" ? "#10b981" : "#ef4444"}
                strokeDasharray="6 3"
                strokeWidth={l.strength === "fort" ? 1.75 : 1}
                label={{ value: `${l.type === "support" ? "S" : "R"} $${l.price.toFixed(0)}`, position: "insideBottomRight", fontSize: 9, fill: l.type === "support" ? "#10b981" : "#ef4444" }}
              />
            ))}

            {overlays.has("fib") && fibonacci?.levels.map((l) => (
              <ReferenceLine
                key={`fib-${l.ratio}`}
                y={l.price}
                stroke="#f43f5e"
                strokeDasharray={l.ratio === 0.618 || l.ratio === 0.5 ? "2 2" : "6 4"}
                strokeWidth={l.ratio === 0.618 || l.ratio === 0.5 ? 1.5 : 0.75}
                label={{ value: `${l.label}`, position: "insideTopLeft", fontSize: 9, fill: "#f43f5e" }}
              />
            ))}

            {overlays.has("bb") && (
              <>
                <Area dataKey="bbUpper" stroke="none" fill="hsl(38 100% 50% / 0.08)" connectNulls dot={false} name="Boll. Haut" legendType="none" />
                <Area dataKey="bbLower" stroke="none" fill="hsl(var(--background))" connectNulls dot={false} name="Boll. Bas" legendType="none" />
                <Line dataKey="bbUpper" stroke="hsl(38 100% 55%)" strokeWidth={1} strokeDasharray="4 2" dot={false} name="Boll. Haut" connectNulls />
                <Line dataKey="bbMiddle" stroke="hsl(38 100% 55%)" strokeWidth={1} strokeDasharray="2 2" dot={false} name="Boll. Mid" connectNulls />
                <Line dataKey="bbLower" stroke="hsl(38 100% 55%)" strokeWidth={1} strokeDasharray="4 2" dot={false} name="Boll. Bas" connectNulls />
              </>
            )}

            <Line dataKey="close" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Prix" connectNulls activeDot={{ r: 4, strokeWidth: 0 }} />

            {overlays.has("sma") && (
              <>
                <Line dataKey="sma20" stroke="#60a5fa" strokeWidth={1.5} dot={false} name="MM20" connectNulls />
                <Line dataKey="sma50" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="MM50" connectNulls />
              </>
            )}

            {overlays.has("ema") && (
              <>
                <Line dataKey="ema12" stroke="#34d399" strokeWidth={1.5} strokeDasharray="5 2" dot={false} name="EMA12" connectNulls />
                <Line dataKey="ema26" stroke="#f87171" strokeWidth={1.5} strokeDasharray="5 2" dot={false} name="EMA26" connectNulls />
              </>
            )}
            <Brush
              dataKey="date" height={28}
              stroke="hsl(var(--border) / 0.5)" fill="hsl(var(--card))"
              travellerWidth={8} tickFormatter={() => ""}
              startIndex={taZoomStart} endIndex={taZoomEnd}
              onChange={(r) => {
                if (r && r.startIndex != null && r.endIndex != null) {
                  setTaZoomStart(r.startIndex);
                  setTaZoomEnd(r.endIndex);
                }
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-center text-[10px] text-muted-foreground/40 mt-1 tracking-wider">Glissez les ancrages · synchronisé avec RSI et MACD</p>

        <div className="flex flex-wrap gap-3 mt-2 px-1">
          <LegendDot color="hsl(var(--primary))" label="Prix" />
          {overlays.has("sma") && <><LegendDot color="#60a5fa" label="MM 20 jours" /><LegendDot color="#a78bfa" label="MM 50 jours" /></>}
          {overlays.has("ema") && <><LegendDot color="#34d399" label="EMA 12" dashed /><LegendDot color="#f87171" label="EMA 26" dashed /></>}
          {overlays.has("bb") && <LegendDot color="hsl(38 100% 55%)" label="Bandes Bollinger" dashed />}
          {overlays.has("sr") && <><LegendDot color="#10b981" label="Support" dashed /><LegendDot color="#ef4444" label="Résistance" dashed /></>}
          {overlays.has("fib") && <LegendDot color="#f43f5e" label="Fibonacci" dashed />}
        </div>
      </div>

      {/* Volume */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <span className="text-sm font-semibold block mb-1">Volume des échanges</span>
        <p className="text-xs text-muted-foreground mb-3">Nombre d'actions/unités échangées sur la période. Un volume élevé confirme la force d'un mouvement.</p>
        <ResponsiveContainer width="100%" height={80}>
          <ComposedChart data={enrichedData} margin={{ top: 0, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} width={52}
              tickFormatter={(v) => v >= 1e9 ? `${(v/1e9).toFixed(1)}G` : v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v} />
            <Tooltip formatter={(v: number, name: string) => [
              name === "Moy. 20" ? (v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v.toFixed(0)) :
              (v >= 1e9 ? `${(v/1e9).toFixed(2)}G` : v >= 1e6 ? `${(v/1e6).toFixed(2)}M` : v), name
            ]} contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="volume" radius={[2, 2, 0, 0]} name="Volume" isAnimationActive={false}>
              {enrichedData.map((d, i) => (
                <Cell key={`vol-${i}`} fill={d.close >= (d.open ?? d.close) ? "rgba(34,197,94,0.55)" : "rgba(239,68,68,0.55)"} />
              ))}
            </Bar>
            <Line dataKey="volumeAvg20" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false}
              strokeDasharray="4 2" name="Moy. 20" connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* RSI */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold">RSI — Indice de force relative (14)</span>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-emerald-500 font-medium">30 = Survente</span>
            <span className="text-red-500 font-medium">70 = Surachat</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">En dessous de 30 : le prix a trop baissé, rebond possible. Au-dessus de 70 : le prix a trop monté, recul possible.</p>
        <ResponsiveContainer width="100%" height={135}>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="rsiGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} ticks={[0, 30, 50, 70, 100]} width={30} />
            <Tooltip content={<RSITooltip />} />
            {/* Zones colorées de fond — survente (vert) et surachat (rouge) */}
            <ReferenceArea y1={0} y2={30} fill="#22c55e" fillOpacity={0.07} stroke="none" />
            <ReferenceArea y1={70} y2={100} fill="#ef4444" fillOpacity={0.07} stroke="none" />
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1} label={{ value: "Surachat", position: "right", fontSize: 9, fill: "#ef4444" }} />
            <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="4 2" strokeWidth={1} label={{ value: "Survente", position: "right", fontSize: 9, fill: "#22c55e" }} />
            <ReferenceLine y={50} stroke={border} strokeDasharray="2 2" strokeWidth={1} />
            <Area dataKey="rsi" stroke="hsl(var(--primary))" strokeWidth={1.5} fill="url(#rsiGrad)" dot={false} name="RSI" connectNulls />
            <Brush
              dataKey="date" height={26}
              stroke="hsl(var(--border) / 0.5)" fill="hsl(var(--card))"
              travellerWidth={8} tickFormatter={() => ""}
              startIndex={taZoomStart} endIndex={taZoomEnd}
              onChange={(r) => {
                if (r && r.startIndex != null && r.endIndex != null) {
                  setTaZoomStart(r.startIndex);
                  setTaZoomEnd(r.endIndex);
                }
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* MACD */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold">MACD — Convergence/Divergence (12, 26, 9)</span>
          <div className="flex items-center gap-3 text-xs">
            <LegendDot color="#60a5fa" label="MACD" />
            <LegendDot color="#f87171" label="Signal" dashed />
            <LegendDot color="hsl(var(--muted-foreground))" label="Histogramme" box />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Ligne bleue croise vers le haut la rouge → signal d'achat. Vers le bas → signal de vente. L'histogramme montre la force du momentum.</p>
        <ResponsiveContainer width="100%" height={145}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: font, fill: mutedFg }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => v.toFixed(2)} />
            <Tooltip content={<MACDTooltip />} />
            <ReferenceLine y={0} stroke={border} strokeWidth={1} />
            {/* Histogramme 4 couleurs : vert vif / vert pâle / rose / rouge vif selon force + direction */}
            <Bar dataKey="macdHist" name="Histogramme" radius={[1, 1, 0, 0]} isAnimationActive={false}>
              {data.map((_, i) => (
                <Cell key={`macd-${i}`} fill={macdColors[i]} />
              ))}
            </Bar>
            <Line dataKey="macdLine" stroke="#60a5fa" strokeWidth={1.5} dot={false} name="MACD" connectNulls />
            <Line dataKey="macdSignal" stroke="#f87171" strokeWidth={1.5} strokeDasharray="5 2" dot={false} name="Signal" connectNulls />
            <Brush
              dataKey="date" height={26}
              stroke="hsl(var(--border) / 0.5)" fill="hsl(var(--card))"
              travellerWidth={8} tickFormatter={() => ""}
              startIndex={taZoomStart} endIndex={taZoomEnd}
              onChange={(r) => {
                if (r && r.startIndex != null && r.endIndex != null) {
                  setTaZoomStart(r.startIndex);
                  setTaZoomEnd(r.endIndex);
                }
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Patterns de chandeliers détectés */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <CandlestickChart className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Patterns de chandeliers détectés</span>
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded ml-auto">30 dernières bougies</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Patterns identifiés automatiquement sur l'historique récent. Cliquez sur un pattern pour voir son explication et comment l'utiliser — le badge <span className="text-primary font-medium">Prédiction</span> saute directement vers le signal d'entrée correspondant plus haut.
        </p>
        {recentPatterns.length === 0 ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Aucun pattern reconnu sur les 30 dernières bougies. Essayez une période plus longue.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recentPatterns.map((p, i) => {
              const key = `${p.idx}-${p.name}`;
              return (
                <CandlePatternBadge
                  key={`${key}-${i}`}
                  p={p}
                  backtest={backtestStats[p.name]}
                  hasPrediction={predictionKeySet.has(key)}
                  highlighted={highlightKey === key}
                  onJumpToPrediction={() => jumpTo(`prediction-${key}`, key)}
                />
              );
            })}
          </div>
        )}
        <div className="mt-3 flex gap-3 text-xs text-muted-foreground border-t border-border pt-2.5">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Haussier</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Baissier</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" />Neutre</span>
        </div>
      </div>

      {/* Niveaux de support / résistance */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold">Niveaux clés — Supports &amp; Résistances</span>
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded ml-auto">Détection automatique</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Niveaux de prix où le marché a réagi plusieurs fois dans le passé. Activez "Support/Résist." sur le graphique ci-dessus pour les visualiser.
        </p>
        {srLevels.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Pas assez de points pivots sur cette période pour identifier des niveaux fiables.
          </div>
        ) : (
          <div className="space-y-1.5">
            {srLevels.map((l) => (
              <SRLevelRow key={`${l.type}-${l.price}`} l={l} currency={currency} />
            ))}
          </div>
        )}
      </div>

      {/* Gaps de prix */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold">Gaps de prix récents</span>
          {unfilledGaps.length > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{unfilledGaps.length} non comblé{unfilledGaps.length > 1 ? "s" : ""}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Écarts entre la clôture d'une séance et l'ouverture de la suivante. Les gaps non comblés indiquent souvent une direction forte du marché.
        </p>
        {recentGaps.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Aucun gap significatif détecté sur cette période.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recentGaps.map((g, i) => (
              <GapBadge key={`gap-${g.idx}-${i}`} g={g} currency={currency} />
            ))}
          </div>
        )}
      </div>

      {/* Divergences RSI/MACD */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold">Divergences RSI / MACD</span>
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded ml-auto">Signal avancé</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Quand le prix et un indicateur ne racontent plus la même histoire — souvent un signe précoce de retournement, avant même que le prix ne change de direction.
        </p>
        {divergences.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Aucune divergence détectée récemment — le prix et les indicateurs sont alignés.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {divergences.map((d, i) => (
              <DivergenceBadge key={`div-${d.idx}-${d.indicator}-${i}`} d={d} />
            ))}
          </div>
        )}
      </div>

      {/* Fibonacci */}
      {fibonacci && (
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold">Niveaux de Fibonacci</span>
            <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded ml-auto">
              Mouvement {fibonacci.direction} · {currency}{fibonacci.swingLow.toFixed(2)} → {currency}{fibonacci.swingHigh.toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Calculés sur le dernier grand mouvement de la période affichée. Activez "Fibonacci" sur le graphique ci-dessus pour les visualiser. Les niveaux 50% et 61,8% (en surbrillance) sont les plus surveillés.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {fibonacci.levels.map((l) => (
              <FibLevelRow key={l.ratio} level={l} currency={currency} isKey={l.ratio === 0.5 || l.ratio === 0.618} />
            ))}
          </div>
        </div>
      )}

      {/* Journal de trading / simulateur */}
      {symbol && (
        <TradingJournal symbol={symbol} currency={currency} currentPrice={currentPrice} suggestedSignal={analysis.overall} />
      )}

      <div className="bg-muted/50 rounded-xl px-4 py-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          ⚠️ <strong>Avertissement :</strong> Cette analyse est basée sur des indicateurs techniques historiques uniquement. Elle ne constitue pas un conseil financier.
          Les marchés sont imprévisibles — faites toujours vos propres recherches et ne risquez que ce que vous pouvez vous permettre de perdre.
        </p>
      </div>
    </div>
  );
}

