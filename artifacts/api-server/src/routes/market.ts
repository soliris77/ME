import { Router } from "express";
import { yahooFinance, getQuotes } from "../lib/yahoo";
import { isMarketOpen, getExchangeForSymbol, getMarketHolidays, getEarlyCloseDays, getMarketHolidaysWithNames, getEarlyCloseDaysWithNames } from "../lib/risk";

const router = Router();

const INDICES = [
  // Amérique du Nord
  "^GSPC", "^IXIC", "^DJI", "^RUT", "^VIX", "^NYA", "^XAX",
  // Europe
  "^FTSE", "^GDAXI", "^FCHI", "^STOXX50E", "^IBEX", "^FTMIB", "^AEX", "^SSMI",
  "^OMXS30", "^OSEAX", "^ATX", "^BFX", "^PSI20",
  // Asie-Pacifique
  "^N225", "^HSI", "^BSESN", "^NSEI", "^KS11", "^AXJO", "^STI", "^TWII",
  "^JKSE", "^KLSE", "^NZ50", "000001.SS", "399001.SZ",
  // Amérique latine
  "^BVSP", "^MXX", "^MERV", "^IPSA",
  // Moyen-Orient / Afrique
  "^TA125.TA", "^CASE30", "^J203.JO",
  // Cryptos
  "BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "ADA-USD", "DOGE-USD", "BNB-USD",
  "AVAX-USD", "LINK-USD", "MATIC-USD", "DOT-USD", "LTC-USD", "SHIB-USD", "TRX-USD",
  "ATOM-USD", "UNI-USD", "XLM-USD", "NEAR-USD", "APT-USD", "ARB-USD",
  // Matières premières
  "GC=F", "CL=F", "SI=F", "NG=F", "HG=F", "ZC=F", "ZW=F", "ZS=F", "KC=F",
  "SB=F", "CT=F", "PL=F", "PA=F", "BZ=F", "RB=F",
  // Devises
  "EURUSD=X", "USDCAD=X", "GBPUSD=X", "JPY=X", "USDCHF=X", "AUDUSD=X",
  "NZDUSD=X", "USDCNY=X", "USDMXN=X", "USDINR=X", "USDBRL=X", "EURGBP=X",
  "EURJPY=X", "EURCAD=X",
];

const POPULAR_TECH_US = [
  "AAPL", "MSFT", "NVDA", "AMD", "META", "GOOG", "AMZN", "TSLA",
  "INTC", "NFLX", "ORCL", "CRM", "ADBE", "PYPL", "UBER", "PLTR",
  "SNOW", "SQ", "COIN", "SHOP", "IBM", "QCOM", "TXN", "AVGO",
  "CSCO", "NOW", "SPOT", "ABNB", "DASH", "RBLX",
  "MU", "ARM", "SMCI", "DELL", "HPQ", "PANW", "CRWD", "ZS", "NET",
  "DDOG", "MDB", "TEAM", "WDAY", "INTU", "ADSK", "ANET", "MRVL",
  "ASML", "SAP", "APP", "TTD", "ROKU", "PINS", "SNAP", "LYFT", "ZM", "DOCU",
];

const POPULAR_FINANCE_US = [
  "JPM", "BAC", "GS", "MS", "V", "MA", "BRK-B", "WFC", "BLK", "C",
  "AXP", "SCHW", "USB", "PNC", "TFC", "COF",
  "AIG", "MET", "PRU", "TRV", "ALL", "CB", "ICE", "CME", "SPGI", "MCO",
  "PGR", "AON", "MMC", "FIS", "FI", "PYPL",
];

const POPULAR_CONSUMER_US = [
  "WMT", "COST", "MCD", "NKE", "DIS", "SBUX", "TGT", "PG", "KO", "PEP",
  "HD", "LOW", "CMG", "YUM", "EL", "CL",
  "MDLZ", "MO", "PM", "KHC", "GIS", "HSY", "STZ", "TJX", "ROST", "DG",
  "DLTR", "BBY", "ULTA", "LULU", "DECK", "CROX", "YUMC", "DPZ",
];

const POPULAR_HEALTHCARE_US = [
  "LLY", "UNH", "JNJ", "PFE", "MRK", "ABBV", "TMO", "ABT", "DHR", "BMY",
  "AMGN", "GILD", "CVS", "CI", "ELV", "HUM", "ISRG", "VRTX", "REGN", "MRNA",
  "ZTS", "BSX", "MDT", "SYK", "BDX", "IDXX",
];

const POPULAR_ENERGY_INDUSTRIALS_US = [
  "XOM", "CVX", "COP", "SLB", "BA", "CAT", "GE", "HON", "LMT", "UPS", "RTX", "DE",
  "OXY", "PSX", "VLO", "MPC", "EOG", "WMB", "KMI", "HAL", "BKR",
  "MMM", "EMR", "ETN", "ITW", "PH", "GD", "NOC", "TDG", "FDX", "CSX", "NSC", "UNP",
];

const POPULAR_UTILITIES_MATERIALS_US = [
  "NEE", "DUK", "SO", "D", "AEP", "EXC", "SRE", "XEL", "PEG", "ED",
  "LIN", "APD", "SHW", "ECL", "FCX", "NEM", "NUE", "DOW", "DD", "PPG",
];

const POPULAR_REITS_US = [
  "AMT", "PLD", "CCI", "EQIX", "PSA", "O", "SPG", "WELL", "DLR", "AVB",
];

const POPULAR_CANADA = [
  "XEQT.TO", "VEQT.TO", "ZSP.TO", "VFV.TO", "XIU.TO",
  "SHOP.TO", "RY.TO", "TD.TO", "BNS.TO", "ENB.TO",
  "CNR.TO", "CP.TO", "SU.TO", "BCE.TO", "MFC.TO", "BAM.TO",
  "BMO.TO", "CM.TO", "TRP.TO", "CNQ.TO", "ATD.TO", "WCN.TO", "GIB-A.TO", "L.TO",
  "T.TO", "MG.TO", "QSR.TO", "WSP.TO", "FTS.TO", "SLF.TO", "POW.TO",
  "IMO.TO", "NTR.TO", "K.TO", "AEM.TO", "ABX.TO", "GIL.TO", "DOL.TO",
  "CSU.TO", "OTEX.TO", "TIH.TO", "RCI-B.TO", "H.TO", "EMA.TO", "AQN.TO",
];

const POPULAR_EUROPE = [
  // Actions européennes majeures (cotées sur bourses locales — libellés Yahoo)
  "SAP.DE", "SIE.DE", "ALV.DE", "MBG.DE", "VOW3.DE", "BMW.DE", "BAS.DE", "DTE.DE", "IFX.DE", "ADS.DE",
  "MC.PA", "OR.PA", "TTE.PA", "AIR.PA", "SAN.PA", "BNP.PA", "SU.PA", "DG.PA", "CS.PA", "RMS.PA",
  "AZN.L", "HSBA.L", "SHEL.L", "ULVR.L", "BP.L", "GSK.L", "DGE.L", "RIO.L", "BATS.L", "VOD.L",
  "NESN.SW", "NOVN.SW", "ROG.SW", "UBSG.SW", "ZURN.SW",
  "ASML.AS", "PHIA.AS", "INGA.AS", "ADYEN.AS",
  "ENI.MI", "ISP.MI", "UCG.MI", "ENEL.MI",
  "IBE.MC", "ITX.MC", "BBVA.MC",
];

const POPULAR_ASIA = [
  "7203.T", "6758.T", "9984.T", "6098.T", "8306.T", "9432.T", "6501.T",
  "005930.KS", "000660.KS", "035420.KS",
  "TSM", "BABA", "JD", "PDD", "BIDU", "NIO", "LI", "XPEV", "NTES",
  "0700.HK", "9988.HK", "0941.HK", "1299.HK", "0388.HK", "3690.HK",
  "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS",
];

const POPULAR_LATAM_AFRICA = [
  "VALE", "PBR", "ITUB", "BBD", "ABEV", "MELI",
  "GFI", "AU", "NPN.JO", "SBK.JO",
  "AMX", "FMX", "CX", "GRUPOSAB.MX",
];

const WEALTHSIMPLE_POPULAR = [
  ...POPULAR_TECH_US,
  ...POPULAR_FINANCE_US,
  ...POPULAR_CONSUMER_US,
  ...POPULAR_HEALTHCARE_US,
  ...POPULAR_ENERGY_INDUSTRIALS_US,
  ...POPULAR_UTILITIES_MATERIALS_US,
  ...POPULAR_REITS_US,
  ...POPULAR_CANADA,
  ...POPULAR_EUROPE,
  ...POPULAR_ASIA,
  ...POPULAR_LATAM_AFRICA,
];

export const STOCK_CATEGORIES: Record<string, string[]> = {
  "Tech US": POPULAR_TECH_US,
  "Finance US": POPULAR_FINANCE_US,
  "Consommation US": POPULAR_CONSUMER_US,
  "Santé US": POPULAR_HEALTHCARE_US,
  "Énergie & Industrie US": POPULAR_ENERGY_INDUSTRIALS_US,
  "Utilities & Matériaux US": POPULAR_UTILITIES_MATERIALS_US,
  "REITs (immobilier) US": POPULAR_REITS_US,
  "Canada": POPULAR_CANADA,
  "Europe": POPULAR_EUROPE,
  "Asie": POPULAR_ASIA,
  "Amérique latine & Afrique": POPULAR_LATAM_AFRICA,
};

const TYPE_MAP: Record<string, string> = {
  EQUITY: "stock",
  ETF: "etf",
  CRYPTOCURRENCY: "crypto",
  INDEX: "index",
  MUTUALFUND: "stock",
  FUTURE: "stock",
};

// ─── GET /api/market/hours/:symbol ──────────────────────────────────────────
// Retourne les heures d'ouverture du marché pour un symbole donné et son statut
// actuel (ouvert / fermé). Ne dépend pas de Yahoo Finance.
router.get("/market/hours/:symbol", (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol ?? "").toUpperCase();
  if (!symbol) return res.status(400).json({ error: "symbol requis" });

  const exchange = getExchangeForSymbol(symbol);
  const result = isMarketOpen(symbol);

  // Heures d'ouverture (toujours 9h30–16h00 ET pour TSX et NASDAQ/NYSE)
  const openTime  = "09:30";
  const closeTime = "16:00";
  const timezone  = "America/New_York";

  // Crypto / forex / indices non supportés → marché considéré toujours "ouvert"
  // (les prix sont continus — pas d'horaire de bourse à afficher)
  if (exchange === "UNSUPPORTED") {
    return res.json({
      symbol,
      exchange,
      exchangeLabel: "24/7",
      open: true,
      message: "Cet actif se négocie en continu, sans horaire de bourse.",
      openTime: "00:00",
      closeTime: "23:59",
      timezone: "UTC",
      continuous: true,
    });
  }

  return res.json({
    symbol,
    exchange,
    exchangeLabel: result.exchangeLabel,
    open: result.open,
    message: result.message,
    openTime,
    closeTime,
    timezone,
    continuous: false,
  });
});

// ─── GET /api/market/closures ────────────────────────────────────────────────
// Prochaines fermetures de bourse (jours fériés complets + demi-journées à
// fermeture anticipée 13h00 ET) pour TSX et NASDAQ/NYSE. Ne dépend pas de
// Yahoo Finance — tout est calculé localement via lib/risk.ts.

export interface MarketClosure {
  date: string; // "YYYY-MM-DD" (heure de l'Est)
  kind: "holiday" | "early_close";
  exchanges: ("TSX" | "NASDAQ_NYSE")[];
  /** Nom du férié ou de la demi-journée (« Noël », « Action de grâce »…). */
  label: string;
  /** Pour les demi-journées : heure de fermeture anticipée, ET. */
  closesAt?: "13:00";
}

export function computeUpcomingClosures(todayKey: string, limit: number): MarketClosure[] {
  const year = Number(todayKey.slice(0, 4));
  const exchanges: ("TSX" | "NASDAQ_NYSE")[] = ["TSX", "NASDAQ_NYSE"];
  // Clé "date|kind" → bourse → libellé (le même jour peut porter un nom
  // différent selon la bourse, ex. Jour de la famille vs Presidents' Day).
  const map = new Map<string, Map<"TSX" | "NASDAQ_NYSE", string>>();
  const record = (d: string, kind: "holiday" | "early_close", ex: "TSX" | "NASDAQ_NYSE", label: string) => {
    if (d < todayKey) return;
    const key = `${d}|${kind}`;
    if (!map.has(key)) map.set(key, new Map());
    const byEx = map.get(key)!;
    if (!byEx.has(ex)) byEx.set(ex, label);
  };

  for (const y of [year, year + 1]) {
    for (const ex of exchanges) {
      for (const [d, label] of getMarketHolidaysWithNames(y, ex)) record(d, "holiday", ex, label);
      for (const [d, label] of getEarlyCloseDaysWithNames(y, ex)) record(d, "early_close", ex, label);
    }
  }

  return Array.from(map.entries())
    .map(([key, byEx]) => {
      const [date, kind] = key.split("|") as [string, "holiday" | "early_close"];
      const exs = exchanges.filter((ex) => byEx.has(ex));
      // Libellés distincts agrégés : « Jour de la famille (TSX) · Presidents' Day (NASDAQ/NYSE) »
      const uniqueLabels = Array.from(new Set(exs.map((ex) => byEx.get(ex)!)));
      const label =
        uniqueLabels.length === 1
          ? uniqueLabels[0]
          : exs
              .map((ex) => `${byEx.get(ex)!} (${ex === "TSX" ? "TSX" : "NASDAQ/NYSE"})`)
              .join(" · ");
      return {
        date,
        kind,
        exchanges: exs,
        label,
        ...(kind === "early_close" ? { closesAt: "13:00" as const } : {}),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

router.get("/market/closures", (req, res) => {
  // "Aujourd'hui" en heure de l'Est (les clés de risk.ts sont en ET)
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const todayKey = `${get("year")}-${get("month")}-${get("day")}`;

  const rawLimit = Number((req.query as { limit?: string }).limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 12;

  return res.json({
    asOf: todayKey,
    timezone: "America/New_York",
    closures: computeUpcomingClosures(todayKey, limit),
  });
});

// ─── GET /api/market/closure-warnings/:symbol ───────────────────────────────
// Avertissements contextuels pour le modal d'ordre : la bourse du symbole
// ferme-t-elle à 13h00 ET aujourd'hui (demi-journée), ou est-elle fermée le
// prochain jour ouvrable (férié) ? Non bloquant — purement informatif.

export interface ClosureWarning {
  kind: "early_close_today" | "holiday_next_business_day";
  exchange: "TSX" | "NASDAQ_NYSE";
  exchangeLabel: string;
  /** "YYYY-MM-DD" (heure de l'Est) du jour concerné. */
  date: string;
  /** Pour les demi-journées : heure de fermeture anticipée, ET. */
  closesAt?: "13:00";
}

export function computeClosureWarnings(symbol: string, now: Date = new Date()): ClosureWarning[] {
  const exchange = getExchangeForSymbol(symbol);
  // Crypto / forex / indices : pas d'horaire de bourse → aucun avertissement.
  if (exchange === "UNSUPPORTED") return [];

  const exchangeLabel = exchange === "TSX" ? "TSX (Toronto)" : "NASDAQ/NYSE";

  // Décomposer "maintenant" en heure de l'Est (les clés de risk.ts sont en ET)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  // Intl avec hour12:false peut renvoyer "24" à minuit — normaliser.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const todayKey = `${get("year")}-${get("month")}-${get("day")}`;

  // Calendriers sur deux ans pour couvrir le passage 31 déc → 1er janv.
  const holidays = new Set([
    ...getMarketHolidays(year, exchange),
    ...getMarketHolidays(year + 1, exchange),
  ]);
  const earlyCloseDays = new Set([
    ...getEarlyCloseDays(year, exchange),
    ...getEarlyCloseDays(year + 1, exchange),
  ]);

  const warnings: ClosureWarning[] = [];

  // 1. Demi-journée aujourd'hui — pertinent seulement avant 13h00 ET.
  const minutesSinceMidnight = hour * 60 + minute;
  if (earlyCloseDays.has(todayKey) && minutesSinceMidnight < 13 * 60) {
    warnings.push({
      kind: "early_close_today",
      exchange,
      exchangeLabel,
      date: todayKey,
      closesAt: "13:00",
    });
  }

  // 2. Férié le prochain jour ouvrable (lun–ven, week-ends sautés).
  //    Arithmétique en UTC sur la date-calendrier ET — aucun décalage de fuseau.
  const cursor = new Date(Date.UTC(year, month - 1, day));
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const nextKey = cursor.toISOString().slice(0, 10);
  if (holidays.has(nextKey)) {
    warnings.push({
      kind: "holiday_next_business_day",
      exchange,
      exchangeLabel,
      date: nextKey,
    });
  }

  return warnings;
}

router.get("/market/closure-warnings/:symbol", (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol ?? "").toUpperCase();
  if (!symbol) return res.status(400).json({ error: "symbol requis" });
  return res.json({ symbol, warnings: computeClosureWarnings(symbol) });
});

router.get("/market/overview", async (req, res) => {
  try {
    const allSymbols = [...INDICES, ...WEALTHSIMPLE_POPULAR];
    const allQuotes = await getQuotes(allSymbols);

    const indices = allQuotes.filter((q) => INDICES.includes(q.symbol));
    const popular = allQuotes.filter((q) => WEALTHSIMPLE_POPULAR.includes(q.symbol));

    const sortedByChange = [...popular].sort((a, b) => b.changePercent - a.changePercent);
    const topGainers = sortedByChange.filter((q) => q.changePercent > 0).slice(0, 5);
    const topLosers = [...sortedByChange].reverse().filter((q) => q.changePercent < 0).slice(0, 5);

    return res.json({
      indices,
      topGainers,
      topLosers,
      wealthsimplePopular: popular,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch market overview");
    return res.status(500).json({ error: "Failed to fetch market overview" });
  }
});

// Noms lisibles pour la recherche par mot-clé sur les symboles "maison"
// (indices, cryptos, matières premières) — Yahoo ne les indexe pas toujours
// bien dans son auto-complétion floue.
const CURATED_NAMES: Record<string, string> = {
  "^GSPC": "S&P 500",
  "^IXIC": "Nasdaq Composite",
  "^DJI": "Dow Jones Industrial Average",
  "^GSPTSX": "TSX Composite Toronto",
  "^RUT": "Russell 2000",
  "^VIX": "VIX indice de volatilité",
  "^FTSE": "FTSE 100 Londres",
  "^GDAXI": "DAX Allemagne Francfort",
  "^FCHI": "CAC 40 France Paris",
  "^STOXX50E": "Euro Stoxx 50",
  "^IBEX": "IBEX 35 Espagne Madrid",
  "^FTMIB": "FTSE MIB Italie Milan",
  "^AEX": "AEX Pays-Bas Amsterdam",
  "^SSMI": "SMI Suisse Zurich",
  "^N225": "Nikkei 225 Japon Tokyo",
  "^HSI": "Hang Seng Hong Kong",
  "^BSESN": "Sensex Inde Bombay",
  "^KS11": "KOSPI Corée du Sud Séoul",
  "^AXJO": "ASX 200 Australie",
  "^STI": "Straits Times Singapour",
  "^TWII": "Taiwan Weighted Taïwan",
  "^BVSP": "Bovespa Brésil",
  "^MXX": "IPC Mexique",
  "BTC-USD": "Bitcoin BTC crypto cryptomonnaie",
  "ETH-USD": "Ethereum ETH crypto cryptomonnaie",
  "SOL-USD": "Solana SOL crypto cryptomonnaie",
  "XRP-USD": "XRP Ripple crypto cryptomonnaie",
  "ADA-USD": "Cardano ADA crypto cryptomonnaie",
  "DOGE-USD": "Dogecoin DOGE crypto cryptomonnaie",
  "BNB-USD": "BNB Binance Coin crypto cryptomonnaie",
  "AVAX-USD": "Avalanche AVAX crypto cryptomonnaie",
  "LINK-USD": "Chainlink LINK crypto cryptomonnaie",
  "MATIC-USD": "Polygon MATIC crypto cryptomonnaie",
  "GC=F": "Or Gold matière première",
  "CL=F": "Pétrole brut Crude Oil WTI matière première",
  "SI=F": "Argent Silver matière première",
  "NG=F": "Gaz naturel Natural Gas matière première",
  "HG=F": "Cuivre Copper matière première",
  "ZC=F": "Maïs Corn matière première agricole",
  "ZW=F": "Blé Wheat matière première agricole",
  "EURUSD=X": "Euro Dollar américain EUR/USD devise",
  "USDCAD=X": "Dollar américain Dollar canadien USD/CAD devise",
  "GBPUSD=X": "Livre sterling Dollar américain GBP/USD devise",
  "JPY=X": "Dollar américain Yen japonais USD/JPY devise",
  // Nouveaux indices
  "^NYA": "NYSE Composite New York",
  "^XAX": "NYSE American Composite",
  "^OMXS30": "OMX Stockholm 30 Suède",
  "^OSEAX": "Oslo Bors Norvège",
  "^ATX": "ATX Autriche Vienne",
  "^BFX": "BEL 20 Belgique Bruxelles",
  "^PSI20": "PSI 20 Portugal Lisbonne",
  "^NSEI": "Nifty 50 Inde",
  "^JKSE": "Jakarta Composite Indonésie",
  "^KLSE": "FTSE Bursa Malaisie",
  "^NZ50": "NZX 50 Nouvelle-Zélande",
  "000001.SS": "SSE Composite Shanghai Chine",
  "399001.SZ": "SZSE Composite Shenzhen Chine",
  "^MERV": "Merval Argentine Buenos Aires",
  "^IPSA": "IPSA Chili Santiago",
  "^TA125.TA": "TA-125 Israël Tel Aviv",
  "^CASE30": "EGX 30 Égypte Le Caire",
  "^J203.JO": "JSE Top 40 Afrique du Sud",
  // Nouvelles cryptos
  "DOT-USD": "Polkadot DOT crypto cryptomonnaie",
  "LTC-USD": "Litecoin LTC crypto cryptomonnaie",
  "SHIB-USD": "Shiba Inu SHIB crypto cryptomonnaie",
  "TRX-USD": "Tron TRX crypto cryptomonnaie",
  "ATOM-USD": "Cosmos ATOM crypto cryptomonnaie",
  "UNI-USD": "Uniswap UNI crypto cryptomonnaie",
  "XLM-USD": "Stellar XLM crypto cryptomonnaie",
  "NEAR-USD": "Near Protocol NEAR crypto cryptomonnaie",
  "APT-USD": "Aptos APT crypto cryptomonnaie",
  "ARB-USD": "Arbitrum ARB crypto cryptomonnaie",
  // Nouvelles matières premières
  "ZS=F": "Soya Soybeans matière première agricole",
  "KC=F": "Café Coffee matière première agricole",
  "SB=F": "Sucre Sugar matière première agricole",
  "CT=F": "Coton Cotton matière première agricole",
  "PL=F": "Platine Platinum matière première",
  "PA=F": "Palladium matière première",
  "BZ=F": "Pétrole Brent Brent Crude matière première",
  "RB=F": "Essence RBOB Gasoline matière première",
  // Nouvelles devises
  "USDCHF=X": "Dollar américain Franc suisse USD/CHF devise",
  "AUDUSD=X": "Dollar australien Dollar américain AUD/USD devise",
  "NZDUSD=X": "Dollar néo-zélandais Dollar américain NZD/USD devise",
  "USDCNY=X": "Dollar américain Yuan chinois USD/CNY devise",
  "USDMXN=X": "Dollar américain Peso mexicain USD/MXN devise",
  "USDINR=X": "Dollar américain Roupie indienne USD/INR devise",
  "USDBRL=X": "Dollar américain Real brésilien USD/BRL devise",
  "EURGBP=X": "Euro Livre sterling EUR/GBP devise",
  "EURJPY=X": "Euro Yen japonais EUR/JPY devise",
  "EURCAD=X": "Euro Dollar canadien EUR/CAD devise",
};

function searchCurated(query: string): { symbol: string; name: string; type: string; exchange: string }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const allSymbols = [...INDICES, ...WEALTHSIMPLE_POPULAR];
  return allSymbols
    .filter((sym) => {
      const label = CURATED_NAMES[sym] ?? sym;
      return sym.toLowerCase().includes(q) || label.toLowerCase().includes(q);
    })
    .map((sym) => ({
      symbol: sym,
      name: CURATED_NAMES[sym] ?? sym,
      type: sym.startsWith("^") ? "index" : sym.endsWith("-USD") ? "crypto" : sym.endsWith("=F") ? "commodity" : sym.endsWith("=X") ? "currency" : "stock",
      exchange: "",
    }));
}

router.get("/market/search", async (req, res) => {
  const { q } = req.query as { q?: string };
  if (!q) return res.status(400).json({ error: "q query param required" });

  try {
    const seen = new Set<string>();
    const combined: { symbol: string; name: string; type: string; exchange: string }[] = [];

    // 1. Nos symboles connus (indices, cryptos, matières premières) — on les
    //    fait toujours passer en premier, comme ça tout ce qui est visible
    //    sur le tableau de bord est aussi toujours trouvable ici.
    for (const item of searchCurated(q)) {
      if (!seen.has(item.symbol)) {
        seen.add(item.symbol);
        combined.push(item);
      }
    }

    // 2. Auto-complétion floue de Yahoo (couvre le reste : actions, ETF, etc.)
    try {
      const results = await yahooFinance.search(q, { newsCount: 0 });
      for (const item of results.quotes ?? []) {
        const symbol = item.symbol ?? "";
        if (!symbol || seen.has(symbol)) continue;
        seen.add(symbol);
        combined.push({
          symbol,
          name: ("longname" in item && item.longname) ? item.longname : ("shortname" in item && item.shortname) ? item.shortname : symbol,
          type: ("quoteType" in item && item.quoteType) ? (TYPE_MAP[item.quoteType.toUpperCase()] ?? "stock") : "stock",
          exchange: ("exchange" in item && item.exchange) ? item.exchange : "",
        });
      }
    } catch (err) {
      req.log.warn({ err }, "Yahoo fuzzy search failed, falling back to curated + direct lookup only");
    }

    // 3. Filet de sécurité : si la personne tape un ticker exact que ni nos
    //    listes ni la recherche floue de Yahoo n'ont trouvé (ex: un ticker
    //    canadien ".TO" précis, ou un future peu connu), on tente une
    //    consultation directe du symbole tel quel.
    if (combined.length === 0) {
      const candidate = q.trim().toUpperCase();
      try {
        const quote = await yahooFinance.quote(candidate);
        if (quote?.symbol) {
          combined.push({
            symbol: quote.symbol,
            name: quote.longName ?? quote.shortName ?? quote.symbol,
            type: quote.quoteType ? (TYPE_MAP[String(quote.quoteType).toUpperCase()] ?? "stock") : "stock",
            exchange: quote.fullExchangeName ?? quote.exchange ?? "",
          });
        }
      } catch {
        // Rien trouvé même en direct — on renvoie une liste vide, c'est ok.
      }
    }

    return res.json(combined.slice(0, 15));
  } catch (err) {
    req.log.error({ err }, "Search failed");
    return res.status(500).json({ error: "Search failed" });
  }
});

export default router;
