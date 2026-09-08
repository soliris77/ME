import { useMemo } from "react";
import { useGetQuotes } from "@workspace/api-client-react";
import { Link } from "wouter";

// ─── Subset de symboles par secteur ───────────────────────────────────────────
const HEATMAP_SECTORS: { label: string; symbols: string[] }[] = [
  {
    label: "Tech US",
    symbols: ["AAPL", "MSFT", "NVDA", "META", "GOOG", "AMZN", "TSLA", "AMD", "NFLX", "CRM"],
  },
  {
    label: "Finance",
    symbols: ["JPM", "BAC", "GS", "V", "MA", "BRK-B", "WFC", "BLK", "AXP", "SCHW"],
  },
  {
    label: "Consommation",
    symbols: ["WMT", "COST", "MCD", "NKE", "DIS", "SBUX", "PG", "KO", "HD", "CMG"],
  },
  {
    label: "Santé",
    symbols: ["LLY", "UNH", "JNJ", "PFE", "MRK", "ABBV", "TMO", "AMGN", "GILD", "VRTX"],
  },
  {
    label: "Énergie",
    symbols: ["XOM", "CVX", "COP", "BA", "CAT", "GE", "HON", "LMT", "UPS", "RTX"],
  },
  {
    label: "Canada",
    symbols: ["XEQT.TO", "SHOP.TO", "RY.TO", "TD.TO", "ENB.TO", "CNR.TO", "SU.TO", "BMO.TO", "ATD.TO", "CM.TO"],
  },
  {
    label: "Crypto",
    symbols: ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "ADA-USD", "DOGE-USD", "AVAX-USD", "LINK-USD"],
  },
  {
    label: "Matières",
    symbols: ["GC=F", "CL=F", "SI=F", "BZ=F", "NG=F", "HG=F"],
  },
];

function shortLabel(sym: string) {
  return sym.replace(".TO", "").replace("-USD", "").replace("=F", "").replace("=X", "").slice(0, 5);
}

// ─── Composant principal ───────────────────────────────────────────────────────

export default function SectorHeatmap() {
  const allSymbols = useMemo(
    () => HEATMAP_SECTORS.flatMap((s) => s.symbols).join(","),
    []
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: quotes = [], isLoading } = useGetQuotes(
    { symbols: allSymbols },
    { query: { refetchInterval: 30_000, staleTime: 20_000 } as any }
  );

  const quoteMap = useMemo(
    () => Object.fromEntries(quotes.map((q) => [q.symbol, q])),
    [quotes]
  );

  return (
    <div className="mb-7">
      <div className="section-rule mb-3 mt-1">
        <span className="text-primary/60 uppercase">Performance par secteur</span>
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        {isLoading && quotes.length === 0 ? (
          <div className="p-6 text-center text-[11px] text-muted-foreground uppercase tracking-widest font-mono skeleton-shimmer">
            Chargement des données...
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {HEATMAP_SECTORS.map((sector) => {
              const sectorQuotes = sector.symbols.map((s) => quoteMap[s]).filter(Boolean);
              const validPcts = sectorQuotes.map((q) => q.changePercent).filter((p) => p != null) as number[];
              const avgPct = validPcts.length > 0
                ? validPcts.reduce((a, b) => a + b, 0) / validPcts.length
                : null;

              const isAvgPos = avgPct != null && avgPct >= 0;

              return (
                <div key={sector.label} className="flex flex-col md:flex-row md:items-center gap-3 px-5 py-3">
                  {/* Sector label & avg */}
                  <div className="flex md:flex-col items-center md:items-start justify-between md:justify-center shrink-0 md:w-32">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-foreground/80 truncate">
                      {sector.label}
                    </span>
                    <span className={`text-[10px] font-mono mt-0.5 ${avgPct != null ? (isAvgPos ? "text-primary/80" : "text-destructive/80") : "text-muted-foreground"}`}>
                      {avgPct != null ? `${isAvgPos ? "+" : ""}${avgPct.toFixed(2)}% avg` : "—"}
                    </span>
                  </div>

                  {/* Symbol micro-bars */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 flex-1">
                    {sector.symbols.map((sym) => {
                      const q = quoteMap[sym];
                      const pct = q?.changePercent;
                      const isPos = pct != null && pct >= 0;
                      const absPct = pct != null ? Math.abs(pct) : 0;
                      // Max scale limit at 5% for visual proportion
                      const fillPct = Math.min((absPct / 5) * 100, 100);
                      const label = shortLabel(sym);
                      const tooltipText = q
                        ? `${sym}: ${pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"} · $${q.price?.toFixed(2) ?? "—"}`
                        : sym;

                      return (
                        <Link key={sym} href={`/quote/${encodeURIComponent(sym)}`}>
                          <div
                            title={tooltipText}
                            className="group flex items-center gap-1.5 py-0.5 px-1.5 -ml-1.5 rounded hover:bg-muted/30 transition-colors focus-ring-premium cursor-pointer"
                          >
                            <span className="w-9 text-[10px] font-mono font-bold text-foreground/70 group-hover:text-primary transition-colors">
                              {label}
                            </span>

                            <div className="w-10 h-[3px] bg-muted/40 rounded-full overflow-hidden flex" aria-hidden>
                              <div className="w-1/2 h-full flex justify-end">
                                {!isPos && pct != null && (
                                  <div className="h-full bg-destructive/45 group-hover:bg-destructive/70 transition-colors" style={{ width: `${fillPct}%` }} />
                                )}
                              </div>
                              <div className="w-1/2 h-full flex justify-start">
                                {isPos && pct != null && (
                                  <div className="h-full bg-primary/45 group-hover:bg-primary/70 transition-colors" style={{ width: `${fillPct}%` }} />
                                )}
                              </div>
                            </div>

                            <span className={`w-9 text-[9px] font-mono text-right ${pct != null ? (isPos ? "text-primary/75 group-hover:text-primary" : "text-destructive/75 group-hover:text-destructive") : "text-muted-foreground"} transition-colors`}>
                              {pct != null ? `${isPos ? "+" : ""}${pct.toFixed(1)}` : "—"}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 px-5 py-3 bg-muted/5 border-t border-border/30">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 shrink-0">Légende proportionnelle</span>
          <div className="flex items-center gap-2 text-[9px] font-mono text-muted-foreground">
            <span>−5%</span>
            <div className="w-16 h-[3px] bg-muted/40 rounded-full overflow-hidden flex" aria-hidden>
              <div className="w-1/2 h-full bg-destructive/45" />
              <div className="w-1/2 h-full bg-primary/45" />
            </div>
            <span>+5%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
