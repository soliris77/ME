import { useMemo } from "react";
import { useGetQuotes } from "@workspace/api-client-react";
import { Link } from "wouter";

// ─── Subset de symboles par secteur ───────────────────────────────────────────
// Limité à ~10 par secteur pour ne pas surcharger les appels API

const HEATMAP_SECTORS: { label: string; emoji: string; symbols: string[] }[] = [
  {
    label: "Tech US", emoji: "💻",
    symbols: ["AAPL","MSFT","NVDA","META","GOOG","AMZN","TSLA","AMD","NFLX","CRM"],
  },
  {
    label: "Finance", emoji: "🏦",
    symbols: ["JPM","BAC","GS","V","MA","BRK-B","WFC","BLK","AXP","SCHW"],
  },
  {
    label: "Consommation", emoji: "🛍️",
    symbols: ["WMT","COST","MCD","NKE","DIS","SBUX","PG","KO","HD","CMG"],
  },
  {
    label: "Santé", emoji: "💊",
    symbols: ["LLY","UNH","JNJ","PFE","MRK","ABBV","TMO","AMGN","GILD","VRTX"],
  },
  {
    label: "Énergie", emoji: "⚡",
    symbols: ["XOM","CVX","COP","BA","CAT","GE","HON","LMT","UPS","RTX"],
  },
  {
    label: "Canada", emoji: "🍁",
    symbols: ["XEQT.TO","SHOP.TO","RY.TO","TD.TO","ENB.TO","CNR.TO","SU.TO","BMO.TO","ATD.TO","CM.TO"],
  },
  {
    label: "Crypto", emoji: "₿",
    symbols: ["BTC-USD","ETH-USD","SOL-USD","XRP-USD","ADA-USD","DOGE-USD","AVAX-USD","LINK-USD"],
  },
  {
    label: "Matières", emoji: "🥇",
    symbols: ["GC=F","CL=F","SI=F","BZ=F","NG=F","HG=F"],
  },
];

// ─── Couleur selon la performance ─────────────────────────────────────────────

function heatColor(pct: number | null | undefined): { bg: string; fg: string } {
  if (pct == null) return { bg: "rgba(139,146,165,0.08)", fg: "hsl(var(--muted-foreground))" };
  if (pct >= 3)    return { bg: "rgba(22,163,74,0.70)",  fg: "#f0fdf4" };
  if (pct >= 1.5)  return { bg: "rgba(22,163,74,0.45)",  fg: "#dcfce7" };
  if (pct >= 0.5)  return { bg: "rgba(22,163,74,0.22)",  fg: "#86efac" };
  if (pct >  0)    return { bg: "rgba(22,163,74,0.10)",  fg: "#4ade80" };
  if (pct >= -0.5) return { bg: "rgba(239,68,68,0.10)",  fg: "#f87171" };
  if (pct >= -1.5) return { bg: "rgba(239,68,68,0.22)",  fg: "#fca5a5" };
  if (pct >= -3)   return { bg: "rgba(239,68,68,0.45)",  fg: "#fca5a5" };
  return { bg: "rgba(239,68,68,0.70)", fg: "#fee2e2" };
}

function shortLabel(sym: string) {
  return sym.replace(".TO","").replace("-USD","").replace("=F","").replace("=X","").slice(0, 5);
}

// ─── Composant principal ───────────────────────────────────────────────────────

export default function SectorHeatmap() {
  const allSymbols = useMemo(
    () => HEATMAP_SECTORS.flatMap((s) => s.symbols).join(","),
    []
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: quotes = [] } = useGetQuotes(
    { symbols: allSymbols },
    { query: { refetchInterval: 30_000, staleTime: 20_000 } as any }
  );

  const quoteMap = useMemo(
    () => Object.fromEntries(quotes.map((q) => [q.symbol, q])),
    [quotes]
  );

  return (
    <div className="mb-8">
      <div className="section-rule mb-4 mt-1">
        <span className="text-primary/60 uppercase">Heatmap de performance</span>
      </div>

      <div className="bg-card border border-card-border rounded-2xl p-4 space-y-2.5">
        {HEATMAP_SECTORS.map((sector) => {
          const sectorQuotes = sector.symbols.map((s) => quoteMap[s]).filter(Boolean);
          const validPcts = sectorQuotes.map((q) => q.changePercent).filter((p) => p != null) as number[];
          const avgPct = validPcts.length > 0
            ? validPcts.reduce((a, b) => a + b, 0) / validPcts.length
            : null;
          const sectorClr = heatColor(avgPct);

          return (
            <div key={sector.label} className="flex items-center gap-3 min-h-[36px]">
              {/* Sector label */}
              <div
                className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wide rounded-lg px-2.5 py-1.5 shrink-0 select-none"
                style={{ width: 106, background: sectorClr.bg, color: sectorClr.fg }}
              >
                <span>{sector.emoji}</span>
                <span className="truncate">{sector.label}</span>
              </div>

              {/* Symbol cells */}
              <div className="flex flex-wrap gap-1 flex-1">
                {sector.symbols.map((sym) => {
                  const q = quoteMap[sym];
                  const pct = q?.changePercent;
                  const { bg, fg } = heatColor(pct);
                  const label = shortLabel(sym);
                  const tooltipText = q
                    ? `${sym}: ${pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"} · $${q.price?.toFixed(2) ?? "—"}`
                    : sym;
                  return (
                    <Link key={sym} href={`/quote/${encodeURIComponent(sym)}`}>
                      <div
                        title={tooltipText}
                        className="flex flex-col items-center justify-center rounded-md cursor-pointer transition-transform hover:scale-110 hover:z-10 relative"
                        style={{
                          background: bg,
                          color: fg,
                          width: 42,
                          height: 36,
                          padding: "2px 4px",
                        }}
                      >
                        <span className="font-mono font-bold leading-none" style={{ fontSize: 9 }}>{label}</span>
                        <span className="font-mono leading-none mt-0.5 opacity-90" style={{ fontSize: 8 }}>
                          {pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "—"}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Sector avg */}
              {avgPct != null && (
                <span
                  className="text-[11px] font-mono font-bold shrink-0 tabular-nums"
                  style={{ color: sectorClr.fg, minWidth: 54, textAlign: "right" }}
                >
                  {avgPct >= 0 ? "+" : ""}{avgPct.toFixed(2)}%
                </span>
              )}
            </div>
          );
        })}

        {/* Légende */}
        <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-border/30">
          <span className="text-[10px] text-muted-foreground shrink-0">Légende :</span>
          {[
            { label: "< −3%", pct: -4 },
            { label: "−1.5%", pct: -2 },
            { label: "−0.5%", pct: -1 },
            { label: "Neutre", pct: null },
            { label: "+0.5%", pct: 0.5 },
            { label: "+1.5%", pct: 2 },
            { label: "> +3%", pct: 4 },
          ].map(({ label, pct }) => {
            const { bg, fg } = heatColor(pct);
            return (
              <div key={label} className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm" style={{ background: bg }} />
                <span className="text-[10px]" style={{ color: fg }}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
