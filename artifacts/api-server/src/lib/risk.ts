/**
 * Garde-fous de risque — appliqués à TOUT ordre, qu'il vienne d'un clic manuel
 * (boutons Acheter/Vendre) ou d'une future exécution automatisée par signal.
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce module ne connaît rien à SnapTrade ni à la route Express : il répond
 * uniquement à la question "cet ordre est-il acceptable ?" à partir de règles
 * de risque pures. C'est `orderEngine.submitOrder()` qui l'appelle avant de
 * jamais toucher au courtier.
 *
 * Limites connues documentées :
 *   - Les demi-journées de marché (ex. veille de Noël en mode early-close) ne
 *     sont pas gérées — SnapTrade rejettera l'ordre hors session si nécessaire.
 *   - La vente à découvert n'est pas supportée par Wealthsimple sur les comptes
 *     standard (REER, CELI, non enregistré sans marge) — le garde-fou
 *     d'exposition ne s'applique donc pas aux SELL (une vente réduit toujours
 *     une position longue existante, le courtier rejette si inexistante).
 */
import { db, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getQuotes } from "./yahoo";
import { logger } from "./logger";
import { getRiskSettings } from "./settings";

// ─── Configuration (modifiable depuis /parametres, repli sur l'environnement) ──
export async function getMaxOrderValue(): Promise<number> {
  return (await getRiskSettings()).maxOrderValue;
}
export async function getMaxPortfolioExposure(): Promise<number> {
  return (await getRiskSettings()).maxPortfolioExposure;
}

// ─── Détection de la bourse à partir du symbole ───────────────────────────────
// Les symboles sans suffixe (AAPL, MSFT…) sont supposés US-cotés (NASDAQ/NYSE).
// Les suffixes connus de bourses non nord-américaines → UNSUPPORTED.
// Les indices (^), futures (=F), forex (=X) et cryptos (-USD) ne sont pas
// exécutables via l'API SnapTrade/Wealthsimple.
export type Exchange = "TSX" | "NASDAQ_NYSE" | "UNSUPPORTED";

export function getExchangeForSymbol(symbol: string): Exchange {
  const upper = symbol.toUpperCase();

  // Indices boursiers (^GSPC, ^FTSE, ^N225…)
  if (upper.startsWith("^")) return "UNSUPPORTED";

  // Futures (GC=F, CL=F…) et Forex (EURUSD=X…)
  if (upper.endsWith("=F") || upper.endsWith("=X")) return "UNSUPPORTED";

  // Cryptos — Wealthsimple supporte BTC/ETH etc. mais pas via l'API SnapTrade
  // du même chemin que les actions ; exclus pour l'instant.
  if (/-USD$|-CAD$|-EUR$|-GBP$/.test(upper)) return "UNSUPPORTED";

  // Bourses canadiennes (TSX, TSXV, NEO, CSE)
  if (/\.(TO|V|NE|CN)$/.test(upper)) return "TSX";

  // Bourses européennes
  if (/\.(DE|PA|L|SW|AS|MI|MC|BR|LS|ST|CO|OL|HE|VI|PR|WA|AT|IR|VX|AMS)$/.test(upper)) {
    return "UNSUPPORTED";
  }

  // Bourses asiatiques et Pacifique
  if (/\.(T|KS|KQ|HK|NS|BO|SS|SZ|AX|SI|KL|BK|TW|JK|NZ)$/.test(upper)) {
    return "UNSUPPORTED";
  }

  // Afrique / Moyen-Orient
  if (/\.(JO|TA)$/.test(upper)) return "UNSUPPORTED";

  // Mexique coté localement
  if (/\.MX$/.test(upper)) return "UNSUPPORTED";

  // Tout le reste est considéré US-coté (NASDAQ/NYSE/NYSE American/OTC)
  // — couvre les ADR comme BABA, TSM, PBR, VALE qui sont sur NYSE.
  return "NASDAQ_NYSE";
}

/** Renvoie true si le symbole est exécutable via Wealthsimple/SnapTrade. */
export function isSymbolTradeable(symbol: string): boolean {
  return getExchangeForSymbol(symbol) !== "UNSUPPORTED";
}

// ─── Jours fériés boursiers ───────────────────────────────────────────────────
// TSX et NASDAQ/NYSE ont des calendriers légèrement différents.
// Implémentation : jours fériés fixes + flottants via formules.

function toKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Jour observé : dimanche → lundi suivant ; samedi → vendredi précédent. */
function observed(d: Date): Date {
  const dow = d.getDay();
  if (dow === 0) return addDays(d, 1);
  if (dow === 6) return addDays(d, -1);
  return d;
}

/** Nième occurrence d'un jour de semaine dans un mois (weekday : 0=dim … 6=sam ; n : 1-based). */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month - 1, 1).getDay();
  const day = ((weekday - first + 7) % 7) + 1 + (n - 1) * 7;
  return new Date(year, month - 1, day);
}

/** Dernière occurrence d'un jour de semaine dans un mois. */
function lastWeekday(year: number, month: number, weekday: number): Date {
  const lastDay = new Date(year, month, 0);
  const day = lastDay.getDate() - ((lastDay.getDay() - weekday + 7) % 7);
  return new Date(year, month - 1, day);
}

/** Easter Sunday (algorithme de Meeus/Jones/Butcher). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Victoria Day (CA) : dernier lundi avant ou le lundi 24 mai. */
function victoriaDay(year: number): Date {
  const may24 = new Date(year, 4, 24);
  const dow = may24.getDay(); // 0=dim
  const daysBack = dow === 1 ? 0 : (dow === 0 ? 6 : dow - 1);
  return new Date(year, 4, 24 - daysBack);
}

/**
 * Retourne l'ensemble des jours fériés boursiers pour une année donnée.
 * Chaque entrée est au format "YYYY-MM-DD" en heure locale (ET).
 */
export function getMarketHolidays(year: number, exchange: "TSX" | "NASDAQ_NYSE"): Set<string> {
  const holidays = new Set<string>();
  const add = (d: Date) => holidays.add(toKey(d));

  // ── Commun aux deux bourses ────────────────────────────────────────────────
  // Nouvel An
  add(observed(new Date(year, 0, 1)));
  // Good Friday (vendredi précédant Pâques)
  add(addDays(easterSunday(year), -2));

  // ── NASDAQ / NYSE ─────────────────────────────────────────────────────────
  if (exchange === "NASDAQ_NYSE") {
    // Martin Luther King Jr. Day — 3e lundi de janvier
    add(nthWeekday(year, 1, 1, 3));
    // Presidents' Day — 3e lundi de février
    add(nthWeekday(year, 2, 1, 3));
    // Memorial Day — dernier lundi de mai
    add(lastWeekday(year, 5, 1));
    // Juneteenth (depuis 2021)
    if (year >= 2021) add(observed(new Date(year, 5, 19)));
    // Independence Day
    add(observed(new Date(year, 6, 4)));
    // Labor Day — 1er lundi de septembre
    add(nthWeekday(year, 9, 1, 1));
    // Thanksgiving US — 4e jeudi de novembre
    add(nthWeekday(year, 11, 4, 4));
    // Noël
    add(observed(new Date(year, 11, 25)));
  }

  // ── TSX ──────────────────────────────────────────────────────────────────
  if (exchange === "TSX") {
    // Family Day (Ontario / TSX) — 3e lundi de février
    add(nthWeekday(year, 2, 1, 3));
    // Victoria Day
    add(victoriaDay(year));
    // Fête du Canada — 1er juillet, observé
    add(observed(new Date(year, 6, 1)));
    // Civic Holiday — 1er lundi d'août
    add(nthWeekday(year, 8, 1, 1));
    // Labour Day CA — 1er lundi de septembre
    add(nthWeekday(year, 9, 1, 1));
    // Action de grâce CA — 2e lundi d'octobre
    add(nthWeekday(year, 10, 1, 2));
    // Noël
    const christmas = new Date(year, 11, 25);
    add(observed(christmas));
    // Lendemain de Noël (Boxing Day) — avec gestion des collisions
    const christmasDow = christmas.getDay();
    let boxingDay: Date;
    if (christmasDow === 5) {
      // Noël vendredi : BD samedi → lundi 28
      boxingDay = new Date(year, 11, 28);
    } else if (christmasDow === 6) {
      // Noël samedi (observé vendredi) : BD dimanche → lundi 28
      boxingDay = new Date(year, 11, 28);
    } else if (christmasDow === 0) {
      // Noël dimanche (observé lundi 26) : BD lundi 26 déjà pris → mardi 27
      boxingDay = new Date(year, 11, 27);
    } else {
      // Cas normaux
      boxingDay = observed(new Date(year, 11, 26));
    }
    add(boxingDay);
  }

  return holidays;
}

export interface MarketHoursResult {
  open: boolean;
  exchange: Exchange;
  exchangeLabel: string;
  message: string;
}

/**
 * Vérifie si le marché est ouvert pour un symbole donné, à un instant donné.
 * Gère : week-ends, heures d'ouverture (9h30–16h00 ET), jours fériés.
 * Ne gère pas les demi-journées de marché (early-close).
 */
export function isMarketOpen(symbol: string, now: Date = new Date()): MarketHoursResult {
  const exchange = getExchangeForSymbol(symbol);

  // Symboles non supportés → marché "fermé" (ils ne doivent de toute façon pas
  // passer le contrôle d'exchange dans checkOrderRisk)
  if (exchange === "UNSUPPORTED") {
    return {
      open: false,
      exchange,
      exchangeLabel: "Bourse non supportée",
      message: `Le symbole ${symbol} est coté sur une bourse non supportée par Wealthsimple via SnapTrade.`,
    };
  }

  const exchangeLabel = exchange === "TSX" ? "TSX (Toronto)" : "NASDAQ/NYSE";

  // Décomposer l'heure en fuseau Eastern (ET = America/New_York)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday");
  const year = Number(get("year"));
  const month = get("month"); // "01"–"12"
  const day = get("day");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  // Week-end
  const isWeekday = !["Sat", "Sun"].includes(weekday);

  // Jour férié
  const dateKey = `${year}-${month}-${day}`;
  const holidays = getMarketHolidays(year, exchange);
  const isHoliday = holidays.has(dateKey);

  // Heures de marché : 9h30–16h00 ET (identiques pour TSX et NASDAQ/NYSE)
  const minutesSinceMidnight = hour * 60 + minute;
  const openAt = 9 * 60 + 30;
  const closeAt = 16 * 60;
  const withinHours = minutesSinceMidnight >= openAt && minutesSinceMidnight < closeAt;

  const open = isWeekday && !isHoliday && withinHours;

  let message: string;
  if (!isWeekday) {
    message = `${exchangeLabel} est fermé le week-end. Réessayez du lundi au vendredi pendant les heures d'ouverture (9h30–16h00, heure de l'Est).`;
  } else if (isHoliday) {
    message = `${exchangeLabel} est fermé aujourd'hui (jour férié boursier). Réessayez le prochain jour ouvrable.`;
  } else if (!withinHours) {
    message = `${exchangeLabel} est fermé en ce moment. Heures d'ouverture : 9h30–16h00, heure de l'Est, du lundi au vendredi.`;
  } else {
    message = `${exchangeLabel} est ouvert.`;
  }

  return { open, exchange, exchangeLabel, message };
}

// ─── Positions réelles du courtier ───────────────────────────────────────────
/** Position broker normalisée, passée depuis submitOrder() en mode live. */
export interface BrokerPosition {
  symbol: string;   // ticker en majuscules
  units: number;    // unités détenues (> 0 = position longue)
  currency: string; // "USD" | "CAD" etc.
  price: number;    // prix courant selon le courtier
}

// ─── Exposition du portefeuille ───────────────────────────────────────────────
/**
 * Calcule l'exposition actuelle par devise.
 *
 * En mode live avec des positions réelles disponibles : utilise les positions
 * du courtier comme source de vérité pour éviter toute dérive si des trades
 * sont effectués directement dans l'app Wealthsimple en dehors du système.
 *
 * En mode paper ou si les positions broker sont indisponibles : calcule la
 * position nette à partir de l'historique des ordres en base.
 */
export async function getCurrentExposureByCurrency(
  mode: "paper" | "live",
  brokerPositions?: BrokerPosition[] | null,
): Promise<Record<string, number>> {
  // Positions réelles disponibles (mode live) → source de vérité
  if (mode === "live" && brokerPositions && brokerPositions.length > 0) {
    const exposureByCurrency: Record<string, number> = {};
    for (const pos of brokerPositions) {
      if (pos.units <= 0 || pos.price <= 0) continue;
      const currency = (pos.currency ?? "USD").toUpperCase();
      exposureByCurrency[currency] = (exposureByCurrency[currency] ?? 0) + pos.units * pos.price;
    }
    return exposureByCurrency;
  }

  // Fallback : calcul à partir de la table orders (paper mode ou positions indisponibles)
  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.mode, mode));

  const relevant = orders.filter((o) =>
    ["simulated", "submitted", "filled", "partially_filled"].includes(o.status),
  );
  if (relevant.length === 0) return {};

  // Position nette (en unités) par symbole
  const netUnitsBySymbol = new Map<string, number>();
  for (const o of relevant) {
    const qty = Number(o.filledQuantity ?? o.quantity ?? 0);
    const signed = o.side.toUpperCase() === "BUY" ? qty : -qty;
    netUnitsBySymbol.set(o.symbol, (netUnitsBySymbol.get(o.symbol) ?? 0) + signed);
  }

  const symbols = [...netUnitsBySymbol.keys()].filter((s) => (netUnitsBySymbol.get(s) ?? 0) !== 0);
  if (symbols.length === 0) return {};

  let quotes: Awaited<ReturnType<typeof getQuotes>> = [];
  try {
    quotes = await getQuotes(symbols);
  } catch (err) {
    logger.error({ err }, "risk: failed to fetch quotes for exposure calculation");
    // En cas d'échec de récupération des prix, refuser plutôt que sous-estimer le risque.
    throw new Error(
      "Impossible de calculer l'exposition du portefeuille (prix indisponibles). Ordre refusé par prudence.",
    );
  }

  const priceBySymbol = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));
  const exposureByCurrency: Record<string, number> = {};
  for (const symbol of symbols) {
    const units = netUnitsBySymbol.get(symbol) ?? 0;
    const quote = priceBySymbol.get(symbol.toUpperCase());
    if (!quote) {
      // getQuotes() intercepte les erreurs Yahoo et renvoie simplement moins de
      // cotations : une position sans prix ignorée sous-estimerait l'exposition
      // et laisserait passer un BUY dangereux. Refus ferme (fail closed).
      logger.error({ symbol }, "risk: missing quote for open position during exposure calculation");
      throw new Error(
        `Impossible de calculer l'exposition du portefeuille (prix indisponible pour ${symbol}). ` +
          "Ordre refusé par prudence.",
      );
    }
    const value = Math.abs(units) * quote.price;
    exposureByCurrency[quote.currency] = (exposureByCurrency[quote.currency] ?? 0) + value;
  }
  return exposureByCurrency;
}

// ─── Validation centrale ───────────────────────────────────────────────────────
export interface RiskCheckInput {
  signalId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  mode: "paper" | "live";
  /**
   * Positions réelles retournées par le courtier — à passer en mode live pour
   * calculer l'exposition exacte plutôt que de se baser sur l'historique orders.
   * Si absent ou null, le calcul d'exposition se base sur la table orders.
   */
  brokerPositions?: BrokerPosition[] | null;
}

export type RiskCheckResult =
  | { ok: true; livePrice: number; currency: string; orderValue: number }
  | { ok: false; reason: string; message: string; details: Record<string, unknown> };

/**
 * Valide un ordre contre les garde-fous de risque. Ne touche jamais au
 * courtier — se contente de répondre "accepté" ou "refusé + raison".
 *
 * Pipeline de validation (dans l'ordre) :
 *   1. Bourse supportée (TSX / NASDAQ-NYSE uniquement)
 *   2. Heures de marché + week-end + jours fériés
 *   3. Prix courant réel (jamais le prix fourni par le client)
 *   4. Limite de valeur par ordre (MAX_ORDER_VALUE, défaut 5 000 $)
 *   5. Limite d'exposition totale du portefeuille (MAX_PORTFOLIO_EXPOSURE,
 *      défaut 25 000 $) — BUY uniquement ; une SELL réduit l'exposition
 *      et Wealthsimple rejette les ventes à découvert de son côté.
 */
export async function checkOrderRisk(input: RiskCheckInput): Promise<RiskCheckResult> {
  const { symbol, side, quantity, mode, brokerPositions } = input;

  // 1) Bourse supportée
  const exchange = getExchangeForSymbol(symbol);
  if (exchange === "UNSUPPORTED") {
    return {
      ok: false,
      reason: "exchange_not_supported",
      message:
        `Le symbole ${symbol} est coté sur une bourse non supportée par Wealthsimple ` +
        `(indices, futures, forex, cryptos hors SnapTrade, bourses européennes/asiatiques). ` +
        `Seuls les titres cotés sur TSX, NASDAQ et NYSE sont exécutables.`,
      details: { symbol },
    };
  }

  // 2) Heures de marché (week-end + hors session + jours fériés)
  const hours = isMarketOpen(symbol);
  if (!hours.open) {
    return {
      ok: false,
      reason: "market_closed",
      message: hours.message,
      details: { exchange: hours.exchange },
    };
  }

  // 3) Prix courant réel (jamais celui fourni par le client)
  const quotes = await getQuotes([symbol]);
  const quote = quotes.find((q) => q.symbol.toUpperCase() === symbol.toUpperCase());
  if (!quote) {
    return {
      ok: false,
      reason: "price_unavailable",
      message: `Prix courant introuvable pour ${symbol}. Ordre refusé par prudence.`,
      details: {},
    };
  }

  const orderValue = quantity * quote.price;

  // 4) Limite de valeur par ordre
  const maxOrderValue = await getMaxOrderValue();
  if (orderValue > maxOrderValue) {
    return {
      ok: false,
      reason: "order_value_exceeded",
      message:
        `Ordre refusé : la valeur (${quote.currency}${orderValue.toFixed(2)}) dépasse la limite ` +
        `autorisée de ${quote.currency}${maxOrderValue.toFixed(2)} par ordre. Vérifiez la quantité saisie.`,
      details: { orderValue, maxOrderValue, currency: quote.currency, quantity, price: quote.price },
    };
  }

  // 5) Limite d'exposition totale du portefeuille — BUY uniquement.
  //    Note : Wealthsimple ne supporte pas la vente à découvert sur les comptes
  //    standard. Une SELL réduit toujours une position longue existante ; si la
  //    position est inexistante, le courtier rejettera l'ordre de son côté.
  if (side === "BUY") {
    const exposureByCurrency = await getCurrentExposureByCurrency(mode, brokerPositions);
    const currentExposure = exposureByCurrency[quote.currency] ?? 0;
    const projectedExposure = currentExposure + orderValue;
    const maxExposure = await getMaxPortfolioExposure();
    if (projectedExposure > maxExposure) {
      return {
        ok: false,
        reason: "portfolio_exposure_exceeded",
        message:
          `Ordre refusé : l'exposition totale du portefeuille en ${quote.currency} passerait de ` +
          `${quote.currency}${currentExposure.toFixed(2)} à ${quote.currency}${projectedExposure.toFixed(2)}, ` +
          `au-delà de la limite de ${quote.currency}${maxExposure.toFixed(2)}.`,
        details: { currentExposure, projectedExposure, maxExposure, currency: quote.currency },
      };
    }
  }

  return { ok: true, livePrice: quote.price, currency: quote.currency, orderValue };
}
