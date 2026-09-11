/**
 * Détermination du statut d'ouverture des marchés côté client.
 * ─────────────────────────────────────────────────────────────────────────────
 * Catégories :
 *   "continuous" : 24/7 (crypto) ou 24/5 (forex, futures) — pas d'horaire fixe
 *   "open"       : marché actuellement en séance
 *   "closed"     : marché actuellement fermé
 *
 * Les jours fériés exacts ne sont pas calculés ici — le backend
 * (/api/market/hours/:symbol) est la source de vérité pour les fiches détail.
 */

import { getExchangeForSymbol } from "@workspace/tradeability";

export type MarketSessionStatus = "continuous" | "open" | "closed";

// ─── Utilitaire : heure locale dans un fuseau horaire ─────────────────────────

function getTimeInTZ(tz: string): { dow: number; totalMinutes: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour    = parseInt(parts.find((p) => p.type === "hour")?.value    ?? "0", 10);
  const minute  = parseInt(parts.find((p) => p.type === "minute")?.value  ?? "0", 10);

  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dow: dowMap[weekday] ?? 1, totalMinutes: hour * 60 + minute };
}

function checkExchangeStatus(
  tz: string,
  openAt: number,
  closeAt: number,
): "open" | "closed" {
  const { dow, totalMinutes } = getTimeInTZ(tz);
  if (dow === 0 || dow === 6) return "closed";
  return totalMinutes >= openAt && totalMinutes < closeAt ? "open" : "closed";
}

function buildNextEvent(tz: string, openAt: number, closeAt: number): string {
  const { dow, totalMinutes } = getTimeInTZ(tz);

  const fmt = (diff: number) => {
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    if (h > 0 && m > 0) return `${h}h ${m}min`;
    if (h > 0) return `${h}h`;
    return `${m}min`;
  };

  if (dow === 6) return `Ouvre lundi`;
  if (dow === 0) return `Ouvre lundi`;

  if (totalMinutes < openAt)   return `Ouvre dans ${fmt(openAt - totalMinutes)}`;
  if (totalMinutes < closeAt)  return `Ferme dans ${fmt(closeAt - totalMinutes)}`;
  if (dow === 5)               return `Reprend lundi`;
  return `Ouvre demain dans ${fmt((24 * 60 - totalMinutes) + openAt)}`;
}

// ─── Définitions des bourses ──────────────────────────────────────────────────

export interface ExchangeDef {
  id: string;
  name: string;
  location: string;
  flag: string;
  tz: string;
  openAt: number;   // minutes depuis minuit heure locale
  closeAt: number;
  hoursLabel: string;
  symbols: string[];
}

export const EXCHANGES: ExchangeDef[] = [
  {
    id: "nyse_nasdaq",
    name: "NYSE / NASDAQ",
    location: "New York, É.-U.",
    flag: "🇺🇸",
    tz: "America/New_York",
    openAt:  9 * 60 + 30,
    closeAt: 16 * 60,
    hoursLabel: "9h30 – 16h00 ET",
    symbols: ["AAPL", "MSFT", "NVDA", "AMZN", "META", "TSLA", "GOOG"],
  },
  {
    id: "tsx",
    name: "TSX",
    location: "Toronto, Canada",
    flag: "🇨🇦",
    tz: "America/New_York",
    openAt:  9 * 60 + 30,
    closeAt: 16 * 60,
    hoursLabel: "9h30 – 16h00 ET",
    symbols: ["RY.TO", "TD.TO", "SHOP.TO", "ENB.TO", "CNR.TO", "BNS.TO"],
  },
  {
    id: "lse",
    name: "LSE",
    location: "Londres, R.-U.",
    flag: "🇬🇧",
    tz: "Europe/London",
    openAt:  8 * 60,
    closeAt: 16 * 60 + 30,
    hoursLabel: "8h00 – 16h30 GMT",
    symbols: ["AZN.L", "HSBA.L", "SHEL.L", "ULVR.L", "BP.L", "GSK.L"],
  },
  {
    id: "xetra_euronext",
    name: "Euronext / XETRA",
    location: "Paris · Francfort",
    flag: "🇪🇺",
    tz: "Europe/Paris",
    openAt:  9 * 60,
    closeAt: 17 * 60 + 30,
    hoursLabel: "9h00 – 17h30 CET",
    symbols: ["MC.PA", "SAP.DE", "ASML.AS", "OR.PA", "SIE.DE", "TTE.PA"],
  },
  {
    id: "tse",
    name: "TSE (Tokyo)",
    location: "Tokyo, Japon",
    flag: "🇯🇵",
    tz: "Asia/Tokyo",
    openAt:  9 * 60,
    closeAt: 15 * 60 + 30,
    hoursLabel: "9h00 – 15h30 JST",
    symbols: ["7203.T", "9984.T", "6758.T", "8306.T", "6501.T"],
  },
  {
    id: "hkex",
    name: "HKEX",
    location: "Hong Kong",
    flag: "🇭🇰",
    tz: "Asia/Hong_Kong",
    openAt:  9 * 60 + 30,
    closeAt: 16 * 60,
    hoursLabel: "9h30 – 16h00 HKT",
    symbols: ["0700.HK", "9988.HK", "0941.HK", "1299.HK", "0388.HK"],
  },
  {
    id: "asx",
    name: "ASX",
    location: "Sydney, Australie",
    flag: "🇦🇺",
    tz: "Australia/Sydney",
    openAt:  10 * 60,
    closeAt: 16 * 60,
    hoursLabel: "10h00 – 16h00 AEST",
    symbols: ["BHP.AX", "CBA.AX", "CSL.AX", "ANZ.AX", "WBC.AX"],
  },
  {
    id: "bse_nse",
    name: "BSE / NSE",
    location: "Mumbai, Inde",
    flag: "🇮🇳",
    tz: "Asia/Kolkata",
    openAt:  9 * 60 + 15,
    closeAt: 15 * 60 + 30,
    hoursLabel: "9h15 – 15h30 IST",
    symbols: ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS"],
  },
  {
    id: "bovespa",
    name: "B3 (Bovespa)",
    location: "São Paulo, Brésil",
    flag: "🇧🇷",
    tz: "America/Sao_Paulo",
    openAt:  10 * 60,
    closeAt: 17 * 60 + 55,
    hoursLabel: "10h00 – 17h55 BRT",
    symbols: ["VALE", "ITUB", "PBR", "ABEV", "MELI", "BBD"],
  },
  {
    id: "jse",
    name: "JSE",
    location: "Johannesburg, Afr. du S.",
    flag: "🇿🇦",
    tz: "Africa/Johannesburg",
    openAt:  9 * 60,
    closeAt: 17 * 60,
    hoursLabel: "9h00 – 17h00 SAST",
    symbols: ["NPN.JO", "GFI", "AU", "SBK.JO"],
  },
];

/** Statut ouvert/fermé pour une bourse donnée. */
export function getExchangeOpenStatus(ex: ExchangeDef): "open" | "closed" {
  return checkExchangeStatus(ex.tz, ex.openAt, ex.closeAt);
}

/** Prochain événement (ex. "Ferme dans 2h 15min"). */
export function getExchangeNextEvent(ex: ExchangeDef): string {
  return buildNextEvent(ex.tz, ex.openAt, ex.closeAt);
}

// ─── Compatibilité avec le code existant ─────────────────────────────────────

/** Renvoie { dow, totalMinutes } en heure America/New_York. */
function getETTime(): { dow: number; totalMinutes: number } {
  return getTimeInTZ("America/New_York");
}

function usEquityStatus(): MarketSessionStatus {
  const { dow, totalMinutes } = getETTime();
  if (dow === 0 || dow === 6) return "closed";
  const openAt  = 9 * 60 + 30;
  const closeAt = 16 * 60;
  return totalMinutes >= openAt && totalMinutes < closeAt ? "open" : "closed";
}

export function getSymbolMarketStatus(symbol: string): MarketSessionStatus {
  const exchange = getExchangeForSymbol(symbol);
  if (exchange === "UNSUPPORTED") return "continuous";
  return usEquityStatus();
}

export function getUSMarketStatus(): MarketSessionStatus {
  return usEquityStatus();
}

export function getNextMarketEvent(): string {
  const nyse = EXCHANGES.find((e) => e.id === "nyse_nasdaq")!;
  return buildNextEvent(nyse.tz, nyse.openAt, nyse.closeAt);
}

export function getExchangeLabel(symbol: string): string {
  const exchange = getExchangeForSymbol(symbol);
  if (exchange === "TSX") return "TSX";
  if (exchange === "NASDAQ_NYSE") return "NYSE/NASDAQ";
  return "Continu";
}
