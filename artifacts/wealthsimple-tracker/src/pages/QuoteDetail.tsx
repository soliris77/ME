import {
  useGetQuote,
  useGetQuoteHistory,
  useAddToWatchlist,
  getGetWatchlistQueryKey,
  useGetMarketNews,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import {
  formatPrice, formatChange, formatPercent, formatVolume,
  formatMarketCap, changeClass, isUp,
} from "@/lib/format";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowUpRight, ArrowDownRight, Bookmark,
  TrendingUp, TrendingDown, BarChart2, Gauge, StickyNote, Newspaper, ExternalLink,
} from "lucide-react";
import TradeModal from "@/components/TradeModal";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Brush, ReferenceArea, Customized,
} from "recharts";
import TechnicalAnalysis from "@/components/TechnicalAnalysis";
import { isIntradayHistory, formatCandleDate } from "@/lib/indicators";
import { detectCandlePatterns } from "@/lib/patternDetect";
import type { CandlePattern } from "@/lib/patternDetect";
import { useChartNotes, useAddChartNote, useDeleteChartNote } from "@/lib/useChartNotes";
import type { ChartNoteItem } from "@/lib/useChartNotes";
import NoteModal from "@/components/NoteModal";

// ─── Constants ────────────────────────────────────────────────────────────────

const RANGES = [
  { value: "1d",  label: "1j" },
  { value: "5d",  label: "5j" },
  { value: "1mo", label: "1m" },
  { value: "3mo", label: "3m" },
  { value: "6mo", label: "6m" },
  { value: "1y",  label: "1a" },
] as const;
type Range = typeof RANGES[number]["value"];

const TYPE_LABEL: Record<string, string> = {
  stock: "Action", etf: "FNB / ETF", crypto: "Crypto", index: "Indice",
};

const STRENGTH_SCORE: Record<string, number> = { fort: 3, moyen: 2, faible: 1 };

const PATTERN_SLUG: Record<string, string | null> = {
  "Doji":                 "doji",
  "Hammer":               "marteau-hammer",
  "Shooting Star":        "etoile-filante-shooting-star",
  "Bullish Engulfing":    "engulfing-haussier",
  "Bearish Engulfing":    "engulfing-baissier",
  "Morning Star":         "etoile-du-matin-morning-star",
  "Evening Star":         "etoile-du-soir-evening-star",
  "Three White Soldiers": "trois-soldats-blancs",
};

const SIGNAL_COLOR: Record<string, string> = {
  haussier: "hsl(142 68% 48%)",
  baissier: "hsl(0 72% 55%)",
  neutre:   "hsl(42 50% 52%)",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div
      className="bg-card border border-card-border rounded-xl p-4 transition-all duration-200 hover:border-primary/30 hover:-translate-y-0.5"
      style={{ borderTop: "2px solid hsl(var(--primary) / 0.18)" }}
    >
      <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground mb-1.5">
        {label}
      </div>
      <div className="text-[14px] font-mono font-bold text-foreground tabular-nums">
        {value ?? "—"}
      </div>
    </div>
  );
}

const CustomTooltip = ({
  active, payload, label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-card-border rounded-xl px-4 py-3 shadow-xl"
         style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px hsl(var(--primary)/0.1)" }}>
      <p className="text-[10px] tracking-wider text-muted-foreground mb-1 uppercase">{label}</p>
      <p className="text-[15px] font-mono font-bold text-foreground">
        {payload[0]?.value !== undefined ? `$${payload[0].value.toFixed(2)}` : "—"}
      </p>
    </div>
  );
};

function SentimentGauge({ changePercent, high, low, price }: {
  changePercent: number | null;
  high: number | null;
  low: number | null;
  price: number | null;
}) {
  const score = useMemo(() => {
    let s = 50;
    if (changePercent !== null) s += Math.max(-1, Math.min(1, changePercent / 3)) * 30;
    if (high && low && price && high > low) s += (((price - low) / (high - low)) * 100 - 50) * 0.3;
    return Math.max(0, Math.min(100, Math.round(s)));
  }, [changePercent, high, low, price]);

  const lbl =
    score >= 72 ? { text: "Très haussier", color: "hsl(142 68% 48%)" } :
    score >= 58 ? { text: "Haussier",      color: "hsl(142 55% 42%)" } :
    score >= 42 ? { text: "Neutre",        color: "hsl(42 50% 52%)"  } :
    score >= 28 ? { text: "Baissier",      color: "hsl(18 72% 52%)"  } :
                  { text: "Très baissier", color: "hsl(0 72% 55%)"   };

  const r = 54, cx = 80, cy = 72, startAngle = 210, endAngle = 330;
  const totalArc = (endAngle + 360 - startAngle) % 360;
  const filledEnd = (startAngle + (totalArc * score) / 100) % 360;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const arc = (from: number, to: number, radius: number) => {
    const a1 = toRad(from), a2 = toRad(to);
    const large = (to - from + 360) % 360 > 180 ? 1 : 0;
    return `M ${cx + radius * Math.cos(a1)} ${cy + radius * Math.sin(a1)} A ${radius} ${radius} 0 ${large} 1 ${cx + radius * Math.cos(a2)} ${cy + radius * Math.sin(a2)}`;
  };

  return (
    <div className="bg-card border border-card-border rounded-xl p-5"
         style={{ borderTop: "2px solid hsl(var(--primary) / 0.18)" }}>
      <div className="flex items-center gap-2 mb-4">
        <Gauge className="w-3.5 h-3.5 text-primary/70" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">
          Sentiment du marché
        </span>
      </div>
      <div className="flex items-center gap-6">
        <svg width="160" height="100" viewBox="0 0 160 100">
          <path d={arc(startAngle, (startAngle + totalArc) % 360, r)}
                fill="none" stroke="hsl(var(--muted))" strokeWidth="10" strokeLinecap="round" />
          {score > 2 && (
            <path d={arc(startAngle, filledEnd, r)}
                  fill="none" stroke={lbl.color} strokeWidth="10" strokeLinecap="round"
                  style={{ filter: `drop-shadow(0 0 6px ${lbl.color}80)` }} />
          )}
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize="22" fontWeight="700"
                fontFamily="JetBrains Mono, monospace" fill="hsl(var(--foreground))">{score}</text>
          <text x={cx} y={cy + 13} textAnchor="middle" fontSize="9"
                fill="hsl(var(--muted-foreground))" letterSpacing="2">/ 100</text>
        </svg>
        <div>
          <div className="text-[18px] font-semibold mb-1" style={{ color: lbl.color }}>{lbl.text}</div>
          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-44">
            Basé sur la position du prix dans la fourchette du jour et le momentum de variation.
          </p>
          <div className="flex items-center gap-4 mt-3">
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Ours</div>
              <div className="text-[12px] font-mono font-semibold loss">{100 - score}</div>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Taureau</div>
              <div className="text-[12px] font-mono font-semibold gain">{score}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Chart annotation overlay (TIER 2) ───────────────────────────────────────

interface GapAnnotation {
  x1: string; x2: string; lo: number; hi: number; isBullish: boolean; pct: number;
}
type XScale = ((v: string) => number) & { bandwidth?: () => number };

function ChartAnnotations({
  xAxisMap, offset,
  gaps, patterns, chartData,
  onSelectGap, onSelectPattern,
}: {
  // injected by Customized:
  xAxisMap?: Record<string, { scale: XScale }>;
  offset?: { top?: number };
  // passed as props:
  gaps: GapAnnotation[];
  patterns: CandlePattern[];
  chartData: { date: string; close: number }[];
  onSelectGap: (g: GapAnnotation) => void;
  onSelectPattern: (p: CandlePattern) => void;
}) {
  const xs = xAxisMap?.[0]?.scale;
  if (!xs) return null;
  const bw = (xs.bandwidth?.() ?? 0) / 2;
  const top = offset?.top ?? 0;

  return (
    <g>
      {patterns.map((p) => {
        const date = chartData[p.idx]?.date;
        if (!date) return null;
        const px = xs(date);
        if (px == null || isNaN(px)) return null;
        const cxx = px + bw;
        const isBull = p.signal === "haussier", isBear = p.signal === "baissier";
        const color = SIGNAL_COLOR[p.signal] ?? "hsl(42 50% 52%)";
        const cy = top + (isBull ? 24 : 10);
        return (
          <g key={`pm-${p.idx}`} style={{ cursor: "pointer" }} onClick={() => onSelectPattern(p)}>
            <circle cx={cxx} cy={cy} r={10} fill={color} fillOpacity={0.15} />
            <circle cx={cxx} cy={cy} r={7}  fill={color} fillOpacity={0.9} />
            <text x={cxx} y={cy + 4} textAnchor="middle" fontSize={8} fill="white" fontWeight="bold">
              {isBull ? "▲" : isBear ? "▼" : "◆"}
            </text>
          </g>
        );
      })}
      {gaps.map((g, i) => {
        const px = xs(g.x2);
        if (px == null || isNaN(px)) return null;
        const cxx = px + bw;
        const color = g.isBullish ? "hsl(142 68% 48%)" : "hsl(0 72% 55%)";
        const cy = top + 40;
        return (
          <g key={`gm-${i}`} style={{ cursor: "pointer" }} onClick={() => onSelectGap(g)}>
            <rect x={cxx - 11} y={cy - 8} width={22} height={14} rx={3} fill={color} fillOpacity={0.9} />
            <text x={cxx} y={cy + 3} textAnchor="middle" fontSize={7} fill="white" fontWeight="bold">GAP</text>
          </g>
        );
      })}
    </g>
  );
}

// ─── Note markers overlay (TIER 3) ───────────────────────────────────────────

function NoteMarkersOverlay({
  xAxisMap, offset,
  markers, chartData,
  onOpen,
}: {
  xAxisMap?: Record<string, { scale: XScale }>;
  offset?: { top?: number };
  markers: { note: ChartNoteItem; idx: number; displayDate: string }[];
  chartData: { date: string; close: number }[];
  onOpen: (n: ChartNoteItem, displayDate: string) => void;
}) {
  const xs = xAxisMap?.[0]?.scale;
  if (!xs || markers.length === 0) return null;
  const bw = (xs.bandwidth?.() ?? 0) / 2;
  const top = (offset?.top ?? 0) - 4;
  return (
    <g>
      {markers.map(({ note, idx, displayDate }) => {
        const date = chartData[idx]?.date;
        if (!date) return null;
        const px = xs(date);
        if (px == null || isNaN(px)) return null;
        const cxx = px + bw;
        return (
          <g key={`note-${note.id}`} style={{ cursor: "pointer" }}
             onClick={(e) => { e.stopPropagation(); onOpen(note, displayDate); }}>
            <rect x={cxx - 9} y={top} width={18} height={15} rx={3}
                  fill="hsl(var(--primary))" fillOpacity={0.85} />
            <text x={cxx} y={top + 11} textAnchor="middle" fontSize={11} fill="white">✎</text>
          </g>
        );
      })}
    </g>
  );
}

// ─── Annotation types ─────────────────────────────────────────────────────────

type SelectedAnnotation =
  | { kind: "pattern"; pattern: CandlePattern }
  | { kind: "gap"; isBullish: boolean; pct: number; lo: number; hi: number };

type NoteModalState = {
  isoDate: string;
  displayDate: string;
  existingNote: ChartNoteItem | null;
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function QuoteDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const decodedSymbol = symbol ? decodeURIComponent(symbol) : "";

  // ── State (all unconditional) ──────────────────────────────────────────────
  const [range, setRange]                       = useState<Range>("3mo");
  const [tab, setTab]                           = useState<"chart" | "analysis">("chart");
  const [selectedAnnotation, setSelectedAnnotation] = useState<SelectedAnnotation | null>(null);
  const [noteModal, setNoteModal]               = useState<NoteModalState | null>(null);
  const [tradeModal, setTradeModal]             = useState<{ side: "BUY" | "SELL"; source: string } | null>(null);
  const [brushStart, setBrushStart]             = useState(0);
  const [brushEnd, setBrushEnd]                 = useState(0);
  const { toast }                               = useToast();
  const queryClient                             = useQueryClient();

  // ── Data hooks (all unconditional) ────────────────────────────────────────
  const { data: quote, isLoading } = useGetQuote(decodedSymbol, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: !!decodedSymbol, refetchInterval: 5_000 } as any,
  });
  const { data: history = [], isLoading: histLoading } = useGetQuoteHistory(decodedSymbol, range, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: !!decodedSymbol, refetchInterval: 5_000 } as any,
  });
  const { data: symbolNews = [] } = useGetMarketNews(
    { tickers: decodedSymbol, limit: 5 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: !!decodedSymbol } as any }
  );
  const { data: chartNotes = [] } = useChartNotes(decodedSymbol);
  const addNote    = useAddChartNote(decodedSymbol);
  const deleteNote = useDeleteChartNote(decodedSymbol);
  const add = useAddToWatchlist({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
        toast({ title: `${decodedSymbol} ajouté à votre liste de suivi` });
      },
      onError: () => toast({ title: "Déjà suivi ou erreur", variant: "destructive" }),
    },
  });

  // ── Derived values (useMemo/useCallback — all unconditional) ──────────────
  const intraday = isIntradayHistory(history);
  const fineGrained = history.length > 1 &&
    Math.abs(new Date(history[1].date).getTime() - new Date(history[0].date).getTime()) <= 60_000;

  const simpleChartData = useMemo(
    () => history.map((p) => ({ date: formatCandleDate(p.date, intraday, fineGrained), close: p.close })),
    [history, intraday, fineGrained]
  );

  const ohlcHistory = useMemo(
    () => history.map((p) => ({
      date: p.date,
      open: p.open ?? null, high: p.high ?? null, low: p.low ?? null,
      close: p.close, volume: p.volume ?? null,
    })),
    [history]
  );

  // TIER 2 — gap annotations
  const gapAnnotations = useMemo((): GapAnnotation[] => {
    const out: GapAnnotation[] = [];
    for (let i = 0; i < ohlcHistory.length - 1; i++) {
      const curr = ohlcHistory[i], next = ohlcHistory[i + 1];
      if (next.open === null || !simpleChartData[i] || !simpleChartData[i + 1]) continue;
      const pct = Math.abs(next.open - curr.close) / curr.close;
      if (pct < 0.005) continue;
      out.push({
        x1: simpleChartData[i].date, x2: simpleChartData[i + 1].date,
        lo: Math.min(curr.close, next.open), hi: Math.max(curr.close, next.open),
        isBullish: next.open > curr.close, pct,
      });
    }
    return out;
  }, [ohlcHistory, simpleChartData]);

  // TIER 2 — pattern detection (one winner per candle)
  const detectedPatterns = useMemo((): CandlePattern[] => {
    if (ohlcHistory.length === 0) return [];
    const byIdx = new Map<number, CandlePattern>();
    for (const p of detectCandlePatterns(ohlcHistory)) {
      const ex = byIdx.get(p.idx);
      if (!ex || (STRENGTH_SCORE[p.strength] ?? 0) > (STRENGTH_SCORE[ex.strength] ?? 0)) byIdx.set(p.idx, p);
    }
    return [...byIdx.values()].filter((p) => !!simpleChartData[p.idx]);
  }, [ohlcHistory, simpleChartData]);

  // ── Trade handler ─────────────────────────────────────────────────────────
  const handleTrade = useCallback(
    (side: "BUY" | "SELL", source: string) => setTradeModal({ side, source }),
    []
  );

  // TIER 3 — iso date → chart index
  const isoToIdx = useMemo(() => {
    const m = new Map<string, number>();
    ohlcHistory.forEach((p, i) => m.set(p.date, i));
    return m;
  }, [ohlcHistory]);

  const noteMarkers = useMemo(
    () => chartNotes
      .map((n) => {
        const idx = isoToIdx.get(n.candleDate);
        if (idx == null || !simpleChartData[idx]) return null;
        return { note: n, idx, displayDate: simpleChartData[idx].date };
      })
      .filter(Boolean) as { note: ChartNoteItem; idx: number; displayDate: string }[],
    [chartNotes, isoToIdx, simpleChartData]
  );

  // TIER 3 — chart click → open note modal
  const handleChartClick = useCallback(
    (data: { activeLabel?: string }) => {
      if (!data?.activeLabel) return;
      const idx = simpleChartData.findIndex((d) => d.date === data.activeLabel);
      if (idx === -1) return;
      const isoDate = ohlcHistory[idx]?.date;
      if (!isoDate) return;
      const existingNote = chartNotes.find((n) => n.candleDate === isoDate) ?? null;
      setNoteModal({ isoDate, displayDate: data.activeLabel, existingNote });
      setSelectedAnnotation(null);
    },
    [simpleChartData, ohlcHistory, chartNotes]
  );

  // ── Brush zoom — sync window when data length changes ─────────────────────
  useEffect(() => {
    const n = simpleChartData.length;
    if (n === 0) return;
    setBrushStart(Math.max(0, n - Math.round(n * 0.4)));
    setBrushEnd(n - 1);
  }, [simpleChartData.length]);

  const handleChartWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const n = simpleChartData.length;
    if (n === 0) return;
    const currentWindow = brushEnd - brushStart + 1;
    const factor = e.deltaY < 0 ? 0.8 : 1.25; // molette vers le haut = zoom in
    const newWindow = Math.round(currentWindow * factor);
    const clamped = Math.max(10, Math.min(n, newWindow));
    const newStart = Math.max(0, brushEnd - clamped + 1);
    setBrushStart(newStart);
  }, [simpleChartData.length, brushStart, brushEnd]);

  // ── Early returns (after all hooks) ───────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-8 max-w-4xl animate-fadeUp">
        <div className="h-4 bg-muted rounded w-20 mb-8 animate-pulse" />
        <div className="h-8 bg-muted rounded w-36 mb-2 animate-pulse" />
        <div className="h-14 bg-muted rounded w-56 mb-3 animate-pulse" />
        <div className="h-5 bg-muted rounded w-40 mb-10 animate-pulse" />
        <div className="h-72 bg-card border border-card-border rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="p-8">
        <Link href="/dashboard">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Retour au tableau de bord
          </button>
        </Link>
        <p className="text-muted-foreground">Symbole introuvable : {decodedSymbol}</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const cls   = changeClass(quote.changePercent);
  const up    = isUp(quote.changePercent);
  const chartColor     = up === false ? "hsl(0, 72%, 55%)"        : "hsl(168, 65%, 46%)";
  const chartGlowColor = up === false ? "rgba(200,60,60,0.12)"    : "rgba(52,211,153,0.10)";

  return (
    <div className="p-8 max-w-4xl animate-fadeUp">
      {/* Back */}
      <Link href="/dashboard">
        <button className="flex items-center gap-1.5 text-[12px] tracking-wider text-muted-foreground/60 hover:text-primary mb-7 transition-colors group uppercase">
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Tableau de bord
        </button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="text-[28px] font-bold font-mono tracking-tight text-foreground leading-none">
              {quote.symbol}
            </h1>
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-widest"
                  style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))", border: "1px solid hsl(var(--primary) / 0.25)" }}>
              {TYPE_LABEL[quote.type] ?? quote.type}
            </span>
            {quote.exchange && (
              <span className="text-[11px] text-muted-foreground/50 tracking-wider uppercase">{quote.exchange}</span>
            )}
          </div>
          <p className="text-[14px] text-muted-foreground brand-serif italic">{quote.name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => handleTrade("BUY", "Manuel")}
            className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold rounded-xl transition-all"
            style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.28)" }}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Acheter
          </button>
          <button
            onClick={() => handleTrade("SELL", "Manuel")}
            className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold rounded-xl transition-all"
            style={{ background: "rgba(220,38,38,0.12)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.28)" }}
          >
            <TrendingDown className="w-3.5 h-3.5" /> Vendre
          </button>
          <button
            onClick={() => add.mutate({ data: { symbol: quote.symbol, name: quote.name } })}
            disabled={add.isPending}
            className="flex items-center gap-2 px-4 py-2.5 border border-border text-[13px] font-medium rounded-xl hover:bg-muted hover:border-primary/30 hover:text-primary transition-all"
          >
            <Bookmark className="w-4 h-4" /> Suivre
          </button>
        </div>
      </div>

      {/* Price */}
      <div className="mb-8">
        <div className="text-[52px] font-mono font-bold leading-none tracking-tight mb-2 tabular-nums"
             style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatPrice(quote.price, quote.currency)}
        </div>
        <div className={`flex items-center gap-1.5 text-[16px] font-mono font-semibold ${cls}`}>
          {up === true  && <ArrowUpRight   className="w-5 h-5" />}
          {up === false && <ArrowDownRight className="w-5 h-5" />}
          <span>{formatChange(quote.change ?? null, quote.currency)}</span>
          <span className="opacity-70">({formatPercent(quote.changePercent ?? null)})</span>
          <span className="text-muted-foreground/50 font-normal text-[13px] ml-1">aujourd'hui</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-6" style={{ borderColor: "hsl(var(--border) / 0.6)" }}>
        {[
          { id: "chart",    label: "Graphique prix",    icon: TrendingUp },
          { id: "analysis", label: "Analyse technique", icon: BarChart2  },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id as "chart" | "analysis")}
            className={`flex items-center gap-2 px-5 py-3 text-[13px] font-medium border-b-2 -mb-px transition-all ${
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Range */}
      <div className="flex items-center justify-between mb-5">
        <span className="text-[11px] tracking-widest uppercase text-muted-foreground/50">Période</span>
        <div className="flex gap-1 bg-muted/40 p-0.5 rounded-lg">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${
                range === r.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "chart" && (
        <>
          {/* ── Chart (TIER 1 + 2 + 3) ──────────────────────────────────── */}
          <div className="bg-card border border-card-border rounded-2xl p-5 mb-2"
               style={{ boxShadow: `0 0 40px ${chartGlowColor}` }}>
            {histLoading ? (
              <div className="h-56 bg-muted/50 rounded-xl animate-pulse" />
            ) : simpleChartData.length > 0 ? (
              <>
                <div onWheel={handleChartWheel} style={{ touchAction: "none" }}>
              <ResponsiveContainer width="100%" height={300}>
                  <AreaChart
                    data={simpleChartData}
                    margin={{ top: 14, right: 4, bottom: 0, left: 0 }}
                    onClick={handleChartClick}
                    style={{ cursor: "crosshair" }}
                  >
                    <defs>
                      <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={chartColor} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border) / 0.4)" vertical={false} />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} interval="preserveStartEnd"
                           tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "JetBrains Mono, monospace" }} />
                    <YAxis axisLine={false} tickLine={false} domain={["auto", "auto"]}
                           tickFormatter={(v) => `$${v.toFixed(0)}`} width={58}
                           tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "JetBrains Mono, monospace" }} />
                    <Tooltip content={<CustomTooltip />} />

                    {/* TIER 2 — gap fill bands */}
                    {gapAnnotations.map((g, i) => (
                      <ReferenceArea
                        key={`gap-${i}`}
                        x1={g.x1} x2={g.x2} y1={g.lo} y2={g.hi}
                        fill={g.isBullish ? "rgba(52,211,153,0.13)" : "rgba(239,68,68,0.13)"}
                        stroke={g.isBullish ? "rgba(52,211,153,0.35)" : "rgba(239,68,68,0.35)"}
                        strokeDasharray="4 2" ifOverflow="extendDomain"
                      />
                    ))}

                    {/* TIER 2 — pattern + gap badge markers */}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Customized component={<ChartAnnotations
                      gaps={gapAnnotations}
                      patterns={detectedPatterns}
                      chartData={simpleChartData}
                      onSelectGap={(g) => setSelectedAnnotation({ kind: "gap", ...g })}
                      onSelectPattern={(p) => setSelectedAnnotation({ kind: "pattern", pattern: p })}
                    /> as any} />

                    {/* TIER 3 — note markers */}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Customized component={<NoteMarkersOverlay
                      markers={noteMarkers}
                      chartData={simpleChartData}
                      onOpen={(n, d) => setNoteModal({ isoDate: n.candleDate, displayDate: d, existingNote: n })}
                    /> as any} />

                    <Area type="monotone" dataKey="close"
                          stroke={chartColor} strokeWidth={2.5}
                          fill="url(#colorClose)" dot={false}
                          activeDot={{ r: 5, strokeWidth: 0, fill: chartColor }} />

                    {/* TIER 1 — brush for zoom/pan + molette */}
                    <Brush dataKey="date" height={38}
                           stroke="hsl(var(--border) / 0.6)" fill="hsl(var(--card))"
                           travellerWidth={10} tickFormatter={() => ""}
                           startIndex={brushStart} endIndex={brushEnd}
                           onChange={(r) => {
                             if (r && r.startIndex != null && r.endIndex != null) {
                               setBrushStart(r.startIndex);
                               setBrushEnd(r.endIndex);
                             }
                           }}>
                      <AreaChart>
                        <Area type="monotone" dataKey="close"
                              stroke={chartColor} strokeWidth={1}
                              fill={chartColor} fillOpacity={0.15} dot={false} />
                      </AreaChart>
                    </Brush>
                  </AreaChart>
                </ResponsiveContainer>
                </div>
                <p className="text-center text-[10px] text-muted-foreground/40 mt-1 tracking-wider">
                  Cliquez pour annoter · Glissez les ancrages du bas pour naviguer · Molette pour zoomer
                </p>
              </>
            ) : (
              <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                Aucune donnée disponible
              </div>
            )}
          </div>

          {/* TIER 2 — annotation info card */}
          {selectedAnnotation && (
            <div className="mb-4 rounded-xl border p-4 animate-fadeUp"
                 style={{
                   background: "hsl(var(--card))",
                   borderColor: selectedAnnotation.kind === "gap"
                     ? (selectedAnnotation.isBullish ? "rgba(52,211,153,0.4)" : "rgba(239,68,68,0.4)")
                     : (SIGNAL_COLOR[selectedAnnotation.pattern.signal] ?? "hsl(var(--border))") + "55",
                 }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  {selectedAnnotation.kind === "gap" && (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
                              style={{
                                background: selectedAnnotation.isBullish ? "rgba(52,211,153,0.15)" : "rgba(239,68,68,0.15)",
                                color: selectedAnnotation.isBullish ? "hsl(142 68% 48%)" : "hsl(0 72% 55%)",
                              }}>
                          {selectedAnnotation.isBullish ? "Gap haussier" : "Gap baissier"}
                        </span>
                        <span className="text-[12px] font-mono font-semibold text-foreground">
                          {(selectedAnnotation.pct * 100).toFixed(2)}%
                        </span>
                      </div>
                      <p className="text-[12px] text-muted-foreground leading-relaxed">
                        Écart de <strong className="text-foreground">${selectedAnnotation.lo.toFixed(2)}</strong>
                        {" → "}<strong className="text-foreground">${selectedAnnotation.hi.toFixed(2)}</strong> entre la clôture et l'ouverture suivante.
                      </p>
                      <Link href="/apprendre/glossaire/gap-de-prix">
                        <button className="mt-2 text-[11px] text-primary hover:underline">
                          En savoir plus → Glossaire : Gap de prix
                        </button>
                      </Link>
                    </>
                  )}
                  {selectedAnnotation.kind === "pattern" && (() => {
                    const p = selectedAnnotation.pattern;
                    const slug = PATTERN_SLUG[p.nameEn];
                    const color = SIGNAL_COLOR[p.signal] ?? "hsl(42 50% 52%)";
                    return (
                      <>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
                                style={{ background: color + "22", color }}>{p.signal}</span>
                          <span className="text-[13px] font-semibold text-foreground">{p.name}</span>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                            {p.strength} · {p.candles} bougie{p.candles > 1 ? "s" : ""}
                          </span>
                        </div>
                        <p className="text-[12px] text-muted-foreground leading-relaxed mb-1">{p.description}</p>
                        <p className="text-[11px] text-muted-foreground/70 leading-relaxed italic">{p.howToUse}</p>
                        {slug && (
                          <Link href={`/apprendre/chandeliers/${slug}`}>
                            <button className="mt-2 text-[11px] text-primary hover:underline">
                              En savoir plus → {p.name}
                            </button>
                          </Link>
                        )}
                      </>
                    );
                  })()}
                </div>
                <button onClick={() => setSelectedAnnotation(null)}
                        className="text-muted-foreground hover:text-foreground text-[18px] leading-none mt-0.5 shrink-0">
                  ×
                </button>
              </div>
            </div>
          )}

          {/* TIER 3 — notes strip */}
          {chartNotes.length > 0 && (
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <StickyNote className="w-3.5 h-3.5 text-primary/60" />
              <span className="text-[11px] text-muted-foreground/60">
                {chartNotes.length} note{chartNotes.length > 1 ? "s" : ""} sur ce titre —
              </span>
              {chartNotes.slice(0, 3).map((n) => (
                <button key={n.id}
                        onClick={() => setNoteModal({ isoDate: n.candleDate, displayDate: n.candleDate.slice(0, 10), existingNote: n })}
                        className="text-[11px] px-2 py-0.5 rounded-md border border-primary/20 text-primary/70 hover:bg-primary/10 transition-colors truncate max-w-[140px]">
                  {n.text}
                </button>
              ))}
            </div>
          )}

          {/* Sentiment gauge */}
          <div className="mb-6">
            <SentimentGauge
              changePercent={quote.changePercent ?? null}
              high={quote.high ?? null}
              low={quote.low ?? null}
              price={quote.price}
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard label="Ouverture"         value={quote.open          ? formatPrice(quote.open,          quote.currency) : null} />
            <StatCard label="Clôture préc."     value={quote.previousClose ? formatPrice(quote.previousClose, quote.currency) : null} />
            <StatCard label="Plus haut du jour" value={quote.high          ? formatPrice(quote.high,          quote.currency) : null} />
            <StatCard label="Plus bas du jour"  value={quote.low           ? formatPrice(quote.low,           quote.currency) : null} />
            <StatCard label="Volume"            value={formatVolume(quote.volume ?? null)} />
            <StatCard label="Capitalisation"    value={formatMarketCap(quote.marketCap ?? null)} />
            <StatCard label="Devise"            value={quote.currency} />
            <StatCard label="Type"              value={TYPE_LABEL[quote.type] ?? quote.type} />
          </div>

          {/* News */}
          {symbolNews.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <Newspaper className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[11px] tracking-widest uppercase text-muted-foreground/60">
                  Actualités — {quote.symbol}
                </span>
              </div>
              <div className="space-y-2">
                {symbolNews.map((n) => (
                  <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer"
                     className="block bg-card border border-card-border rounded-xl px-4 py-3 hover:border-primary/30 transition-colors group">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[13px] font-medium leading-snug group-hover:text-primary transition-colors flex items-start gap-1.5">
                        {n.title}
                        <ExternalLink className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-40" />
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">{n.source}</p>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "analysis" && (
        histLoading ? (
          <div className="space-y-4">
            {[240, 90, 110, 120].map((h, i) => (
              <div key={i} className="bg-card border border-card-border rounded-2xl animate-pulse" style={{ height: h }} />
            ))}
          </div>
        ) : (
          <TechnicalAnalysis
            history={ohlcHistory}
            currentPrice={quote.price}
            currency={quote.currency}
            symbol={quote.symbol}
            onTrade={handleTrade}
          />
        )
      )}

      {/* TIER 3 — Note modal */}
      {noteModal && (
        <NoteModal
          symbol={decodedSymbol}
          candleDate={noteModal.isoDate}
          displayDate={noteModal.displayDate}
          existingNote={noteModal.existingNote}
          onSave={async (text) => { await addNote.mutateAsync({ candleDate: noteModal.isoDate, text }); }}
          onDelete={async (id) => { await deleteNote.mutateAsync(id); }}
          onClose={() => setNoteModal(null)}
        />
      )}

      {/* Trade modal — 1-click order */}
      {tradeModal && (
        <TradeModal
          open={true}
          side={tradeModal.side}
          symbol={quote.symbol}
          currentPrice={quote.price}
          currency={quote.currency}
          source={tradeModal.source}
          onClose={() => setTradeModal(null)}
        />
      )}
    </div>
  );
}
