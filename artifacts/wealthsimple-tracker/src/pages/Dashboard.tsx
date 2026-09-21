import {
  useGetMarketOverview,
  getGetMarketOverviewQueryKey,
  useAddToWatchlist,
  getGetWatchlistQueryKey,
} from "@workspace/api-client-react";
import { formatPrice, formatPercent, changeClass, isUp } from "@/lib/format";
import { Link } from "wouter";
import {
  ArrowUpRight, ArrowDownRight, RefreshCw, TrendingUp, TrendingDown,
  Bitcoin, BarChart3, AlertTriangle, Bookmark,
  Radio, Clock, Infinity, ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  EXCHANGES,
  getExchangeOpenStatus,
  getExchangeNextEvent,
} from "@/lib/marketHours";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import LiveTicker from "@/components/LiveTicker";
import CommandCenter from "@/components/CommandCenter";
import TradeModal from "@/components/TradeModal";
import type { Quote } from "@workspace/api-client-react";
import SectorHeatmap from "@/components/SectorHeatmap";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainer, cardVariants, listItemVariants, hoverLift, EASE_PRECISION } from "@/lib/motion";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { Sparkline } from "@/components/Sparkline";
import { PageTransition } from "@/components/PageTransition";
import ObservatoryHero from "@/components/ObservatoryHero";
import MarketStatusPanel from "@/components/MarketStatusPanel";

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
  assets: H24Asset[]; note: string; regimeLabel: string;
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
    regimeLabel: "Continu · 7j/7",
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
    regimeLabel: "Quasi continu · lun–ven",
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
    regimeLabel: "Quasi continu · lun–ven",
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
    <div className={`market-continuous-card surface-glass border rounded-xl p-4 flex flex-col transition-all ${t.border} hover:border-opacity-50`}>
      {/* Header — cliquable pour étendre */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2.5 mb-4 w-full text-left group"
      >
        <div className={`px-2 py-0.5 rounded-sm text-[9px] font-bold tracking-[0.2em] font-mono border border-current/20 ${t.badge}`}>
          {cat.badge}
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-[0.2em] font-mono ${t.label}`}>
          {cat.label}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Infinity className={`w-3.5 h-3.5 ${t.label} opacity-40`} />
          {hasMore && (
            expanded
              ? <ChevronUp  className={`w-3.5 h-3.5 ${t.label} opacity-50`} />
              : <ChevronDown className={`w-3.5 h-3.5 ${t.label} opacity-50`} />
          )}
        </span>
      </button>

      <div className={`market-continuous-regime ${t.label}`}>
        <span className={`market-continuous-regime-dot ${cat.color}`} />
        <span>{cat.regimeLabel}</span>
        <span className="ml-auto opacity-60">{cat.id === "crypto" ? "ACTIF" : "FENÊTRE SEMAINE"}</span>
      </div>

      {/* Asset chips — navigables */}
      <div className="flex flex-wrap gap-1.5 mb-4 flex-1">
        {visible.map((asset) =>
          asset.symbol ? (
            <Link
              key={asset.symbol}
              href={`/quote/${encodeURIComponent(asset.symbol)}`}
              className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-md
                transition-all cursor-pointer border border-transparent ${t.chip} ${t.chipHover}`}
              title={`Voir ${asset.label}`}
            >
              {asset.label}
              <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
            </Link>
          ) : (
            <span
              key={asset.label}
              className={`text-[10px] font-mono px-2 py-1 rounded-md ${t.chip}`}
            >
              {asset.label}
            </span>
          )
        )}
        {!expanded && hasMore && (
          <button
            onClick={() => setExpanded(true)}
            className={`text-[9px] font-mono px-2 py-1 rounded-md border border-dashed
              opacity-60 hover:opacity-100 transition-opacity ${t.label} border-current uppercase tracking-widest`}
          >
            +{cat.assets.length - H24_DEFAULT_VISIBLE}
          </button>
        )}
      </div>

      {/* Footer */}
      <div className={`text-[10px] border-t border-border/20 pt-3 tracking-wide ${t.note}`}>
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
    <div className={`market-exchange-card surface-glass rounded-xl p-4 flex flex-col transition-colors ${
      open ? "market-exchange-card-open" : "market-exchange-card-closed"
    }`}>
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-lg leading-none select-none drop-shadow-sm" aria-hidden>{ex.flag}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-[10px] font-bold uppercase tracking-[0.2em] leading-tight font-mono ${
            open ? "text-green-400" : "text-foreground/70"
          }`}>
            {ex.name}
          </div>
          <div className="text-[9px] text-muted-foreground truncate uppercase tracking-widest">{ex.location}</div>
        </div>
        {/* Status badge */}
        <div className={`market-exchange-status ${open ? "market-exchange-status-open" : "market-exchange-status-closed"}`}>
          <span className="market-exchange-status-dot" />
          {open ? "OUVERT" : "FERMÉ"}
        </div>
      </div>

      {/* Symbol chips — navigables */}
      <div className="flex flex-wrap gap-1.5 mb-4 flex-1">
        {visible.map((sym) => (
          <Link
            key={sym}
            href={`/quote/${encodeURIComponent(sym)}`}
            className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-md
              transition-all cursor-pointer group/chip ${
              open
                ? "bg-green-500/10 text-green-300 hover:bg-green-500/20 hover:text-green-200 border border-transparent hover:border-green-500/30"
                : "bg-muted/30 text-foreground/50 hover:bg-muted/60 hover:text-foreground/80 border border-transparent hover:border-border/50"
            }`}
            title={`Voir ${sym}`}
          >
            {sym}
            <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover/chip:opacity-60 transition-opacity" />
          </Link>
        ))}
        {!expanded && hasMore && (
          <button
            onClick={() => setExpanded(true)}
            className="text-[9px] font-mono px-2 py-1 rounded-md border border-dashed
              border-border/40 text-muted-foreground hover:text-foreground/70 hover:border-border transition-colors uppercase tracking-widest"
          >
            +{ex.symbols.length - VISIBLE}
          </button>
        )}
        {expanded && hasMore && (
          <button
            onClick={() => setExpanded(false)}
            className="text-[9px] font-mono px-2 py-1 rounded-md border border-dashed
              border-border/40 text-muted-foreground hover:text-foreground/70 hover:border-border transition-colors uppercase tracking-widest"
          >
            RÉDUIRE
          </button>
        )}
      </div>

      {/* Footer — hours + next event */}
      <div className={`text-[10px] border-t pt-3 flex flex-col gap-1 tracking-wide ${
        open ? "border-green-500/10 text-green-400/60" : "border-primary/10 text-muted-foreground/80"
      }`}>
        <span className="font-medium">{ex.hoursLabel}, lun–ven</span>
        <span className={open ? "" : "text-primary/75"}>{open ? next : `Prochaine séance · ${next}`}</span>
      </div>
    </div>
  );
}

function MarketStatusSection() {
  useMarketStatusNow(); // déclenche un re-render toutes les 60s

  return (
    <div className="mb-7">
      <SectionRule title="Statut des marchés" />
      <MarketStatusPanel />

      <div className="market-regime-heading">
        <div>
          <div className="market-regime-eyebrow">Disponibilité continue</div>
          <h3 className="market-regime-title">Marchés qui restent actifs</h3>
        </div>
        <p>Les horaires diffèrent des places à séances fixes.</p>
      </div>

      {/* ── Marchés continus : crypto · forex · matières premières ───── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        {H24_CATEGORIES.map((cat) => (
          <H24Card key={cat.id} cat={cat} />
        ))}
      </div>

      <div className="market-regime-heading market-regime-heading-exchanges">
        <div>
          <div className="market-regime-eyebrow">Séances locales</div>
          <h3 className="market-regime-title">Places et bourses mondiales</h3>
        </div>
        <p>Fermé signifie hors séance, pas en erreur.</p>
      </div>

      {/* ── Places à séances : NYSE · NASDAQ · Euronext · Tokyo ... ─── */}
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
  const flashColor = up === true ? "gain" : up === false ? "loss" : "neutral";

  return (
    <Link href={`/quote/${encodeURIComponent(q.symbol)}`}>
      <motion.div
        variants={cardVariants}
        whileHover="hover"
        initial="rest"
        animate="rest"
        className={`interactive-surface surface-glass rounded-xl p-4 cursor-pointer relative overflow-hidden group ${
          flash ? "border-primary/50 bg-primary/5" : ""
        }`}
        style={hoverLift}
      >
        <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/80 mb-3 truncate">
          {MARKET_NAMES[q.symbol] ?? q.name}
        </div>
        <div className="font-mono text-[18px] font-medium text-foreground leading-tight mb-2 tracking-tight">
          <AnimatedCounter 
            value={formatPrice(q.price, q.currency)} 
            flashOnChange={flash}
            flashColor={flashColor}
          />
        </div>
        <div className="flex items-center justify-between gap-2 mt-auto">
        <motion.div
          className={`flex items-center gap-1 text-[11px] font-mono font-medium ${
            up === null ? "text-muted-foreground" : up ? "gain" : "loss"
          }`}
          animate={flash ? { scale: [1, 1.08, 1] } : {}}
          transition={{ duration: 0.4, ease: EASE_PRECISION }}
        >
          {up === true && <ArrowUpRight className="w-3.5 h-3.5" />}
          {up === false && <ArrowDownRight className="w-3.5 h-3.5" />}
          <AnimatedCounter value={formatPercent(q.changePercent)} />
        </motion.div>
        <div className="hidden sm:block">
          <Sparkline symbol={q.symbol} />
        </div>
        </div>
      </motion.div>
    </Link>
  );
}

function MarketCardSkeleton() {
  return (
    <div className="bg-card border border-card-border elev-1 tr-surface rounded-xl p-4 skeleton-premium">
      <div className="h-2 bg-muted/60 rounded w-20 mb-3" />
      <div className="h-5 bg-muted/60 rounded w-28 mb-2.5" />
      <div className="h-3 bg-muted/60 rounded w-14" />
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
  const flashColor = up === true ? "gain" : up === false ? "loss" : "neutral";

  return (
    <motion.div
      variants={listItemVariants}
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
          <div className="text-[13px] font-mono font-semibold">
            <AnimatedCounter value={formatPrice(q.price, q.currency)} flashOnChange={flash} flashColor={flashColor} />
          </div>
          <motion.div 
            className={`text-[11px] font-mono ${cls} flex items-center justify-end gap-0.5`}
            animate={flash ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 0.35, ease: EASE_PRECISION }}
          >
            {up === true && <ArrowUpRight className="w-3 h-3" />}
            {up === false && <ArrowDownRight className="w-3 h-3" />}
            <AnimatedCounter value={formatPercent(q.changePercent)} />
          </motion.div>
        </div>
      </Link>

      {/* Quick-action buttons — revealed on row hover */}
      <motion.div 
        className="flex items-center gap-0.5 pr-2 shrink-0"
        initial={{ opacity: 0, x: -8 }}
        whileHover={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.button
          title={`Suivre ${q.symbol}`}
          disabled={add.isPending}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            add.mutate({ data: { symbol: q.symbol, name: q.name } });
          }}
          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          <Bookmark className="w-3.5 h-3.5" />
        </motion.button>
        {hasPrice && (
          <>
            <motion.button
              title={`Acheter ${q.symbol}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTrade("BUY", q);
              }}
              className="p-1.5 rounded-md transition-colors hover:bg-emerald-500/10"
              style={{ color: "#16A34A" }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <TrendingUp className="w-3.5 h-3.5" />
            </motion.button>
            <motion.button
              title={`Vendre ${q.symbol}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTrade("SELL", q);
              }}
              className="p-1.5 rounded-md transition-colors hover:bg-red-500/10"
              style={{ color: "#DC2626" }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <TrendingDown className="w-3.5 h-3.5" />
            </motion.button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Market section (indices cards) ──────────────────────────────────────────

function MarketEmptyState() {
  const queryClient = useQueryClient();
  return (
    <div className="text-xs text-muted-foreground py-3 pl-1 flex items-center gap-3">
      <span>Données indisponibles pour le moment.</span>
      <button
        onClick={() => queryClient.invalidateQueries({ queryKey: getGetMarketOverviewQueryKey() })}
        className="text-primary hover:underline font-medium"
      >
        Réessayer
      </button>
    </div>
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
        <motion.div 
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
          variants={staggerContainer}
          initial="initial"
          animate="enter"
        >
          {filtered.map((q) => <FlashQuote key={q.symbol} q={q} />)}
        </motion.div>
      ) : (
        <MarketEmptyState />
      )}
    </div>
  );
}

function AssetListSection({ title, symbols, allQuotes, loading }: {
  title: string; symbols: string[]; allQuotes: Quote[]; loading: boolean;
}) {
  const filtered = allQuotes.filter((q) => symbols.includes(q.symbol));
  return (
    <div className="surface-glass border border-border/40 rounded-xl overflow-hidden transition-all hover:border-border/60">
      <div className="px-5 py-3 border-b border-border/40 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80">{title}</span>
      </div>
      <div className="divide-y divide-border/20">
        {loading
          ? [...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 skeleton-premium">
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
          : filtered.length === 0 ? (
              <div className="px-4 py-4 text-xs text-muted-foreground">Données indisponibles pour le moment.</div>
            ) : filtered.map((q) => {
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
                    <div className="hidden sm:block mx-3 shrink-0">
                      <Sparkline symbol={q.symbol} />
                    </div>
                    <div className="text-right ml-auto">
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
    <div className="surface-glass border border-border/40 rounded-xl overflow-hidden transition-all hover:border-border/60">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary/80" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80">Actions populaires</span>
        </div>
        <span className="text-[10px] text-muted-foreground/60 hidden sm:block tracking-wide">
          Survolez une ligne pour Suivre · Acheter · Vendre
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border/40 overflow-x-auto bg-background/20 px-3 py-2 custom-scrollbar">
        {STOCK_CATS.map((cat, i) => (
          <button
            key={cat.label}
            onClick={() => setActiveTab(i)}
            className={`px-3 py-1.5 text-[11px] font-bold tracking-widest uppercase whitespace-nowrap transition-all rounded-md ${
              activeTab === i
                ? "bg-primary/15 text-primary border border-primary/30"
                : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30 hover:border-border/50"
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
              <div key={i} className="skeleton-premium flex items-center justify-between px-3 py-2.5">
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
          <motion.div 
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-0"
            variants={staggerContainer}
            initial="initial"
            animate="enter"
            key={activeTab}
          >
            {filtered.map((q) => (
              <StockRow key={q.symbol} q={q} onTrade={onTrade} />
            ))}
            {filtered.length === 0 && (
              <div className="col-span-4 py-6 text-center text-sm text-muted-foreground">
                Données en cours de chargement…
              </div>
            )}
          </motion.div>
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
    <div className="surface-glass border border-border/40 rounded-xl overflow-hidden transition-all hover:border-border/60">
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80">{title}</span>
      </div>
      <div className="divide-y divide-border/20">
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
          <div className="px-5 py-4 text-sm text-muted-foreground">
            {isGain ? "Aucune hausse pour l'instant" : "Aucune baisse pour l'instant"}
            <span className="block text-xs mt-1 text-muted-foreground/70">Les mouvements apparaissent quand les marchés sont ouverts.</span>
          </div>
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

      <PageTransition className="p-7 max-w-7xl">
        {/* Page header */}
        <motion.div 
          className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_PRECISION }}
        >
          <div>
            <div className="section-rule mb-2 mt-1">
              <span className="text-primary/60 uppercase tracking-widest font-bold text-[10px]">Aperçu global</span>
            </div>
            <h1 className="text-[24px] font-semibold tracking-wide text-foreground brand-mark mb-2">
              Marchés & Trading
            </h1>
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full live-dot inline-block bg-primary"
                style={{ boxShadow: "0 0 6px hsl(var(--primary) / 0.7)" }}
              />
              <span className="text-[11px] font-bold font-mono tracking-widest uppercase text-muted-foreground/80">
                En direct — MAJ {secondsSince < 10 ? "< 10s" : `${secondsSince}s`} · Auto 10s
              </span>
            </div>
          </div>
          <motion.button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-primary/80 hover:text-primary transition-all px-4 py-2.5 rounded-lg border border-primary/20 hover:border-primary/40 hover:bg-primary/10 disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-primary" : ""}`} />
            ACTUALISER
          </motion.button>
        </motion.div>

        {/* Observatoire — centre de vision, affiché avant les modules secondaires */}
        <ObservatoryHero variant="dashboard" />

        {/* Centre de commande — P&L du jour, coupe-circuit, limite de perte */}
        <CommandCenter />

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

        {/* Heatmap de performance par secteur */}
        <SectorHeatmap />

        {/* Actifs populaires disponibles sur Wealthsimple — pas les positions détenues */}
        <div className="mb-7">
          <MarketSection
            title="Actifs populaires sur Wealthsimple"
            symbols={allPopular.slice(0, 8).map((quote) => quote.symbol)}
            allQuotes={allPopular}
            loading={isLoading}
          />
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
      </PageTransition>
    </div>
  );
}
