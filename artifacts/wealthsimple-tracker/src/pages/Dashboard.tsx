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
    label: "Tech US",
    symbols: ["AAPL", "MSFT", "NVDA", "AMD", "META", "GOOG", "AMZN", "TSLA", "INTC", "NFLX", "ORCL", "CRM", "ADBE", "PYPL", "UBER", "PLTR", "SNOW", "SQ", "COIN", "SHOP"],
  },
  {
    label: "Finance US",
    symbols: ["JPM", "BAC", "GS", "MS", "V", "MA", "BRK-B", "WFC", "BLK", "C"],
  },
  {
    label: "Consommation",
    symbols: ["WMT", "COST", "MCD", "NKE", "DIS", "SBUX", "TGT", "PG", "KO", "PEP"],
  },
  {
    label: "Canada",
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

function SectionRule({ title }: { title: string }) {
  return (
    <div className="section-rule mb-3 mt-1">
      <span className="text-primary/60 uppercase">{title}</span>
    </div>
  );
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

  const up = isUp(q.changePercent);

  return (
    <Link href={`/quote/${encodeURIComponent(q.symbol)}`}>
      <div
        className={`market-card bg-card border border-card-border rounded-xl p-4 cursor-pointer ${
          flash ? "border-primary/50 bg-primary/5" : ""
        }`}
      >
        <div className="text-[11px] text-muted-foreground font-medium mb-2 truncate uppercase tracking-wider">
          {MARKET_NAMES[q.symbol] ?? q.name}
        </div>
        <div className="font-mono text-[17px] font-bold text-foreground leading-tight mb-2 tabular-nums">
          {formatPrice(q.price, q.currency)}
        </div>
        <div
          className={`flex items-center gap-0.5 text-[12px] font-mono font-semibold ${
            up === null ? "text-muted-foreground" : up ? "gain" : "loss"
          }`}
        >
          {up === true && <ArrowUpRight className="w-3.5 h-3.5" />}
          {up === false && <ArrowDownRight className="w-3.5 h-3.5" />}
          {formatPercent(q.changePercent)}
        </div>
      </div>
    </Link>
  );
}

function MarketCardSkeleton() {
  return (
    <div className="bg-card border border-card-border rounded-xl p-4 animate-pulse">
      <div className="h-2 bg-muted rounded w-20 mb-3" />
      <div className="h-5 bg-muted rounded w-28 mb-2.5" />
      <div className="h-3 bg-muted rounded w-14" />
    </div>
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
      <div
        className={`flex items-center justify-between px-4 py-2.5 hover:bg-muted/40 cursor-pointer transition-colors group rounded-lg ${
          flash ? "bg-primary/5" : ""
        }`}
      >
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-foreground group-hover:text-primary transition-colors font-mono">{q.symbol}</div>
          <div className="text-[11px] text-muted-foreground truncate max-w-36">{q.name}</div>
        </div>
        <div className="text-right shrink-0 ml-2">
          <div className="text-[13px] font-mono font-semibold tabular-nums">{formatPrice(q.price, q.currency)}</div>
          <div className={`text-[11px] font-mono ${cls} flex items-center justify-end gap-0.5`}>
            {up === true && <ArrowUpRight className="w-3 h-3" />}
            {up === false && <ArrowDownRight className="w-3 h-3" />}
            {formatPercent(q.changePercent)}
          </div>
        </div>
      </div>
    </Link>
  );
}

function MarketSection({ title, symbols, allQuotes, loading }: {
  title: string; symbols: string[]; allQuotes: Quote[]; loading: boolean;
}) {
  const filtered = allQuotes.filter((q) => symbols.includes(q.symbol));
  return (
    <div>
      <SectionRule title={title} />
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <MarketCardSkeleton key={i} />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((q) => <FlashQuote key={q.symbol} q={q} />)}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground py-3 pl-1">Données indisponibles</div>
      )}
    </div>
  );
}

function AssetListSection({ title, symbols, allQuotes, loading }: {
  title: string; symbols: string[]; allQuotes: Quote[]; loading: boolean;
}) {
  const filtered = allQuotes.filter((q) => symbols.includes(q.symbol));
  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      <div
        className="px-4 py-3 border-b border-border/60 flex items-center gap-2"
        style={{ background: "linear-gradient(to right, hsl(var(--card)), hsl(var(--primary) / 0.03))" }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">{title}</span>
      </div>
      <div className="divide-y divide-border/50">
        {loading
          ? [...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 animate-pulse">
                <div className="space-y-1.5">
                  <div className="h-3 bg-muted rounded w-16" />
                  <div className="h-2.5 bg-muted rounded w-8" />
                </div>
                <div className="space-y-1.5 text-right">
                  <div className="h-3 bg-muted rounded w-20" />
                  <div className="h-2.5 bg-muted rounded w-10" />
                </div>
              </div>
            ))
          : filtered.map((q) => {
              const up = isUp(q.changePercent);
              return (
                <Link key={q.symbol} href={`/quote/${encodeURIComponent(q.symbol)}`}>
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors group">
                    <div>
                      <div className="text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors">
                        {MARKET_NAMES[q.symbol] ?? q.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono tracking-wider uppercase">{q.symbol}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-mono font-semibold tabular-nums">{formatPrice(q.price, q.currency)}</div>
                      <div className={`text-[11px] font-mono font-semibold flex items-center justify-end gap-0.5 ${
                        up === null ? "text-muted-foreground" : up ? "gain" : "loss"
                      }`}>
                        {up === true && <ArrowUpRight className="w-3 h-3" />}
                        {up === false && <ArrowDownRight className="w-3 h-3" />}
                        {formatPercent(q.changePercent)}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
      </div>
    </div>
  );
}

function PopularStocksTabs({ allQuotes, loading }: { allQuotes: Quote[]; loading: boolean }) {
  const [activeTab, setActiveTab] = useState(0);
  const filtered = allQuotes.filter((q) => STOCK_CATS[activeTab].symbols.includes(q.symbol));

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3.5 border-b border-border/60"
        style={{ background: "linear-gradient(to right, hsl(var(--card)), hsl(var(--primary) / 0.04))" }}
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-primary/70" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">Actions populaires</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border/60 overflow-x-auto bg-muted/30">
        {STOCK_CATS.map((cat, i) => (
          <button
            key={cat.label}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2.5 text-[12px] font-medium whitespace-nowrap transition-all border-b-2 -mb-px ${
              activeTab === i
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-3">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse flex items-center justify-between px-3 py-2.5">
                <div className="space-y-1.5">
                  <div className="h-3 bg-muted rounded w-12" />
                  <div className="h-2 bg-muted rounded w-20" />
                </div>
                <div className="space-y-1.5 text-right">
                  <div className="h-3 bg-muted rounded w-14" />
                  <div className="h-2 bg-muted rounded w-10" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-0">
            {filtered.map((q) => <StockRow key={q.symbol} q={q} />)}
            {filtered.length === 0 && (
              <div className="col-span-4 py-6 text-center text-sm text-muted-foreground">
                Données en cours de chargement…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GainLossSection({ title, quotes, loading, isGain }: {
  title: string; quotes: Quote[] | undefined; loading: boolean; isGain: boolean;
}) {
  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      <div
        className="px-5 py-3.5 border-b border-border/60 flex items-center gap-2"
        style={{ background: "linear-gradient(to right, hsl(var(--card)), hsl(var(--primary) / 0.03))" }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">{title}</span>
      </div>
      <div className="divide-y divide-border/40">
        {loading
          ? [...Array(5)].map((_, i) => (
              <div key={i} className="px-5 py-2.5 flex justify-between animate-pulse">
                <div className="h-3 bg-muted rounded w-16" />
                <div className="h-3 bg-muted rounded w-12" />
              </div>
            ))
          : quotes?.slice(0, 8)?.map((q) => (
              <Link key={q.symbol} href={`/quote/${encodeURIComponent(q.symbol)}`}>
                <div className="flex items-center justify-between px-5 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] font-bold font-mono text-foreground">{q.symbol}</span>
                    <span className="text-[11px] text-muted-foreground truncate max-w-28">{q.name}</span>
                  </div>
                  <span className={`text-[13px] font-mono font-bold ${isGain ? "gain" : "loss"}`}>
                    {isGain ? "+" : ""}{formatPercent(q.changePercent)}
                  </span>
                </div>
              </Link>
            ))}
        {!loading && (quotes?.length ?? 0) === 0 && (
          <div className="px-5 py-4 text-sm text-muted-foreground">{isGain ? "Aucune hausse" : "Aucune baisse"}</div>
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
        <div className="p-8 max-w-2xl animate-fadeUp">
          <div className="bg-card border border-card-border rounded-2xl p-10 flex flex-col items-center text-center gap-5">
            <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-red-500/80" />
            </div>
            <div>
              <p className="text-base font-semibold mb-1.5">Impossible de charger les données de marché</p>
              <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                Le serveur API ne répond pas. Vérifiez qu'il est démarré et réessayez.
              </p>
              {errMsg && (
                <p className="text-xs font-mono text-red-500/70 mt-3 bg-red-500/5 border border-red-500/10 rounded-lg px-4 py-2 break-all">
                  {errMsg}
                </p>
              )}
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
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

      <div className="p-7 max-w-7xl animate-fadeUp">
        {/* Page header */}
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 className="text-[22px] font-light tracking-[0.04em] text-foreground brand-serif mb-1.5">
              Aperçu des marchés
            </h1>
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-dot inline-block"
                style={{ boxShadow: "0 0 6px hsl(142 68% 52% / 0.8)" }}
              />
              <span className="text-[11px] text-muted-foreground tracking-wide">
                En direct — mis à jour il y a {secondsSince < 10 ? "moins de 10s" : `${secondsSince}s`} · auto 10s
              </span>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-muted border border-transparent hover:border-border/60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-primary" : ""}`} />
            Actualiser
          </button>
        </div>

        {/* Indices */}
        <div className="space-y-6 mb-7">
          <MarketSection title="Amérique du Nord" symbols={CANADA_NORTH_AM} allQuotes={allIndices} loading={isLoading} />
          <MarketSection title="Europe & Asie" symbols={EUROPE_ASIA} allQuotes={allIndices} loading={isLoading} />

          {/* Crypto + Commodities as card lists */}
          <div>
            <SectionRule title="Actifs alternatifs" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AssetListSection title="Cryptomonnaies" symbols={CRYPTO} allQuotes={allIndices} loading={isLoading} />
              <AssetListSection title="Matières premières" symbols={COMMODITIES} allQuotes={allIndices} loading={isLoading} />
            </div>
          </div>
        </div>

        {/* Popular stocks */}
        <div className="mb-7">
          <PopularStocksTabs allQuotes={allPopular} loading={isLoading} />
        </div>

        {/* Gainers / Losers */}
        <div>
          <SectionRule title="Mouvements du jour" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GainLossSection title="Meilleures hausses" quotes={data?.topGainers} loading={isLoading} isGain={true} />
            <GainLossSection title="Pires baisses" quotes={data?.topLosers} loading={isLoading} isGain={false} />
          </div>
        </div>
      </div>
    </div>
  );
}
