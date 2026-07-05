import { useGetMarketOverview } from "@workspace/api-client-react";
import { formatPrice, formatPercent, changeClass } from "@/lib/format";
import { Link } from "wouter";
import { ArrowUpRight, ArrowDownRight, RefreshCw, TrendingUp } from "lucide-react";

function QuoteRow({ q }: { q: { symbol: string; name: string; price: number; change: number; changePercent: number; currency: string } }) {
  const cls = changeClass(q.changePercent);
  return (
    <Link href={`/quote/${q.symbol}`}>
      <div className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors group">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">{q.symbol}</div>
          <div className="text-xs text-muted-foreground truncate max-w-40">{q.name}</div>
        </div>
        <div className="text-right shrink-0 ml-4">
          <div className="text-sm font-mono font-semibold">{formatPrice(q.price, q.currency)}</div>
          <div className={`text-xs font-mono ${cls} flex items-center justify-end gap-0.5`}>
            {q.changePercent >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {formatPercent(q.changePercent)}
          </div>
        </div>
      </div>
    </Link>
  );
}

function IndexCard({ q }: { q: { symbol: string; name: string; price: number; change: number; changePercent: number; currency: string } }) {
  const cls = changeClass(q.changePercent);
  const isUp = q.changePercent >= 0;
  return (
    <Link href={`/quote/${q.symbol}`}>
      <div className="bg-card border border-card-border rounded-lg p-4 cursor-pointer hover:border-primary/40 transition-colors group">
        <div className="text-xs text-muted-foreground font-medium mb-1 truncate">{q.name}</div>
        <div className="text-xl font-mono font-bold text-foreground">{formatPrice(q.price, q.currency)}</div>
        <div className={`flex items-center gap-1 mt-1 text-sm font-mono font-semibold ${cls}`}>
          {isUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
          {formatPercent(q.changePercent)}
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { data, isLoading, refetch, isFetching } = useGetMarketOverview({
    query: { refetchInterval: 30_000 },
  });

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Market Overview</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary live-dot inline-block" />
            <span className="text-xs text-muted-foreground">Live — updates every 30s</span>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded hover:bg-muted"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-card-border rounded-lg p-4 animate-pulse">
              <div className="h-3 bg-muted rounded w-24 mb-2" />
              <div className="h-6 bg-muted rounded w-28 mb-2" />
              <div className="h-4 bg-muted rounded w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {data?.indices.map((q) => <IndexCard key={q.symbol} q={q} />)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-card-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Popular on Wealthsimple</span>
          </div>
          <div className="divide-y divide-border">
            {isLoading
              ? [...Array(6)].map((_, i) => (
                  <div key={i} className="px-4 py-3 flex justify-between items-center animate-pulse">
                    <div>
                      <div className="h-4 bg-muted rounded w-16 mb-1" />
                      <div className="h-3 bg-muted rounded w-28" />
                    </div>
                    <div className="text-right">
                      <div className="h-4 bg-muted rounded w-20 mb-1" />
                      <div className="h-3 bg-muted rounded w-12 ml-auto" />
                    </div>
                  </div>
                ))
              : data?.wealthsimplePopular.map((q) => <QuoteRow key={q.symbol} q={q} />)}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card border border-card-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground">Top Gainers</span>
            </div>
            <div className="divide-y divide-border">
              {isLoading
                ? [...Array(3)].map((_, i) => (
                    <div key={i} className="px-4 py-2.5 flex justify-between animate-pulse">
                      <div className="h-3 bg-muted rounded w-16" />
                      <div className="h-3 bg-muted rounded w-12" />
                    </div>
                  ))
                : data?.topGainers.slice(0, 5).map((q) => (
                    <Link key={q.symbol} href={`/quote/${q.symbol}`}>
                      <div className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors">
                        <span className="text-sm font-semibold">{q.symbol}</span>
                        <span className="text-sm font-mono font-semibold gain">{formatPercent(q.changePercent)}</span>
                      </div>
                    </Link>
                  ))}
              {!isLoading && data?.topGainers.length === 0 && (
                <div className="px-4 py-3 text-sm text-muted-foreground">No gainers</div>
              )}
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground">Top Losers</span>
            </div>
            <div className="divide-y divide-border">
              {isLoading
                ? [...Array(3)].map((_, i) => (
                    <div key={i} className="px-4 py-2.5 flex justify-between animate-pulse">
                      <div className="h-3 bg-muted rounded w-16" />
                      <div className="h-3 bg-muted rounded w-12" />
                    </div>
                  ))
                : data?.topLosers.slice(0, 5).map((q) => (
                    <Link key={q.symbol} href={`/quote/${q.symbol}`}>
                      <div className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors">
                        <span className="text-sm font-semibold">{q.symbol}</span>
                        <span className="text-sm font-mono font-semibold loss">{formatPercent(q.changePercent)}</span>
                      </div>
                    </Link>
                  ))}
              {!isLoading && data?.topLosers.length === 0 && (
                <div className="px-4 py-3 text-sm text-muted-foreground">No losers</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
