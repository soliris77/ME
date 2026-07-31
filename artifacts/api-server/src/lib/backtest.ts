/**
 * Backtest — Simulation d'une règle auto-trade sur l'historique
 * ─────────────────────────────────────────────────────────────────────────────
 * Rejoue la stratégie (score minimum, direction, SL/TP/trailing, cooldown)
 * sur les données quotidiennes passées et calcule les statistiques.
 * Une seule position à la fois (comme le worker : openEntryPrice unique).
 * Modélise les positions longues (score >= minScore) ET short
 * (score <= -minScore) avec SL/TP/trailing inversés pour le short.
 */
import { computeIndicators, analyzeTradingSignals } from "./signals";
import type { OHLCPoint } from "./patternDetect";

export interface BacktestParams {
  history: OHLCPoint[];          // OHLC quotidien, ordonné du plus ancien au plus récent
  minScore: number;              // seuil de score absolu (0-100)
  sideMode: "buy" | "sell" | "both";
  stopLossPct?: number | null;
  takeProfitPct?: number | null;
  trailingStopPct?: number | null;
  cooldownBars?: number;         // barres min entre deux entrées (1 jour = 1 barre)
}

export interface BacktestTrade {
  side: "long" | "short";
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;
  exitReason: "stop_loss" | "take_profit" | "trailing_stop" | "signal" | "end";
  score: number;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  totalTrades: number;
  longTrades: number;
  shortTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalReturnPct: number;        // rendement cumulé additif
  avgWinPct: number | null;
  avgLossPct: number | null;
  maxDrawdownPct: number;        // pire baisse de la courbe cumulée
  buyHoldReturnPct: number;      // comparaison achat-conservation
  bars: number;
}

const WARMUP = 55; // barres nécessaires pour que les indicateurs soient valides

export function runBacktest(params: BacktestParams): BacktestResult {
  const { history, minScore, sideMode } = params;
  const slPct    = params.stopLossPct    ?? null;
  const tpPct    = params.takeProfitPct  ?? null;
  const trailPct = params.trailingStopPct ?? null;
  const cooldownBars = params.cooldownBars ?? 1;

  const trades: BacktestTrade[] = [];

  let inPosition = false;
  let posSide: "long" | "short" = "long";
  let entryPrice = 0;
  let entryDate  = "";
  let entryScore = 0;
  let mark = 0; // plus-haut (long) ou plus-bas (short) pour le trailing
  let lastExitBar = -Infinity;

  const closeTrade = (exitPrice: number, exitDate: string, reason: BacktestTrade["exitReason"]) => {
    const rawPct = ((exitPrice - entryPrice) / entryPrice) * 100;
    trades.push({
      side: posSide,
      entryDate, exitDate, entryPrice, exitPrice,
      pnlPct: posSide === "long" ? rawPct : -rawPct,
      exitReason: reason,
      score: entryScore,
    });
    inPosition = false;
  };

  for (let i = WARMUP; i < history.length; i++) {
    const bar = history[i];
    const close = bar.close;
    if (!close) continue;

    // ── Gestion de la position ouverte (sorties protectrices intrabar) ────────
    if (inPosition) {
      const low  = bar.low  ?? close;
      const high = bar.high ?? close;

      if (posSide === "long") {
        const stopPrice  = slPct    ? entryPrice * (1 - slPct / 100)  : null;
        // Convention conservatrice sans lookahead intrabar : le trailing est évalué
        // avec le plus-haut des barres PRÉCÉDENTES (on ne sait pas si le high du
        // jour est survenu avant ou après le low du jour).
        const trailPrice = trailPct && mark > entryPrice ? mark * (1 - trailPct / 100) : null;
        const tpPrice    = tpPct    ? entryPrice * (1 + tpPct / 100)  : null;

        // Priorité pessimiste : stop d'abord (le pire cas), puis trailing, puis TP
        if (stopPrice !== null && low <= stopPrice) {
          closeTrade(stopPrice, bar.date, "stop_loss");
          lastExitBar = i;
          continue;
        }
        if (trailPrice !== null && low <= trailPrice) {
          closeTrade(trailPrice, bar.date, "trailing_stop");
          lastExitBar = i;
          continue;
        }
        if (tpPrice !== null && high >= tpPrice) {
          closeTrade(tpPrice, bar.date, "take_profit");
          lastExitBar = i;
          continue;
        }

        // Mettre à jour le plus-haut APRÈS l'évaluation des sorties du jour
        if (trailPct) mark = Math.max(mark, high);
      } else {
        // Short : le stop est AU-DESSUS de l'entrée, le TP EN DESSOUS ;
        // le trailing suit le plus-bas des barres précédentes (même convention
        // conservatrice sans lookahead intrabar).
        const stopPrice  = slPct    ? entryPrice * (1 + slPct / 100)  : null;
        const trailPrice = trailPct && mark < entryPrice ? mark * (1 + trailPct / 100) : null;
        const tpPrice    = tpPct    ? entryPrice * (1 - tpPct / 100)  : null;

        // Priorité pessimiste : stop d'abord (le pire cas), puis trailing, puis TP
        if (stopPrice !== null && high >= stopPrice) {
          closeTrade(stopPrice, bar.date, "stop_loss");
          lastExitBar = i;
          continue;
        }
        if (trailPrice !== null && high >= trailPrice) {
          closeTrade(trailPrice, bar.date, "trailing_stop");
          lastExitBar = i;
          continue;
        }
        if (tpPrice !== null && low <= tpPrice) {
          closeTrade(tpPrice, bar.date, "take_profit");
          lastExitBar = i;
          continue;
        }

        // Mettre à jour le plus-bas APRÈS l'évaluation des sorties du jour
        if (trailPct) mark = Math.min(mark, low);
      }
    }

    // ── Signal du jour (fenêtre progressive, sans lookahead) ──────────────────
    const window = history.slice(0, i + 1);
    const data = computeIndicators(window);
    const analysis = analyzeTradingSignals(data, close);
    const score = analysis.score;

    if (inPosition) {
      // Sortie sur signal inverse fort (si aucune sortie protectrice)
      const exitSignal = posSide === "long" ? score <= -minScore : score >= minScore;
      if (exitSignal) {
        closeTrade(close, bar.date, "signal");
        lastExitBar = i;
      }
      continue;
    }

    // ── Entrée ────────────────────────────────────────────────────────────────
    if (i - lastExitBar < cooldownBars) continue;
    const buyAllowed  = sideMode === "buy"  || sideMode === "both";
    const sellAllowed = sideMode === "sell" || sideMode === "both";
    if (buyAllowed && score >= minScore) {
      inPosition = true;
      posSide    = "long";
      entryPrice = close;
      entryDate  = bar.date;
      entryScore = score;
      mark = close;
    } else if (sellAllowed && score <= -minScore) {
      inPosition = true;
      posSide    = "short";
      entryPrice = close;
      entryDate  = bar.date;
      entryScore = score;
      mark = close;
    }
  }

  // Position encore ouverte à la fin → clôture au dernier prix
  if (inPosition && history.length > 0) {
    const last = history[history.length - 1];
    closeTrade(last.close, last.date, "end");
  }

  // ── Statistiques ────────────────────────────────────────────────────────────
  const wins   = trades.filter(t => t.pnlPct > 0);
  const losses = trades.filter(t => t.pnlPct <= 0);
  const totalReturnPct = trades.reduce((s, t) => s + t.pnlPct, 0);

  // Max drawdown sur la courbe cumulée
  let cum = 0, peak = 0, maxDD = 0;
  for (const t of trades) {
    cum += t.pnlPct;
    peak = Math.max(peak, cum);
    maxDD = Math.max(maxDD, peak - cum);
  }

  const firstValid = history[WARMUP]?.close ?? history[0]?.close ?? 0;
  const lastClose  = history[history.length - 1]?.close ?? 0;
  const buyHoldReturnPct = firstValid > 0 ? ((lastClose - firstValid) / firstValid) * 100 : 0;

  return {
    trades,
    totalTrades: trades.length,
    longTrades: trades.filter(t => t.side === "long").length,
    shortTrades: trades.filter(t => t.side === "short").length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length > 0 ? wins.length / trades.length : null,
    totalReturnPct: Math.round(totalReturnPct * 100) / 100,
    avgWinPct: wins.length > 0 ? Math.round((wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length) * 100) / 100 : null,
    avgLossPct: losses.length > 0 ? Math.round((losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length) * 100) / 100 : null,
    maxDrawdownPct: Math.round(maxDD * 100) / 100,
    buyHoldReturnPct: Math.round(buyHoldReturnPct * 100) / 100,
    bars: history.length,
  };
}
