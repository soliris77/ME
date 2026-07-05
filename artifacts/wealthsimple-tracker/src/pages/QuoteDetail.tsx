import { useGetQuote, useGetQuoteHistory, useAddToWatchlist, getGetWatchlistQueryKey } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { formatPrice, formatChange, formatPercent, formatVolume, formatMarketCap, changeClass } from "@/lib/format";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, ArrowDownRight, Bookmark, TrendingUp, BarChart2 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import TechnicalAnalysis from "@/components/TechnicalAnalysis";

const RANGES = ["1d", "5d", "1mo", "3mo", "6mo", "1y"] as const;
type Range = typeof RANGES[number];

function StatBox({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-3">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-sm font-mono font-semibold text-foreground">{value ?? "—"}</div>
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
    <div className="bg-card border border-card-border rounded-lg px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-mono font-bold">
        {payload[0]?.value !== undefined ? `$${payload[0].value.toFixed(2)}` : "—"}
      </p>
    </div>
  );
};

export default function QuoteDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const [range, setRange] = useState<Range>("1mo");
  const [tab, setTab] = useState<"chart" | "analysis">("chart");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: quote, isLoading } = useGetQuote(symbol!, {
    query: { enabled: !!symbol, refetchInterval: 30_000 },
  });

  const { data: history = [], isLoading: histLoading } = useGetQuoteHistory(symbol!, range, {
    query: { enabled: !!symbol },
  });

  const add = useAddToWatchlist({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
        toast({ title: `${symbol} added to watchlist` });
      },
      onError: () => toast({ title: "Already in watchlist or error", variant: "destructive" }),
    },
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-6 bg-muted rounded w-32 mb-6 animate-pulse" />
        <div className="h-10 bg-muted rounded w-48 mb-2 animate-pulse" />
        <div className="h-6 bg-muted rounded w-32 mb-8 animate-pulse" />
        <div className="h-64 bg-card border border-card-border rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="p-6">
        <Link href="/">
          <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </Link>
        <p className="text-muted-foreground">Symbol not found: {symbol}</p>
      </div>
    );
  }

  const cls = changeClass(quote.changePercent);
  const isUp = quote.changePercent >= 0;
  const chartColor = isUp ? "hsl(168, 60%, 42%)" : "hsl(0, 72%, 51%)";

  const simpleChartData = history.map((p) => ({
    date: new Date(p.date).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
    close: p.close,
  }));

  const ohlcHistory = history.map((p) => ({
    date: p.date,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
  }));

  return (
    <div className="p-6 max-w-4xl">
      <Link href="/">
        <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold font-mono">{quote.symbol}</h1>
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded capitalize">
              {quote.type}
            </span>
            {quote.exchange && (
              <span className="text-xs text-muted-foreground">{quote.exchange}</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{quote.name}</p>
        </div>
        <button
          onClick={() => add.mutate({ data: { symbol: quote.symbol, name: quote.name } })}
          disabled={add.isPending}
          className="flex items-center gap-1.5 px-3 py-2 border border-border text-sm font-medium rounded-md hover:bg-muted transition-colors shrink-0"
        >
          <Bookmark className="w-4 h-4" />
          Watch
        </button>
      </div>

      {/* Price */}
      <div className="mb-6">
        <div className="text-4xl font-bold font-mono">
          {formatPrice(quote.price, quote.currency)}
        </div>
        <div className={`flex items-center gap-1.5 mt-1 text-base font-mono font-semibold ${cls}`}>
          {isUp ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
          {formatChange(quote.change, quote.currency)} ({formatPercent(quote.changePercent)}) today
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-5">
        <button
          onClick={() => setTab("chart")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "chart"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Price Chart
        </button>
        <button
          onClick={() => setTab("analysis")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "analysis"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          Technical Analysis
        </button>
      </div>

      {/* Range selector */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-muted-foreground">Range</span>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                range === r
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === "chart" && (
        <>
          <div className="bg-card border border-card-border rounded-xl p-4 mb-6">
            {histLoading ? (
              <div className="h-56 bg-muted rounded animate-pulse" />
            ) : simpleChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={simpleChartData}>
                  <defs>
                    <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColor} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
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
                    strokeWidth={2}
                    fill="url(#colorClose)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                No chart data available
              </div>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatBox label="Open" value={quote.open ? formatPrice(quote.open, quote.currency) : null} />
            <StatBox label="Prev. Close" value={quote.previousClose ? formatPrice(quote.previousClose, quote.currency) : null} />
            <StatBox label="Day High" value={quote.high ? formatPrice(quote.high, quote.currency) : null} />
            <StatBox label="Day Low" value={quote.low ? formatPrice(quote.low, quote.currency) : null} />
            <StatBox label="Volume" value={formatVolume(quote.volume)} />
            <StatBox label="Market Cap" value={formatMarketCap(quote.marketCap)} />
            <StatBox label="Currency" value={quote.currency} />
            <StatBox label="Type" value={quote.type} />
          </div>
        </>
      )}

      {tab === "analysis" && (
        histLoading ? (
          <div className="space-y-4">
            {[220, 80, 100, 110].map((h, i) => (
              <div key={i} className="bg-card border border-card-border rounded-xl animate-pulse" style={{ height: h }} />
            ))}
          </div>
        ) : (
          <TechnicalAnalysis
            history={ohlcHistory}
            currentPrice={quote.price}
            currency={quote.currency}
          />
        )
      )}
    </div>
  );
}
