import { useState, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useSearchSymbols } from "@workspace/api-client-react";
import { Scale, X, Search as SearchIcon, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

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

export default function Compare() {
  usePageMeta("Comparer des actifs — Soliris Market", "Superposez la performance normalisée de plusieurs titres sur une même période.");
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [range, setRange] = useState("3mo");

  const queries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ["compare-history", s, range],
      queryFn: () => fetchHistory(s, range),
    })),
  });

  const loading = queries.some((q) => q.isLoading);

  const chartData = useMemo(() => {
    if (queries.some((q) => !q.data || q.data.length === 0)) return [];
    const bySymbol = symbols.map((s, i) => {
      const hist = queries[i].data as HistoryPoint[];
      const base = hist[0]?.close;
      return { s, hist, base };
    });
    // On aligne sur la série la plus courte pour éviter les trous.
    const minLen = Math.min(...bySymbol.map((b) => b.hist.length));
    const rows = [];
    for (let idx = 0; idx < minLen; idx++) {
      const row: Record<string, string | number> = { date: bySymbol[0].hist[idx].date.slice(0, 10) };
      bySymbol.forEach(({ s, hist, base }) => {
        if (base) row[s] = Number((((hist[idx].close - base) / base) * 100).toFixed(2));
      });
      rows.push(row);
    }
    return rows;
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
        <div className="flex gap-1 bg-muted/40 p-0.5 rounded-lg">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                range === r.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
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
        {loading ? (
          <div className="h-72 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
            Ajoutez au moins un symbole pour voir la comparaison.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border) / 0.4)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={48} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--card-border))", borderRadius: 12, fontSize: 12 }}
                formatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {symbols.map((s, i) => (
                <Line key={s} type="monotone" dataKey={s} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
