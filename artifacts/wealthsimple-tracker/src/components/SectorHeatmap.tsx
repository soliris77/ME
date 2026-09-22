import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useGetQuotes } from "@workspace/api-client-react";
import { Sparkline } from "@/components/Sparkline";
import { formatPercent, formatPrice, isUp } from "@/lib/format";

const SECTORS = [
  { label: "Technologie", symbol: "XLK" },
  { label: "Finance", symbol: "XLF" },
  { label: "Consommation discrétionnaire", symbol: "XLY" },
  { label: "Consommation essentielle", symbol: "XLP" },
  { label: "Santé", symbol: "XLV" },
  { label: "Énergie", symbol: "XLE" },
  { label: "Industrie", symbol: "XLI" },
  { label: "Matériaux", symbol: "XLB" },
  { label: "Services publics", symbol: "XLU" },
  { label: "Immobilier", symbol: "XLRE" },
  { label: "Communication", symbol: "XLC" },
] as const;

export default function SectorHeatmap() {
  const symbols = useMemo(() => SECTORS.map((sector) => sector.symbol).join(","), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: quotes = [], isLoading } = useGetQuotes(
    { symbols },
    { query: { refetchInterval: 30_000, staleTime: 20_000 } as any },
  );
  const quoteMap = useMemo(
    () => Object.fromEntries(quotes.map((quote) => [quote.symbol, quote])),
    [quotes],
  );

  return (
    <section className="mb-7" aria-labelledby="sector-performance-title">
      <div className="section-rule mb-3 mt-1">
        <span id="sector-performance-title" className="text-primary/60 uppercase">
          Performance des secteurs
        </span>
      </div>

      <div className="surface-glass overflow-hidden rounded-xl border border-border/40">
        <div className="border-b border-border/30 px-5 py-4">
          <p className="max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
            Tendances des principaux fonds sectoriels américains. Chaque graphique montre
            l’évolution récente du secteur, dans la même lecture que les actifs numériques.
          </p>
        </div>

        <div className="grid grid-cols-1 divide-y divide-border/25 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
          {SECTORS.map((sector, index) => {
            const quote = quoteMap[sector.symbol];
            const direction = isUp(quote?.changePercent);
            return (
              <Link
                key={sector.symbol}
                href={`/quote/${encodeURIComponent(sector.symbol)}`}
                className={[
                  "group min-w-0 px-5 py-4 transition-colors hover:bg-primary/[0.035]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50",
                  index % 3 !== 0 ? "lg:border-l lg:border-border/25" : "",
                  index % 2 !== 0 ? "sm:border-l sm:border-border/25 lg:border-l" : "",
                  index >= 2 ? "sm:border-t sm:border-border/25" : "",
                  index >= 3 ? "lg:border-t lg:border-border/25" : "",
                ].join(" ")}
                data-cursor-card
                aria-label={`${sector.label}, ${formatPercent(quote?.changePercent)}`}
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/85 transition-colors group-hover:text-primary">
                      {sector.label}
                    </h3>
                    <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
                      {sector.symbol}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[12px] font-medium text-foreground">
                      {quote ? formatPrice(quote.price, quote.currency) : "—"}
                    </div>
                    <div
                      className={`mt-1 flex items-center justify-end gap-0.5 font-mono text-[10px] ${
                        direction === null
                          ? "text-muted-foreground"
                          : direction
                            ? "text-primary"
                            : "text-destructive/80"
                      }`}
                    >
                      {direction === true && <ArrowUpRight className="h-3 w-3" />}
                      {direction === false && <ArrowDownRight className="h-3 w-3" />}
                      {quote ? formatPercent(quote.changePercent) : "—"}
                    </div>
                  </div>
                </div>

                <div className="flex h-12 items-center border-t border-border/20 pt-3">
                  {isLoading && !quote ? (
                    <div className="h-7 w-full animate-pulse rounded bg-muted/30" />
                  ) : (
                    <Sparkline symbol={sector.symbol} width={180} height={38} />
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}