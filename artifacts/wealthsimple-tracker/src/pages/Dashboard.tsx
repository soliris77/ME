import {
  useGetMarketOverview,
  useAddToWatchlist,
  getGetWatchlistQueryKey,
} from "@workspace/api-client-react";
import { formatPrice, formatPercent, changeClass, isUp } from "@/lib/format";
import { Link } from "wouter";
import {
  ArrowUpRight, ArrowDownRight, RefreshCw, TrendingUp, TrendingDown,
  Globe, Bitcoin, BarChart3, AlertTriangle, Bookmark,
  Radio, Clock, Infinity, ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  getUSMarketStatus,
  getNextMarketEvent,
  getSymbolMarketStatus,
  EXCHANGES,
  getExchangeOpenStatus,
  getExchangeNextEvent,
} from "@/lib/marketHours";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import LiveTicker from "@/components/LiveTicker";
import TradeModal from "@/components/TradeModal";
import type { Quote } from "@workspace/api-client-react";

// ─── Market overview symbol groups ───────────────────────────────────────────

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

// ─── All 11 stock categories — mirrors the API's STOCK_CATEGORIES exactly ────

const STOCK_CATS: { label: string; symbols: string[] }[] = [
  {
    label: "Tech US",
    symbols: [
      "AAPL", "MSFT", "NVDA", "AMD", "META", "GOOG", "AMZN", "TSLA",
      "INTC", "NFLX", "ORCL", "CRM", "ADBE", "PYPL", "UBER", "PLTR",
      "SNOW", "SQ", "COIN", "SHOP", "IBM", "QCOM", "TXN", "AVGO",
      "CSCO", "NOW", "SPOT", "ABNB", "DASH", "RBLX",
      "MU", "ARM", "SMCI", "DELL", "HPQ", "PANW", "CRWD", "ZS", "NET",
      "DDOG", "MDB", "TEAM", "WDAY", "INTU", "ADSK", "ANET", "MRVL",
      "ASML", "SAP", "APP", "TTD", "ROKU", "PINS", "SNAP", "LYFT", "ZM", "DOCU",
    ],
  },
  {
    label: "Finance US",
    symbols: [
      "JPM", "BAC", "GS", "MS", "V", "MA", "BRK-B", "WFC", "BLK", "C",
      "AXP", "SCHW", "USB", "PNC", "TFC", "COF",
      "AIG", "MET", "PRU", "TRV", "ALL", "CB", "ICE", "CME", "SPGI", "MCO",
      "PGR", "AON", "MMC", "FIS", "FI", "PYPL",
    ],
  },
  {
    label: "Consommation",
    symbols: [
      "WMT", "COST", "MCD", "NKE", "DIS", "SBUX", "TGT", "PG", "KO", "PEP",
      "HD", "LOW", "CMG", "YUM", "EL", "CL",
      "MDLZ", "MO", "PM", "KHC", "GIS", "HSY", "STZ", "TJX", "ROST", "DG",
      "DLTR", "BBY", "ULTA", "LULU", "DECK", "CROX", "YUMC", "DPZ",
    ],
  },
  {
    label: "Santé",
    symbols: [
      "LLY", "UNH", "JNJ", "PFE", "MRK", "ABBV", "TMO", "ABT", "DHR", "BMY",
      "AMGN", "GILD", "CVS", "CI", "ELV", "HUM", "ISRG", "VRTX", "REGN", "MRNA",
      "ZTS", "BSX", "MDT", "SYK", "BDX", "IDXX",
    ],
  },
  {
    label: "Énergie & Industrie",
    symbols: [
      "XOM", "CVX", "COP", "SLB", "BA", "CAT", "GE", "HON", "LMT", "UPS", "RTX", "DE",
      "OXY", "PSX", "VLO", "MPC", "EOG", "WMB", "KMI", "HAL", "BKR",
      "MMM", "EMR", "ETN", "ITW", "PH", "GD", "NOC", "TDG", "FDX", "CSX", "NSC", "UNP",
    ],
  },
  {
    label: "Utilities & Matériaux",
    symbols: [
      "NEE", "DUK", "SO", "D", "AEP", "EXC", "SRE", "XEL", "PEG", "ED",
      "LIN", "APD", "SHW", "ECL", "FCX", "NEM", "NUE", "DOW", "DD", "PPG",
    ],
  },
  {
    label: "REITs US",
    symbols: ["AMT", "PLD", "CCI", "EQIX", "PSA", "O", "SPG", "WELL", "DLR", "AVB"],
  },
  {
    label: "Canada",
    symbols: [
      "XEQT.TO", "VEQT.TO", "ZSP.TO", "VFV.TO", "XIU.TO",
      "SHOP.TO", "RY.TO", "TD.TO", "BNS.TO", "ENB.TO",
      "CNR.TO", "CP.TO", "SU.TO", "BCE.TO", "MFC.TO", "BAM.TO",
      "BMO.TO", "CM.TO", "TRP.TO", "CNQ.TO", "ATD.TO", "WCN.TO", "GIB-A.TO", "L.TO",
      "T.TO", "MG.TO", "QSR.TO", "WSP.TO", "FTS.TO", "SLF.TO", "POW.TO",
      "IMO.TO", "NTR.TO", "K.TO", "AEM.TO", "ABX.TO", "GIL.TO", "DOL.TO",
      "CSU.TO", "OTEX.TO", "TIH.TO", "RCI-B.TO", "H.TO", "EMA.TO", "AQN.TO",
    ],
  },
  {
    label: "Europe",
    symbols: [
      "SAP.DE", "SIE.DE", "ALV.DE", "MBG.DE", "VOW3.DE", "BMW.DE", "BAS.DE", "DTE.DE", "IFX.DE", "ADS.DE",
      "MC.PA", "OR.PA", "TTE.PA", "AIR.PA", "SAN.PA", "BNP.PA", "SU.PA", "DG.PA", "CS.PA", "RMS.PA",
      "AZN.L", "HSBA.L", "SHEL.L", "ULVR.L", "BP.L", "GSK.L", "DGE.L", "RIO.L", "BATS.L", "VOD.L",
      "NESN.SW", "NOVN.SW", "ROG.SW", "UBSG.SW", "ZURN.SW",
      "ASML.AS", "PHIA.AS", "INGA.AS", "ADYEN.AS",
      "ENI.MI", "ISP.MI", "UCG.MI", "ENEL.MI",
      "IBE.MC", "ITX.MC", "BBVA.MC",
    ],
  },
  {
    label: "Asie",
    symbols: [
      "7203.T", "6758.T", "9984.T", "6098.T", "8306.T", "9432.T", "6501.T",
      "005930.KS", "000660.KS", "035420.KS",
      "TSM", "BABA", "JD", "PDD", "BIDU", "NIO", "LI", "XPEV", "NTES",
      "0700.HK", "9988.HK", "0941.HK", "1299.HK", "0388.HK", "3690.HK",
      "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS",
    ],
  },
  {
    label: "Latam & Afrique",
    symbols: [
      "VALE", "PBR", "ITUB", "BBD", "ABEV", "MELI",
      "GFI", "AU", "NPN.JO", "SBK.JO",
      "AMX", "FMX", "CX", "GRUPOSAB.MX",
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Market status section ────────────────────────────────────────────────────

// Refresh status every 60s so cards update when markets open/close
function useMarketStatusNow() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return tick;
}

// H24 asset categories — chaque actif a un label affiché + un symbole Yahoo Finance (null = non navigable)
interface H24Asset { label: string; symbol: string | null }

const H24_CATEGORIES: {
  id: string; label: string; badge: string; color: "violet" | "sky" | "amber";
  assets: H24Asset[]; note: string;
}[] = [
  {
    id: "crypto",
    label: "Cryptomonnaies",
    badge: "24/7",
    color: "violet",
    assets: [
      { label: "BTC",   symbol: "BTC-USD"  },
      { label: "ETH",   symbol: "ETH-USD"  },
      { label: "SOL",   symbol: "SOL-USD"  },
      { label: "XRP",   symbol: "XRP-USD"  },
      { label: "ADA",   symbol: "ADA-USD"  },
      { label: "DOGE",  symbol: "DOGE-USD" },
      { label: "AVAX",  symbol: "AVAX-USD" },
      { label: "DOT",   symbol: "DOT-USD"  },
      { label: "LINK",  symbol: "LINK-USD" },
      { label: "MATIC", symbol: "MATIC-USD"},
      { label: "UNI",   symbol: "UNI-USD"  },
      { label: "ATOM",  symbol: "ATOM-USD" },
    ],
    note: "Cotations continues — 7j/7, 24h/24",
  },
  {
    id: "forex",
    label: "Forex",
    badge: "24/5",
    color: "sky",
    assets: [
      { label: "EUR/USD", symbol: "EURUSD=X"  },
      { label: "GBP/USD", symbol: "GBPUSD=X"  },
      { label: "USD/JPY", symbol: "USDJPY=X"  },
      { label: "USD/CHF", symbol: "USDCHF=X"  },
      { label: "AUD/USD", symbol: "AUDUSD=X"  },
      { label: "USD/CAD", symbol: "USDCAD=X"  },
      { label: "NZD/USD", symbol: "NZDUSD=X"  },
      { label: "USD/MXN", symbol: "USDMXN=X"  },
      { label: "USD/BRL", symbol: "USDBRL=X"  },
      { label: "EUR/GBP", symbol: "EURGBP=X"  },
    ],
    note: "Lun matin Sydney — Ven soir New York",
  },
  {
    id: "futures",
    label: "Matières premières",
    badge: "24/5",
    color: "amber",
    assets: [
      { label: "Or",           symbol: "GC=F"  },
      { label: "Pétrole WTI",  symbol: "CL=F"  },
      { label: "Argent",       symbol: "SI=F"  },
      { label: "Brent",        symbol: "BZ=F"  },
      { label: "Gaz naturel",  symbol: "NG=F"  },
      { label: "Cuivre",       symbol: "HG=F"  },
      { label: "Blé",          symbol: "ZW=F"  },
      { label: "Maïs",         symbol: "ZC=F"  },
      { label: "Soja",         symbol: "ZS=F"  },
    ],
    note: "Pause quotidienne ~1h (17h–18h ET)",
  },
];

type H24Color = "violet" | "sky" | "amber";

const H24_THEME: Record<H24Color, {
  border: string; badge: string; label: string; note: string;
  chip: string; chipHover: string;
}> = {
  violet: {
    border:    "border-violet-500/25",
    badge:     "bg-violet-500/15 text-violet-300",
    label:     "text-violet-300",
    note:      "text-violet-400/50",
    chip:      "bg-violet-500/10 text-violet-200/70",
    chipHover: "hover:bg-violet-500/25 hover:text-violet-200",
  },
  sky: {
    border:    "border-sky-500/25",
    badge:     "bg-sky-500/15 text-sky-300",
    label:     "text-sky-300",
    note:      "text-sky-400/50",
    chip:      "bg-sky-500/10 text-sky-200/70",
    chipHover: "hover:bg-sky-500/25 hover:text-sky-200",
  },
  amber: {
    border:    "border-amber-500/25",
    badge:     "bg-amber-500/15 text-amber-300",
    label:     "text-amber-300",
    note:      "text-amber-400/50",
    chip:      "bg-amber-500/10 text-amber-200/70",
    chipHover: "hover:bg-amber-500/25 hover:text-amber-200",
  },
};

// Nombre d'actifs affichés par défaut avant d'étendre
const H24_DEFAULT_VISIBLE = 6;

function H24Card({ cat }: { cat: typeof H24_CATEGORIES[number] }) {
  const [expanded, setExpanded] = useState(false);
  const t = H24_THEME[cat.color];
  const visible = expanded ? cat.assets : cat.assets.slice(0, H24_DEFAULT_VISIBLE);
  const hasMore = cat.assets.length > H24_DEFAULT_VISIBLE;

  return (
    <div className={`bg-card border ${t.border} rounded-xl p-4 flex flex-col`}>
      {/* Header — cliquable pour étendre */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 mb-3 w-full text-left group"
      >
        <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-widest ${t.badge}`}>
          {cat.badge}
        </div>
        <span className={`text-[12px] font-semibold uppercase tracking-wider ${t.label}`}>
          {cat.label}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Infinity className={`w-3.5 h-3.5 ${t.label} opacity-50`} />
          {hasMore && (
            expanded
              ? <ChevronUp  className={`w-3.5 h-3.5 ${t.label} opacity-60`} />
              : <ChevronDown className={`w-3.5 h-3.5 ${t.label} opacity-60`} />
          )}
        </span>
      </button>

      {/* Asset chips — navigables */}
      <div className="flex flex-wrap gap-1.5 mb-3 flex-1">
        {visible.map((asset) =>
          asset.symbol ? (
            <Link
              key={asset.symbol}
              href={`/quote/${encodeURIComponent(asset.symbol)}`}
              className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded
                transition-colors cursor-pointer ${t.chip} ${t.chipHover}`}
              title={`Voir ${asset.label}`}
            >
              {asset.label}
              <ExternalLink className="w-2.5 h-2.5 opacity-40" />
            </Link>
          ) : (
            <span
              key={asset.label}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${t.chip}`}
            >
              {asset.label}
            </span>
          )
        )}
        {!expanded && hasMore && (
          <button
            onClick={() => setExpanded(true)}
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border border-dashed
              opacity-50 hover:opacity-80 transition-opacity ${t.label} border-current`}
          >
            +{cat.assets.length - H24_DEFAULT_VISIBLE} autres
          </button>
        )}
      </div>

      {/* Footer */}
      <div className={`text-[10px] border-t border-border/30 pt-2 ${t.note}`}>
        {cat.note}
      </div>
    </div>
  );
}

function ExchangeCard({ ex }: { ex: typeof EXCHANGES[number] }) {
  const [expanded, setExpanded] = useState(false);
  const status = getExchangeOpenStatus(ex);
  const next   = getExchangeNextEvent(ex);
  const open   = status === "open";

  const VISIBLE = 5;
  const visible = expanded ? ex.symbols : ex.symbols.slice(0, VISIBLE);
  const hasMore = ex.symbols.length > VISIBLE;

  return (
    <div className={`bg-card border rounded-xl p-4 flex flex-col ${
      open ? "border-green-500/30" : "border-border/60"
    }`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base leading-none select-none" aria-hidden>{ex.flag}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-[12px] font-semibold uppercase tracking-wider leading-tight ${
            open ? "text-green-400" : "text-foreground/70"
          }`}>
            {ex.name}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">{ex.location}</div>
        </div>
        {/* Status badge */}
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
          open ? "bg-green-500/15 text-green-400" : "bg-muted/60 text-muted-foreground"
        }`}>
          {open
            ? <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            : <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
          }
          {open ? "OUVERT" : "FERMÉ"}
        </div>
      </div>

      {/* Symbol chips — navigables */}
      <div className="flex flex-wrap gap-1 mb-3 flex-1">
        {visible.map((sym) => (
          <Link
            key={sym}
            href={`/quote/${encodeURIComponent(sym)}`}
            className={`inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded
              transition-colors cursor-pointer group/chip ${
              open
                ? "bg-green-500/10 text-green-300/80 hover:bg-green-500/25 hover:text-green-200"
                : "bg-muted/40 text-foreground/40 hover:bg-muted/70 hover:text-foreground/70"
            }`}
            title={`Voir ${sym}`}
          >
            {sym}
            <ExternalLink className="w-2 h-2 opacity-0 group-hover/chip:opacity-60 transition-opacity" />
          </Link>
        ))}
        {!expanded && hasMore && (
          <button
            onClick={() => setExpanded(true)}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-dashed
              border-border/40 text-muted-foreground hover:text-foreground/60 transition-colors"
          >
            +{ex.symbols.length - VISIBLE}
          </button>
        )}
        {expanded && hasMore && (
          <button
            onClick={() => setExpanded(false)}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-dashed
              border-border/40 text-muted-foreground hover:text-foreground/60 transition-colors"
          >
            Réduire
          </button>
        )}
      </div>

      {/* Footer — hours + next event */}
      <div className={`text-[10px] border-t pt-2 flex flex-col gap-0.5 ${
        open ? "border-green-500/20 text-green-400/60" : "border-border/30 text-muted-foreground"
      }`}>
        <span className="font-medium">{ex.hoursLabel}, lun–ven</span>
        <span>{next}</span>
      </div>
    </div>
  );
}

function MarketStatusSection() {
  useMarketStatusNow(); // déclenche un re-render toutes les 60s

  return (
    <div className="mb-7">
      <SectionRule title="Statut des marchés" />

      {/* ── H24 : Crypto · Forex · Futures ──────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        {H24_CATEGORIES.map((cat) => (
          <H24Card key={cat.id} cat={cat} />
        ))}
      </div>

      {/* ── Bourses mondiales ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {EXCHANGES.map((ex) => (
          <ExchangeCard key={ex.id} ex={ex} />
        ))}
      </div>
    </div>
  );
}

// ─── Flash quote card (indices / crypto / commodities) ────────────────────────

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

// ─── Stock row — with hover quick-actions (Suivre · Acheter · Vendre) ─────────

interface StockRowProps {
  q: Quote;
  onTrade: (side: "BUY" | "SELL", q: Quote) => void;
}

function StockRow({ q, onTrade }: StockRowProps) {
  const cls = changeClass(q.changePercent);
  const up = isUp(q.changePercent);
  const [flash, setFlash] = useState(false);
  const prev = useRef(q.price);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const add = useAddToWatchlist({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
        toast({ title: `${q.symbol} ajouté à la liste de suivi` });
      },
      onError: () => toast({ title: "Déjà suivi ou erreur", variant: "destructive" }),
    },
  });

  useEffect(() => {
    if (prev.current !== q.price) {
      prev.current = q.price;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [q.price]);

  const hasPrice = q.price != null && q.price > 0;

  return (
    <div
      className={`flex items-center group hover:bg-muted/40 transition-colors rounded-lg ${
        flash ? "bg-primary/5" : ""
      }`}
    >
      {/* Clickable zone — navigates to quote */}
      <Link
        href={`/quote/${encodeURIComponent(q.symbol)}`}
        className="flex-1 flex items-center justify-between px-4 py-2.5 cursor-pointer min-w-0"
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
      </Link>

      {/* Quick-action buttons — revealed on row hover */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 pr-2 shrink-0">
        <button
          title={`Suivre ${q.symbol}`}
          disabled={add.isPending}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            add.mutate({ data: { symbol: q.symbol, name: q.name } });
          }}
          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
        >
          <Bookmark className="w-3.5 h-3.5" />
        </button>
        {hasPrice && (
          <>
            <button
              title={`Acheter ${q.symbol}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTrade("BUY", q);
              }}
              className="p-1.5 rounded-md transition-colors hover:bg-emerald-500/10"
              style={{ color: "#16A34A" }}
            >
              <TrendingUp className="w-3.5 h-3.5" />
            </button>
            <button
              title={`Vendre ${q.symbol}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTrade("SELL", q);
              }}
              className="p-1.5 rounded-md transition-colors hover:bg-red-500/10"
              style={{ color: "#DC2626" }}
            >
              <TrendingDown className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Market section (indices cards) ──────────────────────────────────────────

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
      <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
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

// ─── Popular stocks tabs (11 categories) ─────────────────────────────────────

interface PopularStocksTabsProps {
  allQuotes: Quote[];
  loading: boolean;
  onTrade: (side: "BUY" | "SELL", q: Quote) => void;
}

function PopularStocksTabs({ allQuotes, loading, onTrade }: PopularStocksTabsProps) {
  const [activeTab, setActiveTab] = useState(0);
  const filtered = allQuotes.filter((q) => STOCK_CATS[activeTab].symbols.includes(q.symbol));

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-primary/70" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">Actions populaires</span>
        </div>
        <span className="text-[10px] text-muted-foreground/50 hidden sm:block">
          Survolez une ligne pour Suivre · Acheter · Vendre
        </span>
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
            {filtered.map((q) => (
              <StockRow key={q.symbol} q={q} onTrade={onTrade} />
            ))}
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

// ─── Gainers / Losers ─────────────────────────────────────────────────────────

function GainLossSection({ title, quotes, loading, isGain, onTrade }: {
  title: string;
  quotes: Quote[] | undefined;
  loading: boolean;
  isGain: boolean;
  onTrade: (side: "BUY" | "SELL", q: Quote) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const add = useAddToWatchlist({
    mutation: {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
        toast({ title: `${variables.data.symbol} ajouté à la liste de suivi` });
      },
      onError: () => toast({ title: "Déjà suivi ou erreur", variant: "destructive" }),
    },
  });

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/60 flex items-center gap-2">
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
              <div
                key={q.symbol}
                className="flex items-center group hover:bg-muted/30 transition-colors"
              >
                <Link
                  href={`/quote/${encodeURIComponent(q.symbol)}`}
                  className="flex-1 flex items-center justify-between px-5 py-2.5 cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] font-bold font-mono text-foreground">{q.symbol}</span>
                    <span className="text-[11px] text-muted-foreground truncate max-w-28">{q.name}</span>
                  </div>
                  <span className={`text-[13px] font-mono font-bold ${isGain ? "gain" : "loss"}`}>
                    {isGain ? "+" : ""}{formatPercent(q.changePercent)}
                  </span>
                </Link>
                {/* Quick actions */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 pr-3 shrink-0">
                  <button
                    title={`Suivre ${q.symbol}`}
                    onClick={() => add.mutate({ data: { symbol: q.symbol, name: q.name } })}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Bookmark className="w-3 h-3" />
                  </button>
                  {q.price != null && q.price > 0 && (
                    <>
                      <button
                        title={`Acheter ${q.symbol}`}
                        onClick={() => onTrade("BUY", q)}
                        className="p-1.5 rounded-md hover:bg-emerald-500/10 transition-colors"
                        style={{ color: "#16A34A" }}
                      >
                        <TrendingUp className="w-3 h-3" />
                      </button>
                      <button
                        title={`Vendre ${q.symbol}`}
                        onClick={() => onTrade("SELL", q)}
                        className="p-1.5 rounded-md hover:bg-red-500/10 transition-colors"
                        style={{ color: "#DC2626" }}
                      >
                        <TrendingDown className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
        {!loading && (quotes?.length ?? 0) === 0 && (
          <div className="px-5 py-4 text-sm text-muted-foreground">{isGain ? "Aucune hausse" : "Aucune baisse"}</div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

type TradeModalState = { side: "BUY" | "SELL"; q: Quote } | null;

export default function Dashboard() {
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useGetMarketOverview({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { refetchInterval: 10_000 } as any,
  });
  const secondsSince = useLastUpdated(dataUpdatedAt);
  const allIndices: Quote[] = data?.indices ?? [];
  const allPopular: Quote[] = data?.wealthsimplePopular ?? [];

  const [tradeModal, setTradeModal] = useState<TradeModalState>(null);

  const handleTrade = useCallback((side: "BUY" | "SELL", q: Quote) => {
    setTradeModal({ side, q });
  }, []);

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
                className="w-1.5 h-1.5 rounded-full live-dot inline-block"
                style={{ background: "#D4A72C", boxShadow: "0 0 6px rgba(212,167,44,0.7)" }}
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

        {/* Market status */}
        <MarketStatusSection />

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

        {/* Popular stocks — 11 categories, all with quick-actions */}
        <div className="mb-7">
          <PopularStocksTabs allQuotes={allPopular} loading={isLoading} onTrade={handleTrade} />
        </div>

        {/* Gainers / Losers — also with quick-actions */}
        <div>
          <SectionRule title="Mouvements du jour" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GainLossSection
              title="Meilleures hausses"
              quotes={data?.topGainers}
              loading={isLoading}
              isGain={true}
              onTrade={handleTrade}
            />
            <GainLossSection
              title="Pires baisses"
              quotes={data?.topLosers}
              loading={isLoading}
              isGain={false}
              onTrade={handleTrade}
            />
          </div>
        </div>
      </div>

      {/* Trade modal — wired to broker API */}
      {tradeModal && (
        <TradeModal
          open={true}
          side={tradeModal.side}
          symbol={tradeModal.q.symbol}
          currentPrice={tradeModal.q.price ?? 0}
          currency={tradeModal.q.currency ?? "USD"}
          source="Tableau de bord"
          onClose={() => setTradeModal(null)}
        />
      )}
    </div>
  );
}
