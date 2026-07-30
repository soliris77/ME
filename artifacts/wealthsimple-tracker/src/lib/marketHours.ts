/**
 * Détermination du statut d'ouverture des marchés côté client.
 * ─────────────────────────────────────────────────────────────────────────────
 * Miroir simplifié de isMarketOpen() du backend (risk.ts).
 * Utilisé dans le tableau de bord pour classer les actifs en :
 *   - "continuous"  : 24/7 (crypto, futures, forex, indices)
 *   - "open"        : marché actuellement ouvert
 *   - "closed"      : marché actuellement fermé
 *
 * Règles : NYSE/NASDAQ et TSX → lundi–vendredi 9h30–16h00 heure de New York.
 * Les jours fériés exacts ne sont pas calculés côté client — le backend
 * (/api/market/hours/:symbol) est la source de vérité pour les fiches détail.
 */

import { getExchangeForSymbol } from "@/lib/tradeability";

export type MarketSessionStatus = "continuous" | "open" | "closed";

/** Renvoie { dow, totalMinutes } en heure America/New_York. */
function getETTime(): { dow: number; totalMinutes: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
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

/** Statut d'ouverture pour NYSE/NASDAQ et TSX (mêmes horaires). */
function usEquityStatus(): MarketSessionStatus {
  const { dow, totalMinutes } = getETTime();
  if (dow === 0 || dow === 6) return "closed";               // week-end
  const openAt  = 9 * 60 + 30;   // 9h30 ET
  const closeAt = 16 * 60;       // 16h00 ET
  return totalMinutes >= openAt && totalMinutes < closeAt ? "open" : "closed";
}

/** Statut d'ouverture d'un symbole quelconque. */
export function getSymbolMarketStatus(symbol: string): MarketSessionStatus {
  const exchange = getExchangeForSymbol(symbol);
  if (exchange === "UNSUPPORTED") return "continuous";
  return usEquityStatus();
}

/** Statut global NYSE/NASDAQ (et TSX — mêmes horaires). */
export function getUSMarketStatus(): MarketSessionStatus {
  return usEquityStatus();
}

/**
 * Minuterie : heure restante avant ouverture ou fermeture.
 * Retourne une chaîne lisible, ex. "Ferme dans 2h 15min" ou "Ouvre dans 45min".
 */
export function getNextMarketEvent(): string {
  const { dow, totalMinutes } = getETTime();

  const openAt  = 9 * 60 + 30;
  const closeAt = 16 * 60;

  // Week-end
  if (dow === 6) {
    const minsToMonday = (2 * 24 * 60) + openAt;
    return `Ouvre lundi à 9h30 ET (dans ${Math.round(minsToMonday / 60)}h)`;
  }
  if (dow === 0) {
    const minsToMonday = (1 * 24 * 60) + openAt;
    return `Ouvre lundi à 9h30 ET (dans ${Math.round(minsToMonday / 60)}h)`;
  }

  if (totalMinutes < openAt) {
    const diff = openAt - totalMinutes;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return `Ouvre dans ${h > 0 ? h + "h " : ""}${m > 0 ? m + "min" : ""}`;
  }

  if (totalMinutes < closeAt) {
    const diff = closeAt - totalMinutes;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return `Ferme dans ${h > 0 ? h + "h " : ""}${m > 0 ? m + "min" : ""}`;
  }

  // Après 16h — si vendredi, pas de réouverture avant lundi
  if (dow === 5) {
    return `Reprend lundi à 9h30 ET`;
  }
  const diff = (24 * 60 - totalMinutes) + openAt;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `Ouvre demain dans ${h > 0 ? h + "h " : ""}${m > 0 ? m + "min" : ""}`;
}

/** Labels et label court pour un exchange donné. */
export function getExchangeLabel(symbol: string): string {
  const exchange = getExchangeForSymbol(symbol);
  if (exchange === "TSX") return "TSX";
  if (exchange === "NASDAQ_NYSE") return "NYSE/NASDAQ";
  return "Continu";
}
