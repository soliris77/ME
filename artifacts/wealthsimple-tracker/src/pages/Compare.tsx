import { useState, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useSearchSymbols } from "@workspace/api-client-react";
import { Scale, X, Search as SearchIcon } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import {
  ChartEmptyState,
  ChartErrorState,
  ChartLoadingState,
  ChartPeriodSelector,
  ChartTooltipRow,
  ChartTooltipShell,
  ChartViewport,
  formatChartDate,
  usePrefersReducedMotion,
} from "@/components/financialCharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const RANGES = [
  { value: "1mo", label: "1m" },
  { value: "3mo", label: "3m" },
  { value: "6mo", label: "6m" },
  { value: "1y", label: "1a" },
];

const PALETTE = ["#c9a040", "#4f9dff", "#e0577a", "#4fd8a8", "#a888e8", "#f0a860"];

const DEFAULT_SYMBOLS = ["XEQT.TO", "VEQT.TO"];

interface HistoryPoint {
  date: string;
  close: number;
}

type ComparisonTooltipPayload = {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
};

async function fetchHistory(symbol: string, range: string): Promise<HistoryPoint[]> {
  const res = await fetch(`${BASE}/api/quotes/${encodeURIComponent(symbol)}/history/${range}`);
  if (!res.ok) throw new Error(`Failed to fetch history for ${symbol}`);
  return res.json();
}

function SymbolPicker({ onAdd, excluded }: { onAdd: (symbol: string, name: string) => void; excluded: string[] }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);

  const { data: results = [] } = useSearchSymbols(
    { q: debounced },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: debounced.length >= 1 } as any }
  );

  return (
    <div className="relative">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            window.clearTimeout((window as unknown as { __t?: number }).__t);
            (window as unknown as { __t?: number }).__t = window.setTimeout(() => setDebounced(e.target.value.trim()), 250);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Ajouter un symbole à comparer…"
          className="w-64 pl-8 pr-3 py-2 text-sm bg-card border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {open && debounced && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-64 bg-card border border-card-border rounded-lg shadow-xl py-1 max-h-64 overflow-y-auto">
          {results
            .filter((r) => !excluded.includes(r.symbol))
            .slice(0, 8)
            .map((r) => (
              <button
                key={r.symbol}
                onClick={() => {
                  onAdd(r.symbol, r.name);
                  setQuery("");
                  setDebounced("");
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center justify-between gap-2"
              >
                <span className="font-mono font-semibold">{r.symbol}</span>
                <span className="text-muted-foreground truncate">{r.name}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function ComparisonTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ComparisonTooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <ChartTooltipShell label={label ? formatChartDate(label) : undefined}>
      {payload
        .filter((item) => typeof item.value === "number")
        .map((item) => (
          <ChartTooltipRow
            key={item.dataKey ?? item.name}
            label={item.name ?? item.dataKey ?? "Actif"}
            value={`${(item.value ?? 0) >= 0 ? "+" : ""}${(item.value ?? 0).toFixed(2)} %`}
            color={item.color}
            tone={(item.value ?? 0) > 0 ? "positive" : (item.value ?? 0) < 0 ? "negative" : "neutral"}
          />
        ))}
    </ChartTooltipShell>
  );
}

export default function Compare() {
  usePageMeta("Comparer des actifs — Soliris Market", "Superposez la performance normalisée de plusieurs titres sur une même période.");
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [range, setRange] = useState("3mo");
  const reducedMotion = usePrefersReducedMotion();

  const queries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ["compare-history", s, range],
      queryFn: () => fetchHistory(s, range),
    })),
  });

  const loading = queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.isError)?.error;

  const chartData = useMemo(() => {
    if (queries.some((q) => !q.data || q.data.length === 0)) return [];
    const series = symbols.map((symbol, index) => {
      const byDate = new Map(
        ((queries[index].data ?? []) as HistoryPoint[])
          .filter((point) => point.close > 0)
          .map((point) => [point.date.slice(0, 10), point.close]),
      );
      return { symbol, byDate };
    });
    const commonDates = [...series[0].byDate.keys()]
      .filter((date) => series.every(({ byDate }) => byDate.has(date)))
      .sort();
    const firstDate = commonDates[0];
    if (!firstDate) return [];
    const bases = new Map(series.map(({ symbol, byDate }) => [symbol, byDate.get(firstDate) ?? 0]));

    return commonDates.map((date) => {
      const row: Record<string, string | number> = { date };
      series.forEach(({ symbol, byDate }) => {
        const base = bases.get(symbol) ?? 0;
        const close = byDate.get(date);
        if (close != null && base > 0) {
          row[symbol] = Number((((close - base) / base) * 100).toFixed(2));
        }
      });
      return row;
    });
  }, [queries, symbols]);

  const addSymbol = (symbol: string) => {
    if (symbols.includes(symbol) || symbols.length >= 6) return;
    setSymbols((s) => [...s, symbol]);
  };
  const removeSymbol = (symbol: string) => setSymbols((s) => s.filter((x) => x !== symbol));

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto animate-fadeUp">
      <div className="mb-6">
        <div className="section-rule mb-4"><span>COMPARAISON</span></div>
        <h1 className="text-2xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
          <Scale className="w-5 h-5 text-primary" />
          Comparer des actifs
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Performance normalisée en pourcentage depuis le début de la période — utile pour comparer
          des titres à des prix très différents sur un même graphique.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <SymbolPicker onAdd={addSymbol} excluded={symbols} />
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {symbols.map((s, i) => (
          <span
            key={s}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold border"
            style={{ borderColor: PALETTE[i % PALETTE.length], color: PALETTE[i % PALETTE.length] }}
          >
            {s}
            <button onClick={() => removeSymbol(s)} className="hover:opacity-70">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {symbols.length >= 6 && (
          <span className="text-xs text-muted-foreground/60 self-center">Maximum de 6 actifs atteint</span>
        )}
      </div>

      <div className="bg-card border border-card-border rounded-2xl p-5">
        <ChartViewport
          title="Performance relative"
          description="Chaque série est normalisée à 0 % sur la première date commune disponible."
          controls={
            <ChartPeriodSelector
              options={RANGES}
              value={range}
              onChange={setRange}
              disabled={loading}
              label="Période"
            />
          }
          onReset={() => setRange("3mo")}
        >
          {loading ? (
            <ChartLoadingState label="Chargement des historiques…" />
          ) : error ? (
            <ChartErrorState
              label="Données temporairement indisponibles."
              onRetry={() => {
                queries.forEach((query) => void query.refetch());
              }}
            />
          ) : chartData.length === 0 ? (
            <ChartEmptyState label={symbols.length < 2 ? "Ajoutez au moins un symbole pour voir la comparaison." : "Données historiques communes indisponibles."} />
          ) : (
            <div className="soliris-compare-chart-height h-[340px]" data-cursor-zone="chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border) / 0.24)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={48} />
                  <Tooltip
                    content={<ComparisonTooltip />}
                    cursor={{ stroke: "hsl(var(--primary) / 0.58)", strokeWidth: 1, strokeDasharray: "3 3" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {symbols.map((s, i) => (
                    <Line key={s} type="monotone" dataKey={s} stroke={PALETTE[i % PALETTE.length]} strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} isAnimationActive={!reducedMotion} animationDuration={450} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartViewport>
      </div>
    </div>
  );
}
