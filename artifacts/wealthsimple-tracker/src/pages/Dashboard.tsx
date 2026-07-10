import { useGetMarketOverview } from "@workspace/api-client-react";
import { formatPrice, formatPercent, changeClass, isUp } from "@/lib/format";
import { Link } from "wouter";
import { ArrowUpRight, ArrowDownRight, RefreshCw, TrendingUp, Globe, Bitcoin, BarChart3, AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import LiveTicker from "@/components/LiveTicker";
import type { Quote } from "@workspace/api-client-react";

const CANADA_NORTH_AM = ["^GSPC", "^IXIC", "^DJI", "^RUT"];
const EUROPE_ASIA = ["^FTSE", "^GDAXI", "^FCHI", "^STOXX50E", "^N225", "^HSI"];
const CRYPTO = ["BTC-USD", "ETH-USD", "SOL-USD"];
const COMMODITIES = ["GC=F", "CL=F", "SI=F"];

const MARKET_NAMES: Record<string, string> = {
  "^GSPC": "S&P 500", "^IXIC": "NASDAQ", "^DJI": "Dow Jones", "^RUT": "Russell 2000",
  "^FTSE": "FTSE 100 (UK)", "^GDAXI": "DAX (Allemagne)", "^FCHI": "CAC 40 (France)", "^STOXX50E": "Euro Stoxx 50",
  "^N225": "Nikkei (Japon)", "^HSI": "Hang Seng (HK)",
  "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum", "SOL-USD": "Solana",
  "GC=F": "Or", "CL=F": "Pétrole WTI", "SI=F": "Argent",
};

const STOCK_CATS: { label: string; symbols: string[] }[] = [
  {
    label: "Tech US 🖥️",
    symbols: ["AAPL", "MSFT", "NVDA", "AMD", "META", "GOOG", "AMZN", "TSLA", "INTC", "NFLX", "ORCL", "CRM", "ADBE", "PYPL", "UBER", "PLTR", "SNOW", "SQ", "COIN", "SHOP"],
  },
  {
    label: "Finance US 🏦",
    symbols: ["JPM", "BAC", "GS", "MS", "V", "MA", "BRK-B", "WFC", "BLK", "C"],
  },
  {
    label: "Consommation US 🛒",
    symbols: ["WMT", "COST", "MCD", "NKE", "DIS", "SBUX", "TGT", "PG", "KO", "PEP"],
  },
  {
    label: "Canada 🇨🇦",
    symbols: ["XEQT.TO", "VEQT.TO", "ZSP.TO", "VFV.TO", "XIU.TO", "SHOP.TO", "RY.TO", "TD.TO", "BNS.TO", "ENB.TO", "CNR.TO", "CP.TO", "SU.TO", "BCE.TO", "MFC.TO", "BAM.TO"],
  },
];

function useLastUpdated(trigger: unknown) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  return seconds;
}

function FlashQuote({ q }: { q: Quote }) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(q.price);

  useEffect(() => {
    if (prev.current !== q.price) {
      prev.current = q.price;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 800);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [q.price]);

  const cls = changeClass(q.changePercent);
  const up = isUp(q.changePercent);
  return (
    <Link href={`/quote/${encodeURIComponent(q.symbol)}`}>
      <div className={`bg-card border border-card-border rounded-lg p-3 cursor-pointer hover:border-primary/40 transition-all ${flash ? "ring-1 ring-primary/40 bg-primary/5" : ""}`}>
        <div className="text-xs text-muted-foreground font-medium mb-0.5 truncate">{MARKET_NAMES[q.symbol] ?? q.name}</div>
        <div className="text-base font-mono font-bold text-foreground leading-tight">{formatPrice(q.price, q.currency)}</div>
        <div className={`flex items-center gap-0.5 mt-0.5 text-xs font-mono font-semibold ${cls}`}>
          {up === true && <ArrowUpRight className="w-3 h-3" />}
          {up === false && <ArrowDownRight className="w-3 h-3" />}
          {formatPercent(q.changePercent)}
        </div>
      </div>
    </Link>
  );
}

function StockRow({ q }: { q: Quote }) {
  const cls = changeClass(q.changePercent);
  const up = isUp(q.changePercent);
  const [flash, setFlash] = useState(false);
  const prev = useRef(q.price);
  useEffect(() => {
    if (prev.current !== q.price) {
      prev.current = q.price;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [q.price]);
  return (
    <Link href={`/quote/${encodeURIComponent(q.symbol)}`}>
      <div className={`flex items-center justify-between px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors group rounded-lg ${flash ? "bg-primary/5" : ""}`}>
        <div className="min-w-0">
          <div className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{q.symbol}</div>
          <div className="text-xs text-muted-foreground truncate max-w-36">{q.name}</div>
        </div>
        <div className="text-right shrink-0 ml-2">
          <div className="text-sm font-mono font-semibold">{formatPrice(q.price, q.currency)}</div>
          <div className={`text-xs font-mono ${cls} flex items-center justify-end gap-0.5`}>
            {up === true && <ArrowUpRight className="w-3 h-3" />}
            {up === false && <ArrowDownRight className="w-3 h-3" />}
            {formatPercent(q.changePercent)}
          </div>
        </div>
      </div>
    </Link>
  );
}

function MarketSection({ title, icon: Icon, symbols, allQuotes, loading }: {
  title: string; icon: typeof Globe; symbols: string[]; allQuotes: Quote[]; loading: boolean;
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
          {filtered.map((q) => <FlashQuote key={q.symbol} q={q} />)}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground py-2">Données indisponibles</div>
      )}
    </div>
  );
}

function PopularStocksTabs({ allQuotes, loading }: { allQuotes: Quote[]; loading: boolean }) {
  const [activeTab, setActiveTab] = useState(0);
  const filtered = allQuotes.filter((q) => STOCK_CATS[activeTab].symbols.includes(q.symbol));

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <TrendingUp className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Actions populaires</span>
      </div>
      <div className="flex gap-0 border-b border-border overflow-x-auto">
        {STOCK_CATS.map((cat, i) => (
          <button
            key={cat.label}
            onClick={() => setActiveTab(i)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === i
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <div className="p-2">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse flex items-center justify-between px-3 py-2">
                <div className="space-y-1">
                  <div className="h-3 bg-muted rounded w-12" />
                  <div className="h-2.5 bg-muted rounded w-20" />
                </div>
                <div className="space-y-1 text-right">
                  <div className="h-3 bg-muted rounded w-14" />
                  <div className="h-2.5 bg-muted rounded w-10" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-0">
            {filtered.map((q) => <StockRow key={q.symbol} q={q} />)}
            {filtered.length === 0 && (
              <div className="col-span-4 py-4 text-center text-sm text-muted-foreground">Données en cours de chargement…</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useGetMarketOverview({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { refetchInterval: 10_000 } as any,
  });
  const secondsSince = useLastUpdated(dataUpdatedAt);
  const allIndices: Quote[] = data?.indices ?? [];
  const allPopular: Quote[] = data?.wealthsimplePopular ?? [];

  if (isError) {
    const errMsg = (error as { message?: string } | null)?.message ?? String(error);
    return (
      <div className="flex flex-col min-h-screen">
        <LiveTicker />
        <div className="p-6 max-w-4xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-foreground">Aperçu des marchés</h1>
          </div>
          <div className="bg-card border border-card-border rounded-xl p-8 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold mb-1">Impossible de charger les données de marché</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Le serveur n'a pas répondu ou une erreur réseau s'est produite. Vérifiez que le serveur API
                est démarré et réessayez.
              </p>
              {errMsg && (
                <p className="text-xs font-mono text-red-500/80 mt-2 bg-red-500/5 border border-red-500/10 rounded px-3 py-1.5 break-all">
                  {errMsg}
                </p>
              )}
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <LiveTicker />
      <div className="p-6 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Aperçu des marchés</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-dot inline-block" />
              <span className="text-xs text-muted-foreground">
                En direct — mis à jour il y a {secondsSince < 10 ? "moins de 10s" : `${secondsSince}s`} · auto 10s
              </span>
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

        {/* Indices mondiaux */}
        <div className="space-y-5 mb-6">
          <MarketSection title="Amérique du Nord" icon={Globe} symbols={CANADA_NORTH_AM} allQuotes={allIndices} loading={isLoading} />
          <MarketSection title="Europe & Asie" icon={Globe} symbols={EUROPE_ASIA} allQuotes={allIndices} loading={isLoading} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <MarketSection title="Cryptomonnaies" icon={Bitcoin} symbols={CRYPTO} allQuotes={allIndices} loading={isLoading} />
            <MarketSection title="Matières premières" icon={BarChart3} symbols={COMMODITIES} allQuotes={allIndices} loading={isLoading} />
          </div>
        </div>

        {/* Actions populaires par catégorie */}
        <div className="mb-6">
          <PopularStocksTabs allQuotes={allPopular} loading={isLoading} />
        </div>

        {/* Gainers/Losers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold">🚀 Meilleures hausses</span>
            </div>
            <div className="divide-y divide-border">
              {isLoading
                ? [...Array(5)].map((_, i) => (
                    <div key={i} className="px-4 py-2.5 flex justify-between animate-pulse">
                      <div className="h-3 bg-muted rounded w-16" /><div className="h-3 bg-muted rounded w-12" />
                    </div>
                  ))
                : data?.topGainers?.slice(0, 8)?.map((q) => (
                    <Link key={q.symbol} href={`/quote/${encodeURIComponent(q.symbol)}`}>
                      <div className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors">
                        <div>
                          <span className="text-sm font-semibold">{q.symbol}</span>
                          <span className="text-xs text-muted-foreground ml-2 truncate max-w-32 inline-block align-middle">{q.name}</span>
                        </div>
                        <span className="text-sm font-mono font-semibold gain">{formatPercent(q.changePercent)}</span>
                      </div>
                    </Link>
                  ))}
              {!isLoading && (data?.topGainers?.length ?? 0) === 0 && (
                <div className="px-4 py-3 text-sm text-muted-foreground">Aucune hausse</div>
              )}
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold">📉 Pires baisses</span>
            </div>
            <div className="divide-y divide-border">
              {isLoading
                ? [...Array(5)].map((_, i) => (
                    <div key={i} className="px-4 py-2.5 flex justify-between animate-pulse">
                      <div className="h-3 bg-muted rounded w-16" /><div className="h-3 bg-muted rounded w-12" />
                    </div>
                  ))
                : data?.topLosers?.slice(0, 8)?.map((q) => (
                    <Link key={q.symbol} href={`/quote/${encodeURIComponent(q.symbol)}`}>
                      <div className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors">
                        <div>
                          <span className="text-sm font-semibold">{q.symbol}</span>
                          <span className="text-xs text-muted-foreground ml-2 truncate max-w-32 inline-block align-middle">{q.name}</span>
                        </div>
                        <span className="text-sm font-mono font-semibold loss">{formatPercent(q.changePercent)}</span>
                      </div>
                    </Link>
                  ))}
              {!isLoading && (data?.topLosers?.length ?? 0) === 0 && (
                <div className="px-4 py-3 text-sm text-muted-foreground">Aucune baisse</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
