import { useGetMarketOverview } from "@workspace/api-client-react";
import { formatPrice, formatPercent, changeClass } from "@/lib/format";
import { Link } from "wouter";
import { ArrowUpRight, ArrowDownRight, RefreshCw, TrendingUp, Globe, Bitcoin, BarChart3 } from "lucide-react";
import type { Quote } from "@workspace/api-client-react";

const CANADA_NORTH_AM = ["^GSPC", "^IXIC", "^DJI", "^GSPTSX"];
const EUROPE_ASIA = ["^FTSE", "^GDAXI", "^FCHI", "^STOXX50E", "^N225", "^HSI"];
const CRYPTO = ["BTC-USD", "ETH-USD", "SOL-USD"];
const COMMODITIES = ["GC=F", "CL=F", "SI=F"];

const MARKET_NAMES: Record<string, string> = {
  "^GSPC": "S&P 500", "^IXIC": "NASDAQ", "^DJI": "Dow Jones", "^GSPTSX": "S&P/TSX (Canada)",
  "^FTSE": "FTSE 100 (UK)", "^GDAXI": "DAX (Allemagne)", "^FCHI": "CAC 40 (France)", "^STOXX50E": "Euro Stoxx 50",
  "^N225": "Nikkei (Japon)", "^HSI": "Hang Seng (HK)",
  "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum", "SOL-USD": "Solana",
  "GC=F": "Or", "CL=F": "Pétrole WTI", "SI=F": "Argent",
};

function QuoteRow({ q }: { q: Quote }) {
  const cls = changeClass(q.changePercent);
  return (
    <Link href={`/quote/${encodeURIComponent(q.symbol)}`}>
      <div className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors group">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">{q.symbol}</div>
          <div className="text-xs text-muted-foreground truncate max-w-44">{q.name}</div>
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

function MiniCard({ q, name }: { q: Quote; name: string }) {
  const cls = changeClass(q.changePercent);
  const isUp = q.changePercent >= 0;
  return (
    <Link href={`/quote/${encodeURIComponent(q.symbol)}`}>
      <div className="bg-card border border-card-border rounded-lg p-3 cursor-pointer hover:border-primary/40 transition-colors">
        <div className="text-xs text-muted-foreground font-medium mb-0.5 truncate">{name}</div>
        <div className="text-base font-mono font-bold text-foreground leading-tight">{formatPrice(q.price, q.currency)}</div>
        <div className={`flex items-center gap-0.5 mt-0.5 text-xs font-mono font-semibold ${cls}`}>
          {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {formatPercent(q.changePercent)}
        </div>
      </div>
    </Link>
  );
}

function MarketSection({
  title, icon: Icon, symbols, allQuotes, loading,
}: {
  title: string;
  icon: typeof Globe;
  symbols: string[];
  allQuotes: Quote[];
  loading: boolean;
}) {
  const filtered = allQuotes.filter((q) => symbols.includes(q.symbol));
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-card-border rounded-lg p-3 animate-pulse">
              <div className="h-2.5 bg-muted rounded w-20 mb-1.5" />
              <div className="h-5 bg-muted rounded w-24 mb-1" />
              <div className="h-3 bg-muted rounded w-12" />
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {filtered.map((q) => (
            <MiniCard key={q.symbol} q={q} name={MARKET_NAMES[q.symbol] ?? q.name} />
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground py-2">Données indisponibles</div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, refetch, isFetching } = useGetMarketOverview({
    query: { refetchInterval: 30_000 },
  });

  const allIndices: Quote[] = data?.indices ?? [];

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Aperçu des marchés</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary live-dot inline-block" />
            <span className="text-xs text-muted-foreground">En direct — actualisation toutes les 30s</span>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded hover:bg-muted"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      <div className="space-y-5 mb-8">
        <MarketSection title="Amérique du Nord" icon={Globe} symbols={CANADA_NORTH_AM} allQuotes={allIndices} loading={isLoading} />
        <MarketSection title="Europe & Asie" icon={Globe} symbols={EUROPE_ASIA} allQuotes={allIndices} loading={isLoading} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <MarketSection title="Cryptomonnaies" icon={Bitcoin} symbols={CRYPTO} allQuotes={allIndices} loading={isLoading} />
          <MarketSection title="Matières premières" icon={BarChart3} symbols={COMMODITIES} allQuotes={allIndices} loading={isLoading} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-card-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Populaires sur Wealthsimple</span>
          </div>
          <div className="divide-y divide-border">
            {isLoading
              ? [...Array(6)].map((_, i) => (
                  <div key={i} className="px-4 py-3 flex justify-between items-center animate-pulse">
                    <div><div className="h-4 bg-muted rounded w-16 mb-1" /><div className="h-3 bg-muted rounded w-28" /></div>
                    <div className="text-right"><div className="h-4 bg-muted rounded w-20 mb-1" /><div className="h-3 bg-muted rounded w-12 ml-auto" /></div>
                  </div>
                ))
              : data?.wealthsimplePopular.map((q) => <QuoteRow key={q.symbol} q={q} />)}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card border border-card-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground">🚀 Meilleures hausses</span>
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
                    <Link key={q.symbol} href={`/quote/${encodeURIComponent(q.symbol)}`}>
                      <div className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors">
                        <span className="text-sm font-semibold">{q.symbol}</span>
                        <span className="text-sm font-mono font-semibold gain">{formatPercent(q.changePercent)}</span>
                      </div>
                    </Link>
                  ))}
              {!isLoading && data?.topGainers.length === 0 && (
                <div className="px-4 py-3 text-sm text-muted-foreground">Aucune hausse</div>
              )}
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground">📉 Pires baisses</span>
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
                    <Link key={q.symbol} href={`/quote/${encodeURIComponent(q.symbol)}`}>
                      <div className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors">
                        <span className="text-sm font-semibold">{q.symbol}</span>
                        <span className="text-sm font-mono font-semibold loss">{formatPercent(q.changePercent)}</span>
                      </div>
                    </Link>
                  ))}
              {!isLoading && data?.topLosers.length === 0 && (
                <div className="px-4 py-3 text-sm text-muted-foreground">Aucune baisse</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
