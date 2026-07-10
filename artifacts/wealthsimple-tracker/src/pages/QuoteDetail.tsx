import { useGetQuote, useGetQuoteHistory, useAddToWatchlist, getGetWatchlistQueryKey } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { formatPrice, formatChange, formatPercent, formatVolume, formatMarketCap, changeClass, isUp } from "@/lib/format";
import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, ArrowDownRight, Bookmark, TrendingUp, BarChart2, Gauge } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import TechnicalAnalysis from "@/components/TechnicalAnalysis";
import { isIntradayHistory, formatCandleDate } from "@/lib/indicators";

const RANGES: { value: string; label: string }[] = [
  { value: "1d", label: "1j" },
  { value: "5d", label: "5j" },
  { value: "1mo", label: "1m" },
  { value: "3mo", label: "3m" },
  { value: "6mo", label: "6m" },
  { value: "1y", label: "1a" },
];

const TYPE_LABEL: Record<string, string> = {
  stock: "Action",
  etf: "FNB / ETF",
  crypto: "Crypto",
  index: "Indice",
};

function StatCard({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div
      className="bg-card border border-card-border rounded-xl p-4 group transition-all duration-200 hover:border-primary/30 hover:-translate-y-0.5"
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

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) => {
  if (!active || !payload || payload.length === 0) return null;
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
    if (changePercent !== null) {
      const momentum = Math.max(-1, Math.min(1, changePercent / 3));
      s += momentum * 30;
    }
    if (high && low && price && high > low) {
      const rangePct = ((price - low) / (high - low)) * 100;
      s += (rangePct - 50) * 0.3;
    }
    return Math.max(0, Math.min(100, Math.round(s)));
  }, [changePercent, high, low, price]);

  const label =
    score >= 72 ? { text: "Très haussier", color: "hsl(142 68% 48%)" } :
    score >= 58 ? { text: "Haussier", color: "hsl(142 55% 42%)" } :
    score >= 42 ? { text: "Neutre", color: "hsl(42 50% 52%)" } :
    score >= 28 ? { text: "Baissier", color: "hsl(18 72% 52%)" } :
                  { text: "Très baissier", color: "hsl(0 72% 55%)" };

  const pct = score;
  const r = 54;
  const cx = 80;
  const cy = 72;
  const startAngle = 210;
  const endAngle = 330;
  const totalArc = (endAngle + 360 - startAngle) % 360;
  const filledArc = (totalArc * pct) / 100;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  function arcPath(from: number, to: number, radius: number) {
    const a1 = toRad(from);
    const a2 = toRad(to);
    const large = (to - from + 360) % 360 > 180 ? 1 : 0;
    const x1 = cx + radius * Math.cos(a1);
    const y1 = cy + radius * Math.sin(a1);
    const x2 = cx + radius * Math.cos(a2);
    const y2 = cy + radius * Math.sin(a2);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  }

  const filledEnd = (startAngle + filledArc) % 360;

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
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(0 72% 52%)" />
              <stop offset="50%" stopColor="hsl(42 70% 52%)" />
              <stop offset="100%" stopColor="hsl(142 68% 45%)" />
            </linearGradient>
          </defs>
          {/* Track */}
          <path
            d={arcPath(startAngle, (startAngle + totalArc) % 360, r)}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Filled arc */}
          {pct > 2 && (
            <path
              d={arcPath(startAngle, filledEnd, r)}
              fill="none"
              stroke={label.color}
              strokeWidth="10"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 6px ${label.color}80)` }}
            />
          )}
          {/* Center score */}
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize="22" fontWeight="700"
                fontFamily="JetBrains Mono, monospace" fill="hsl(var(--foreground))">
            {score}
          </text>
          <text x={cx} y={cy + 13} textAnchor="middle" fontSize="9"
                fontFamily="system-ui, sans-serif" fill="hsl(var(--muted-foreground))"
                letterSpacing="2">
            / 100
          </text>
        </svg>
        <div>
          <div className="text-[18px] font-semibold mb-1" style={{ color: label.color }}>
            {label.text}
          </div>
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

export default function QuoteDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const decodedSymbol = symbol ? decodeURIComponent(symbol) : "";
  const [range, setRange] = useState<"1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y">("3mo");
  const [tab, setTab] = useState<"chart" | "analysis">("chart");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: quote, isLoading } = useGetQuote(decodedSymbol, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: !!decodedSymbol, refetchInterval: 5_000 } as any,
  });

  const { data: history = [], isLoading: histLoading } = useGetQuoteHistory(decodedSymbol, range, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: !!decodedSymbol, refetchInterval: 5_000 } as any,
  });

  const add = useAddToWatchlist({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
        toast({ title: `${decodedSymbol} ajouté à votre liste de suivi` });
      },
      onError: () => toast({ title: "Déjà suivi ou erreur", variant: "destructive" }),
    },
  });

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

  const cls = changeClass(quote.changePercent);
  const up = isUp(quote.changePercent);
  const chartColor = up === false ? "hsl(0, 72%, 55%)" : "hsl(168, 65%, 46%)";
  const chartGlowColor = up === false ? "rgba(200,60,60,0.12)" : "rgba(52,211,153,0.10)";

  const intraday = isIntradayHistory(history);
  const fineGrained =
    history.length > 1 &&
    Math.abs(new Date(history[1].date).getTime() - new Date(history[0].date).getTime()) <= 60_000;

  const simpleChartData = history.map((p) => ({
    date: formatCandleDate(p.date, intraday, fineGrained),
    close: p.close,
  }));

  const ohlcHistory = history.map((p) => ({
    date: p.date,
    open: p.open ?? null,
    high: p.high ?? null,
    low: p.low ?? null,
    close: p.close,
    volume: p.volume ?? null,
  }));

  return (
    <div className="p-8 max-w-4xl animate-fadeUp">
      {/* Back link */}
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
            <span
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-widest"
              style={{
                background: "hsl(var(--primary) / 0.12)",
                color: "hsl(var(--primary))",
                border: "1px solid hsl(var(--primary) / 0.25)",
              }}
            >
              {TYPE_LABEL[quote.type] ?? quote.type}
            </span>
            {quote.exchange && (
              <span className="text-[11px] text-muted-foreground/50 tracking-wider uppercase">
                {quote.exchange}
              </span>
            )}
          </div>
          <p className="text-[14px] text-muted-foreground brand-serif italic">
            {quote.name}
          </p>
        </div>
        <button
          onClick={() => add.mutate({ data: { symbol: quote.symbol, name: quote.name } })}
          disabled={add.isPending}
          className="flex items-center gap-2 px-4 py-2.5 border border-border text-[13px] font-medium rounded-xl hover:bg-muted hover:border-primary/30 hover:text-primary transition-all shrink-0"
        >
          <Bookmark className="w-4 h-4" />
          Suivre
        </button>
      </div>

      {/* Price block */}
      <div className="mb-8">
        <div
          className="text-[52px] font-mono font-bold leading-none tracking-tight mb-2 tabular-nums"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatPrice(quote.price, quote.currency)}
        </div>
        <div className={`flex items-center gap-1.5 text-[16px] font-mono font-semibold ${cls}`}>
          {up === true && <ArrowUpRight className="w-5 h-5" />}
          {up === false && <ArrowDownRight className="w-5 h-5" />}
          <span>{formatChange(quote.change, quote.currency)}</span>
          <span className="opacity-70">({formatPercent(quote.changePercent)})</span>
          <span className="text-muted-foreground/50 font-normal text-[13px] ml-1">aujourd'hui</span>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex border-b mb-6"
        style={{ borderColor: "hsl(var(--border) / 0.6)" }}
      >
        {[
          { id: "chart", label: "Graphique prix", icon: TrendingUp },
          { id: "analysis", label: "Analyse technique", icon: BarChart2 },
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
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Range selector */}
      <div className="flex items-center justify-between mb-5">
        <span className="text-[11px] tracking-widest uppercase text-muted-foreground/50">Période</span>
        <div className="flex gap-1 bg-muted/40 p-0.5 rounded-lg">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value as typeof range)}
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
          {/* Chart */}
          <div
            className="bg-card border border-card-border rounded-2xl p-5 mb-6"
            style={{ boxShadow: `0 0 40px ${chartGlowColor}` }}
          >
            {histLoading ? (
              <div className="h-56 bg-muted/50 rounded-xl animate-pulse" />
            ) : simpleChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={simpleChartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColor} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 6"
                    stroke="hsl(var(--border) / 0.4)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "JetBrains Mono, monospace" }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "JetBrains Mono, monospace" }}
                    axisLine={false}
                    tickLine={false}
                    domain={["auto", "auto"]}
                    tickFormatter={(v) => `$${v.toFixed(0)}`}
                    width={58}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="close"
                    stroke={chartColor}
                    strokeWidth={2.5}
                    fill="url(#colorClose)"
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 0, fill: chartColor }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                Aucune donnée disponible
              </div>
            )}
          </div>

          {/* Sentiment gauge */}
          <div className="mb-6">
            <SentimentGauge
              changePercent={quote.changePercent}
              high={quote.high}
              low={quote.low}
              price={quote.price}
            />
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard label="Ouverture" value={quote.open ? formatPrice(quote.open, quote.currency) : null} />
            <StatCard label="Clôture préc." value={quote.previousClose ? formatPrice(quote.previousClose, quote.currency) : null} />
            <StatCard label="Plus haut du jour" value={quote.high ? formatPrice(quote.high, quote.currency) : null} />
            <StatCard label="Plus bas du jour" value={quote.low ? formatPrice(quote.low, quote.currency) : null} />
            <StatCard label="Volume" value={formatVolume(quote.volume)} />
            <StatCard label="Capitalisation" value={formatMarketCap(quote.marketCap)} />
            <StatCard label="Devise" value={quote.currency} />
            <StatCard label="Type" value={TYPE_LABEL[quote.type] ?? quote.type} />
          </div>
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
          <TechnicalAnalysis history={ohlcHistory} currentPrice={quote.price} currency={quote.currency} symbol={quote.symbol} />
        )
      )}
    </div>
  );
}
