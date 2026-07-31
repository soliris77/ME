/**
 * Vue « risque global » — calculs purs, lecture seule.
 * ─────────────────────────────────────────────────────────────────────────────
 * Répond à la question : « combien je perds si TOUS les stops actifs sont
 * touchés le même jour ? » et « comment mon exposition se répartit ? ».
 *
 * Sources de stops considérées :
 *  - Positions suivies par l'auto-trader (openEntryPrice/openQuantity) avec
 *    stop-loss fixe et/ou trailing stop — même logique que checkProtectiveExits.
 *  - Ordres stop de protection soumis au courtier encore actifs
 *    (orders.orderType = "stop", statut pending/submitted, expectedPrice = stopPrice).
 *
 * Aucune écriture : ce module ne touche jamais à la base ni au courtier.
 */

export interface StopPositionInput {
  source: "auto_trader" | "stop_order";
  /** id de la règle auto-trader ou de l'ordre stop */
  refId: number;
  symbol: string;
  quantity: number;
  /** prix d'entrée (auto-trader) — null pour un ordre stop courtier */
  entryPrice: number | null;
  /** prix actuel du marché (null si cotation indisponible) */
  currentPrice: number | null;
  /** % de stop-loss fixe sous l'entrée (auto-trader) */
  stopLossPct: number | null;
  /** % de trailing stop sous le plus-haut (auto-trader) */
  trailingStopPct: number | null;
  /** plus-haut atteint depuis l'entrée (auto-trader) */
  highWaterMark: number | null;
  /** prix stop explicite (ordre stop courtier) */
  stopPrice: number | null;
}

export interface StopPositionRisk {
  source: "auto_trader" | "stop_order";
  refId: number;
  symbol: string;
  quantity: number;
  entryPrice: number | null;
  currentPrice: number | null;
  /** prix stop effectif retenu (le plus haut des stops applicables) */
  stopPrice: number | null;
  /** perte en $ si le stop est touché depuis le prix actuel (≥ 0), null si incalculable */
  riskAmount: number | null;
  /** valeur de marché de la position (qty × prix actuel), null si cotation absente */
  marketValue: number | null;
  /** true si aucun stop n'existe pour cette position */
  unprotected: boolean;
}

export interface ExposureRow {
  symbol: string;
  value: number;
  currency: string;
  pct: number;
}

export interface CurrencyExposureRow {
  currency: string;
  value: number;
  pct: number;
}

export interface GlobalRiskResult {
  positions: StopPositionRisk[];
  /** somme des pertes si tous les stops actifs sont touchés */
  totalRiskIfAllStopsHit: number;
  /** nb de positions suivies sans aucun stop */
  unprotectedCount: number;
  /** valeur de marché totale des positions sans stop */
  unprotectedValue: number;
  exposure: {
    total: number;
    bySymbol: ExposureRow[];
    byCurrency: CurrencyExposureRow[];
  };
}

/**
 * Prix stop effectif d'une position auto-trader : le plus haut entre le
 * stop-loss fixe et le trailing stop. Le trailing n'est « armé » que si le
 * plus-haut a dépassé l'entrée (même règle que checkProtectiveExits).
 */
export function effectiveStopPrice(p: StopPositionInput): number | null {
  if (p.source === "stop_order") return p.stopPrice;

  const candidates: number[] = [];
  if (p.entryPrice !== null && p.stopLossPct !== null && p.stopLossPct > 0) {
    candidates.push(p.entryPrice * (1 - p.stopLossPct / 100));
  }
  if (
    p.trailingStopPct !== null && p.trailingStopPct > 0 &&
    p.highWaterMark !== null && p.entryPrice !== null &&
    p.highWaterMark > p.entryPrice
  ) {
    candidates.push(p.highWaterMark * (1 - p.trailingStopPct / 100));
  }
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

/**
 * Perte en $ si le stop est touché depuis le prix actuel.
 * Si le prix est déjà sous le stop (déclenchement imminent), la perte
 * restante est 0 — la sortie se ferait au prix courant ou mieux.
 */
export function riskIfStopHit(
  currentPrice: number | null,
  stopPrice: number | null,
  quantity: number,
): number | null {
  if (currentPrice === null || stopPrice === null) return null;
  return Math.max(0, (currentPrice - stopPrice) * quantity);
}

export function computePositionRisk(p: StopPositionInput): StopPositionRisk {
  const stopPrice = effectiveStopPrice(p);
  const marketValue = p.currentPrice !== null ? p.currentPrice * p.quantity : null;
  return {
    source: p.source,
    refId: p.refId,
    symbol: p.symbol,
    quantity: p.quantity,
    entryPrice: p.entryPrice,
    currentPrice: p.currentPrice,
    stopPrice,
    riskAmount: riskIfStopHit(p.currentPrice, stopPrice, p.quantity),
    marketValue,
    unprotected: stopPrice === null,
  };
}

/** Devine la devise d'un symbole (heuristique pour les positions internes). */
export function guessCurrency(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.endsWith(".TO") || s.endsWith(".V") || s.endsWith(".NE") || s.endsWith(".CN")) return "CAD";
  return "USD";
}

export interface ExposureInput {
  symbol: string;
  value: number;
  currency: string;
}

export function aggregateExposure(rows: ExposureInput[]): GlobalRiskResult["exposure"] {
  const bySymbolMap = new Map<string, { value: number; currency: string }>();
  for (const r of rows) {
    if (!Number.isFinite(r.value) || r.value <= 0) continue;
    const existing = bySymbolMap.get(r.symbol);
    bySymbolMap.set(r.symbol, {
      value: (existing?.value ?? 0) + r.value,
      currency: existing?.currency ?? r.currency,
    });
  }
  const total = [...bySymbolMap.values()].reduce((s, v) => s + v.value, 0);
  const bySymbol: ExposureRow[] = [...bySymbolMap.entries()]
    .map(([symbol, v]) => ({
      symbol,
      value: v.value,
      currency: v.currency,
      pct: total > 0 ? (v.value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const byCurrencyMap = new Map<string, number>();
  for (const row of bySymbol) {
    byCurrencyMap.set(row.currency, (byCurrencyMap.get(row.currency) ?? 0) + row.value);
  }
  const byCurrency: CurrencyExposureRow[] = [...byCurrencyMap.entries()]
    .map(([currency, value]) => ({
      currency,
      value,
      pct: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return { total, bySymbol, byCurrency };
}

export function computeGlobalRisk(
  stopPositions: StopPositionInput[],
  exposureRows: ExposureInput[],
): GlobalRiskResult {
  const positions = stopPositions.map(computePositionRisk);
  const totalRiskIfAllStopsHit = positions.reduce((s, p) => s + (p.riskAmount ?? 0), 0);
  const unprotected = positions.filter((p) => p.unprotected);
  return {
    positions,
    totalRiskIfAllStopsHit,
    unprotectedCount: unprotected.length,
    unprotectedValue: unprotected.reduce((s, p) => s + (p.marketValue ?? 0), 0),
    exposure: aggregateExposure(exposureRows),
  };
}
