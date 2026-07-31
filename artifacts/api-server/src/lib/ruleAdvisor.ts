/**
 * Conseiller de règles — « Suggestions de règles » pour l'Auto-Trader.
 * ─────────────────────────────────────────────────────────────────────────────
 * Moteur LOCAL, déterministe et GRATUIT (aucun appel réseau, aucune API payante).
 * À partir des données que le serveur possède déjà (positions, watchlist, règles
 * existantes, réglages de risque et scores de signaux déjà calculés), il propose
 * 2-3 règles d'auto-trading pertinentes en français.
 *
 * Le cœur `buildSuggestions()` est PUR : il reçoit ses données en entrée et ne
 * fait aucune I/O — la route se charge de rassembler ces données. Chaque
 * suggestion fournit un `prefill` complet au format de création de règle : elle
 * ne crée JAMAIS la règle elle-même, l'utilisateur confirme via le formulaire
 * habituel (toutes les validations s'appliquent alors).
 */

export interface AdvisorPosition {
  symbol: string;
  /** Valeur de marché de la position (unités × prix), dans sa devise. */
  value: number;
  currency?: string;
  /** Prix courant unitaire si connu (sert au dimensionnement conservateur). */
  price?: number | null;
}

export interface AdvisorSignal {
  score: number;            // -100 … +100
  overall?: string | null;  // ex. "FORT ACHAT"
  /**
   * Prix courant (dernière clôture des chandelles ayant servi au calcul du
   * signal). Requis pour dimensionner un achat de façon fail-closed : sans prix
   * valide et positif, aucune suggestion d'achat n'est émise.
   */
  price?: number | null;
}

export interface AdvisorExistingRule {
  symbol: string;
  sideMode: string;         // "buy" | "sell" | "both"
  enabled?: boolean;
  stopLossPct?: string | number | null;
  trailingStopPct?: string | number | null;
  openQuantity?: string | number | null;
}

export interface AdvisorInput {
  positions: AdvisorPosition[];
  /** Symboles de la watchlist (déjà normalisés en majuscules de préférence). */
  watchlistSymbols: string[];
  existingRules: AdvisorExistingRule[];
  /** Scores de signaux déjà calculés, indexés par symbole en MAJUSCULES. */
  signals: Map<string, AdvisorSignal>;
  riskSettings: { maxOrderValue: number; maxPortfolioExposure: number };
}

/** Payload de création de règle (sous-ensemble accepté par POST /auto-trader/rules). */
export interface RulePrefill {
  symbol: string;
  name: string;
  sideMode: "buy" | "sell" | "both";
  minScore: number;
  quantity: number;
  sizingMode: "fixed" | "risk";
  stopLossPct?: number;
  takeProfitPct?: number;
  trailingStopPct?: number;
  riskAmount?: number;
  maxTradesPerDay: number;
  cooldownMinutes: number;
  notifyOnSignal: boolean;
  aiReview: boolean;
}

export interface RuleSuggestion {
  /** Identifiant stable côté client (clé de liste, non persisté). */
  id: string;
  kind: "protect" | "entry" | "concentration";
  title: string;
  /** 1-2 phrases en français : pourquoi cette règle. */
  explanation: string;
  prefill: RulePrefill;
}

// ── Constantes conservatrices ────────────────────────────────────────────────
const STRONG_BUY_SCORE = 60;        // seuil « signal fort » pour suggérer un achat
const ENTRY_MIN_SCORE = 60;         // seuil d'entrée prudent pour la règle proposée
const PROTECT_STOP_LOSS_PCT = 8;    // stop-loss par défaut sur une position non protégée
const PROTECT_TRAILING_PCT = 12;    // trailing-stop par défaut (protection des gains)
const CONCENTRATION_PCT = 30;       // > 30 % du portefeuille = trop concentré
const MAX_SUGGESTIONS = 3;

function toNum(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Une position est « protégée » si une règle active porte un stop sur son symbole. */
function hasProtection(symbol: string, rules: AdvisorExistingRule[]): boolean {
  const sym = symbol.toUpperCase();
  return rules.some((r) => {
    if (r.symbol.toUpperCase() !== sym) return false;
    if (r.enabled === false) return false;
    const sl = toNum(r.stopLossPct);
    const ts = toNum(r.trailingStopPct);
    return (sl != null && sl > 0) || (ts != null && ts > 0);
  });
}

/** Existe-t-il déjà une règle pour ce symbole dans ce sens (évite les doublons) ? */
function hasRuleForSide(symbol: string, side: "buy" | "sell", rules: AdvisorExistingRule[]): boolean {
  const sym = symbol.toUpperCase();
  return rules.some((r) => {
    if (r.symbol.toUpperCase() !== sym) return false;
    const mode = (r.sideMode || "both").toLowerCase();
    return mode === side || mode === "both";
  });
}

/**
 * Quantité prudente pour un ACHAT, cohérente avec le plafond de risque configuré.
 * FAIL-CLOSED : retourne null (⇒ pas de suggestion) si le prix est inconnu /
 * non positif, ou si le budget prudent (25 % de maxOrderValue) ne permet même
 * pas 1 titre. On ne dépasse ainsi JAMAIS maxOrderValue et on ne suggère jamais
 * un achat sans prix fiable.
 */
function conservativeBuyQuantity(price: number | null | undefined, maxOrderValue: number): number | null {
  if (!price || !Number.isFinite(price) || price <= 0) return null;
  const budget = maxOrderValue * 0.25;
  const qty = Math.floor(budget / price);
  return qty >= 1 ? qty : null;
}

/**
 * Construit 2-3 suggestions de règles à partir des données fournies. Pur,
 * déterministe, sans I/O. Ne suggère jamais un doublon (même symbole + sens) et
 * respecte les garde-fous existants (stops déjà en place = pas de suggestion de
 * protection).
 */
export function buildSuggestions(input: AdvisorInput): RuleSuggestion[] {
  const { positions, watchlistSymbols, existingRules, signals, riskSettings } = input;
  const suggestions: RuleSuggestion[] = [];

  // Ensemble des couples (symbole|sens) déjà proposés dans CETTE réponse : garantit
  // qu'on n'émet jamais deux cartes pour le même symbole + sens (ex. positions
  // réparties sur plusieurs comptes).
  const proposed = new Set<string>();
  const markProposed = (symbol: string, side: "buy" | "sell") => proposed.add(`${symbol.toUpperCase()}|${side}`);
  const alreadyProposed = (symbol: string, side: "buy" | "sell") => proposed.has(`${symbol.toUpperCase()}|${side}`);

  // Agrégation des positions par symbole normalisé : un même titre détenu sur
  // plusieurs comptes est fusionné (valeur cumulée, prix conservé) avant analyse.
  const aggregated = new Map<string, AdvisorPosition>();
  for (const p of positions) {
    if (!(p.value > 0)) continue;
    const sym = p.symbol.toUpperCase();
    const existing = aggregated.get(sym);
    if (existing) {
      existing.value += p.value;
      if ((existing.price == null || existing.price <= 0) && p.price && p.price > 0) existing.price = p.price;
    } else {
      aggregated.set(sym, { symbol: sym, value: p.value, currency: p.currency, price: p.price ?? null });
    }
  }

  const totalPortfolio = [...aggregated.values()].reduce((s, p) => s + p.value, 0);
  const byValueDesc = [...aggregated.values()].sort((a, b) => b.value - a.value);

  // ── 1. Concentration : un symbole pèse > 30 % du portefeuille → limiter ─────
  // Traité en premier (priorité) : un symbole trop dominant reçoit une carte
  // « concentration » plutôt qu'une simple carte « protection ».
  const concentrated = new Set<string>();
  if (totalPortfolio > 0) {
    for (const pos of byValueDesc) {
      const sym = pos.symbol.toUpperCase();
      const pct = (pos.value / totalPortfolio) * 100;
      if (pct <= CONCENTRATION_PCT) continue;
      concentrated.add(sym);
      if (hasRuleForSide(sym, "sell", existingRules)) continue; // pas de doublon de sens
      if (alreadyProposed(sym, "sell")) continue;
      markProposed(sym, "sell");
      suggestions.push({
        id: `concentration-${sym}`,
        kind: "concentration",
        title: `Réduire le risque de concentration sur ${sym}`,
        explanation: `${sym} représente environ ${pct.toFixed(0)} % de votre portefeuille, c'est beaucoup. Cette règle de vente avec stop-loss ${PROTECT_STOP_LOSS_PCT} % aide à limiter le risque lié à une position trop dominante.`,
        prefill: {
          symbol: sym,
          name: `Limite de risque ${sym}`,
          sideMode: "sell",
          minScore: ENTRY_MIN_SCORE,
          quantity: 1,
          sizingMode: "fixed",
          stopLossPct: PROTECT_STOP_LOSS_PCT,
          maxTradesPerDay: 3,
          cooldownMinutes: 240,
          notifyOnSignal: true,
          aiReview: true,
        },
      });
    }
  }

  // ── 2. Positions détenues sans aucune protection → règle de stop (VENTE) ────
  for (const pos of byValueDesc) {
    const sym = pos.symbol.toUpperCase();
    if (concentrated.has(sym)) continue;               // déjà traité en concentration
    if (hasProtection(sym, existingRules)) continue;
    if (hasRuleForSide(sym, "sell", existingRules)) continue; // pas de doublon de sens
    if (alreadyProposed(sym, "sell")) continue;
    markProposed(sym, "sell");
    suggestions.push({
      id: `protect-${sym}`,
      kind: "protect",
      title: `Protéger votre position ${sym}`,
      explanation: `Vous détenez ${sym} sans stop de protection. Cette règle place un stop-loss à ${PROTECT_STOP_LOSS_PCT} % et un trailing-stop à ${PROTECT_TRAILING_PCT} % pour limiter les pertes et sécuriser les gains.`,
      prefill: {
        symbol: sym,
        name: `Protection ${sym}`,
        sideMode: "sell",
        minScore: ENTRY_MIN_SCORE,
        quantity: 1,
        sizingMode: "fixed",
        stopLossPct: PROTECT_STOP_LOSS_PCT,
        trailingStopPct: PROTECT_TRAILING_PCT,
        maxTradesPerDay: 3,
        cooldownMinutes: 240,
        notifyOnSignal: true,
        aiReview: true,
      },
    });
  }

  // ── 3. Watchlist avec signal fort et aucune règle d'achat → règle d'ACHAT ───
  const watchStrong = [...new Set(watchlistSymbols.map((s) => s.toUpperCase()))]
    .map((sym) => ({ sym, sig: signals.get(sym) }))
    .filter((x): x is { sym: string; sig: AdvisorSignal } =>
      !!x.sig && x.sig.score >= STRONG_BUY_SCORE)
    .sort((a, b) => b.sig.score - a.sig.score);
  for (const { sym, sig } of watchStrong) {
    if (hasRuleForSide(sym, "buy", existingRules)) continue;
    if (alreadyProposed(sym, "buy")) continue;
    // Prix courant : issu du calcul de signal (dernière clôture) ou, à défaut,
    // du prix d'une position détenue. FAIL-CLOSED : sans prix fiable, pas d'achat.
    const price = (sig.price != null && sig.price > 0)
      ? sig.price
      : (aggregated.get(sym)?.price ?? null);
    const qty = conservativeBuyQuantity(price, riskSettings.maxOrderValue);
    if (qty == null) continue; // prix inconnu / titre trop cher pour le plafond → on n'émet rien
    markProposed(sym, "buy");
    suggestions.push({
      id: `entry-${sym}`,
      kind: "entry",
      title: `Acheter ${sym} sur signal fort`,
      explanation: `${sym} est dans votre watchlist et affiche un signal technique fort (score ${sig.score}${sig.overall ? `, « ${sig.overall} »` : ""}). Cette règle d'achat prudente ne se déclenche qu'au-dessus d'un score de ${ENTRY_MIN_SCORE}, avec un stop-loss ${PROTECT_STOP_LOSS_PCT} %.`,
      prefill: {
        symbol: sym,
        name: `Achat ${sym}`,
        sideMode: "buy",
        minScore: ENTRY_MIN_SCORE,
        quantity: qty,
        sizingMode: "fixed",
        stopLossPct: PROTECT_STOP_LOSS_PCT,
        takeProfitPct: 15,
        maxTradesPerDay: 2,
        cooldownMinutes: 240,
        notifyOnSignal: true,
        aiReview: true,
      },
    });
  }

  // Priorité : limiter une concentration excessive, protéger l'existant, puis entrées.
  const order: Record<RuleSuggestion["kind"], number> = { concentration: 0, protect: 1, entry: 2 };
  suggestions.sort((a, b) => order[a.kind] - order[b.kind]);
  return suggestions.slice(0, MAX_SUGGESTIONS);
}
