/**
 * Score de discipline — mesure si les trades réellement passés respectent le
 * plan de risque enseigné par le calculateur de position :
 *   - risque initial ≤ 1-2 % du capital de référence,
 *   - un stop de protection connu AVANT la sortie (ordre stop ou règle auto-trader),
 *   - une taille de position raisonnable vs le capital,
 *   - un R réalisé cohérent (gains ≥ 1R, pertes qui ne dépassent pas ~1R).
 * ─────────────────────────────────────────────────────────────────────────────
 * Le capital de référence est `maxPortfolioExposure` (paramètres de risque) :
 * c'est la seule notion de « capital » disponible dans les deux modes (le mode
 * paper n'a pas de solde courtier). Choix documenté plutôt que silencieux —
 * la valeur est renvoyée dans le rapport pour que l'UI l'affiche.
 *
 * Appariement des trades : même FIFO que lib/performance.ts, mais enrichi de
 * l'identité de l'ordre d'achat (id + date) pour retrouver le stop associé :
 *   1. un ordre `orderType="stop"` SELL du même symbole/mode créé entre
 *      l'entrée et la sortie (expectedPrice = prix de déclenchement), sinon
 *   2. la règle d'auto-trader liée à l'ordre d'achat (via auto_trade_logs)
 *      si elle définit stopLossPct → stop implicite = entrée × (1 − pct/100).
 * Un stop simplement « soumis » (GTC au repos) compte comme protection, mais
 * n'est PAS traité comme une vente dans le FIFO tant qu'il n'est pas exécuté.
 */
import { db, ordersTable, autoTradeLogsTable, autoTradeRulesTable, brokerConnectionsTable } from "@workspace/db";
import { asc, inArray } from "drizzle-orm";
import { getRiskSettings } from "./settings";
import { getTradingMode } from "./tradingMode";
import { logger } from "./logger";

// ─── Types d'entrée (indépendants de la DB pour rester testables) ────────────

export interface DisciplineOrderInput {
  id: number;
  symbol: string;
  side: string; // "buy" | "sell" (insensible à la casse)
  orderType: string; // "market" | "stop"
  mode: "paper" | "live";
  status: string;
  quantity: number;
  price: number; // expectedPrice (= stopPrice pour un ordre stop)
  /** Prix d'exécution réel renvoyé par le courtier — prioritaire sur `price` quand connu. */
  fillPrice?: number | null;
  createdAt: Date;
}

export interface DisciplineComputeInput {
  orders: DisciplineOrderInput[];
  /** orderId (achat) → stopLossPct de la règle d'auto-trader qui l'a passé. */
  autoStopPctByOrderId: Map<number, number>;
  /** Capital de référence ($) pour risque % et taille de position %. */
  capitalBase: number;
}

// ─── Types de sortie ─────────────────────────────────────────────────────────

export type StopSource = "stop_order" | "auto_trader" | null;

export interface DisciplineTrade {
  symbol: string;
  mode: "paper" | "live";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  entryAt: string;
  closedAt: string;
  stopPrice: number | null;
  stopSource: StopSource;
  /** Risque initial effectif ($) = (entrée − stop) × quantité ; null sans stop valide. */
  initialRisk: number | null;
  /** Risque initial en fraction du capital (0.01 = 1 %) ; null sans stop. */
  riskPct: number | null;
  /** R réalisé = pnl / risque initial ; null sans stop valide. */
  realizedR: number | null;
  /** Taille de position (entrée × qté) en fraction du capital. */
  positionPct: number;
  /** Score de discipline du trade, 0-100. */
  score: number;
  /** Raisons d'indiscipline (vide = trade discipliné). */
  reasons: string[];
}

export interface DisciplineComponent {
  key: "stop" | "risk" | "size" | "rr";
  label: string;
  /** Score moyen 0-100 sur ce critère, null si non calculable (aucun trade). */
  score: number | null;
  /** Poids du critère dans le score global (les poids somment à 100). */
  weight: number;
}

export interface DisciplineReport {
  generatedAt: string;
  capitalBase: number;
  totalTrades: number;
  /** Score agrégé 0-100 (moyenne des scores par trade), null si aucun trade clôturé. */
  score: number | null;
  components: DisciplineComponent[];
  disciplinedTrades: number;
  undisciplinedTrades: number;
  trades: DisciplineTrade[];
}

// ─── Barème ──────────────────────────────────────────────────────────────────
// Poids (somme = 100) : stop connu 30, risque initial 25, taille 25, R réalisé 20.
const WEIGHTS = { stop: 30, risk: 25, size: 25, rr: 20 } as const;

// Seuils du plan de risque (fractions du capital)
const RISK_GOOD = 0.01; // ≤ 1 % : plein score
const RISK_OK = 0.02; // ≤ 2 % : acceptable
const RISK_BAD = 0.03; // ≤ 3 % : limite ; au-delà : 0
const SIZE_GOOD = 0.1; // ≤ 10 % du capital
const SIZE_OK = 0.2; // ≤ 20 %
const SIZE_BAD = 0.3; // ≤ 30 %
/** Tolérance de dépassement du stop (slippage) avant de considérer le stop non respecté. */
const R_LOSS_TOLERANCE = -1.2;

/** Statuts d'un ordre stop qui prouvent qu'une protection a existé (rejeté/erreur exclus). */
const STOP_EVIDENCE_STATUSES = ["pending", "submitted", "filled", "partially_filled", "simulated", "cancelled"];

/**
 * Un ordre compte comme EXÉCUTÉ (participe au FIFO) uniquement s'il a
 * réellement changé la position :
 *   - live : "filled" / "partially_filled" seulement — un ordre "submitted"
 *     n'est pas encore exécuté (particulièrement vrai pour un stop GTC au repos) ;
 *   - paper : "simulated" (exécution instantanée du simulateur) + fills.
 */
function isExecuted(o: DisciplineOrderInput): boolean {
  if (o.status === "filled" || o.status === "partially_filled") return true;
  return o.mode === "paper" && o.status === "simulated";
}

/** Prix effectif : le prix d'exécution du courtier quand il est connu, sinon le prix attendu. */
function effectivePrice(o: DisciplineOrderInput): number {
  return o.fillPrice != null && o.fillPrice > 0 ? o.fillPrice : o.price;
}

interface Lot {
  quantity: number;
  price: number;
  orderId: number;
  boughtAt: Date;
}

function scoreRisk(riskPct: number | null): number {
  if (riskPct === null) return 0;
  if (riskPct <= RISK_GOOD) return 100;
  if (riskPct <= RISK_OK) return 60;
  if (riskPct <= RISK_BAD) return 20;
  return 0;
}

function scoreSize(positionPct: number): number {
  if (positionPct <= SIZE_GOOD) return 100;
  if (positionPct <= SIZE_OK) return 60;
  if (positionPct <= SIZE_BAD) return 20;
  return 0;
}

function scoreRR(realizedR: number | null): number {
  if (realizedR === null) return 0;
  if (realizedR >= 2) return 100;
  if (realizedR >= 1) return 70;
  if (realizedR >= 0) return 40; // gain plus petit que le risque pris
  if (realizedR >= R_LOSS_TOLERANCE) return 60; // perte contrôlée ≈ −1R : le stop a fait son travail
  return 0; // perte dépassant nettement le risque prévu — stop non respecté
}

/** Calcul pur du rapport de discipline — aucune dépendance DB, testable directement. */
export function computeDisciplineReport(input: DisciplineComputeInput): DisciplineReport {
  const { autoStopPctByOrderId, capitalBase } = input;
  const orders = [...input.orders].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // Ordres stop SELL (protection) par symbole+mode — pour retrouver le stop d'un trade.
  const stopOrders = orders.filter(
    (o) =>
      o.orderType === "stop" &&
      o.side.toUpperCase() === "SELL" &&
      STOP_EVIDENCE_STATUSES.includes(o.status) &&
      o.price > 0,
  );

  // FIFO enrichi : on garde l'ordre d'achat d'origine dans chaque lot.
  const openLotsByKey = new Map<string, Lot[]>();
  const trades: DisciplineTrade[] = [];

  for (const o of orders) {
    // Seuls les ordres réellement exécutés participent au FIFO — un ordre
    // "submitted" (marché ou stop) n'a pas encore changé la position.
    if (!isExecuted(o)) continue;
    const px = effectivePrice(o);
    if (o.quantity <= 0 || px <= 0) continue;

    const key = `${o.symbol}|${o.mode}`;
    const lots = openLotsByKey.get(key) ?? [];
    const side = o.side.toUpperCase();

    if (side === "BUY") {
      lots.push({ quantity: o.quantity, price: px, orderId: o.id, boughtAt: o.createdAt });
      openLotsByKey.set(key, lots);
      continue;
    }

    let remaining = o.quantity;
    while (remaining > 1e-9 && lots.length > 0) {
      const lot = lots[0];
      const matched = Math.min(remaining, lot.quantity);
      trades.push(
        buildTrade({
          symbol: o.symbol,
          mode: o.mode,
          quantity: matched,
          entryPrice: lot.price,
          exitPrice: px,
          entryOrderId: lot.orderId,
          entryAt: lot.boughtAt,
          exitOrder: o,
          stopOrders,
          autoStopPctByOrderId,
          capitalBase,
        }),
      );
      lot.quantity -= matched;
      remaining -= matched;
      if (lot.quantity <= 1e-9) lots.shift();
    }
    openLotsByKey.set(key, lots);
  }

  // Agrégation
  const avg = (values: number[]): number | null =>
    values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;

  const componentScores = {
    stop: avg(trades.map((t) => (t.stopPrice !== null ? 100 : 0))),
    risk: avg(trades.map((t) => scoreRisk(t.riskPct))),
    size: avg(trades.map((t) => scoreSize(t.positionPct))),
    rr: avg(trades.map((t) => scoreRR(t.realizedR))),
  };

  const components: DisciplineComponent[] = [
    { key: "stop", label: "Stop de protection en place", score: round1(componentScores.stop), weight: WEIGHTS.stop },
    { key: "risk", label: "Risque initial ≤ 1-2 % du capital", score: round1(componentScores.risk), weight: WEIGHTS.risk },
    { key: "size", label: "Taille de position vs capital", score: round1(componentScores.size), weight: WEIGHTS.size },
    { key: "rr", label: "R réalisé (gains ≥ 1R, pertes ≤ 1R)", score: round1(componentScores.rr), weight: WEIGHTS.rr },
  ];

  const score = avg(trades.map((t) => t.score));

  return {
    generatedAt: new Date().toISOString(),
    capitalBase,
    totalTrades: trades.length,
    score: round1(score),
    components,
    disciplinedTrades: trades.filter((t) => t.reasons.length === 0).length,
    undisciplinedTrades: trades.filter((t) => t.reasons.length > 0).length,
    // Plus récents d'abord pour l'affichage.
    trades: [...trades].sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime()),
  };
}

function buildTrade(args: {
  symbol: string;
  mode: "paper" | "live";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  entryOrderId: number;
  entryAt: Date;
  exitOrder: DisciplineOrderInput;
  stopOrders: DisciplineOrderInput[];
  autoStopPctByOrderId: Map<number, number>;
  capitalBase: number;
}): DisciplineTrade {
  const { symbol, mode, quantity, entryPrice, exitPrice, entryAt, exitOrder, capitalBase } = args;
  const pnl = quantity * (exitPrice - entryPrice);
  const exitAt = exitOrder.createdAt;

  // 1) Stop explicite : ordre stop SELL du même symbole/mode, créé entre
  //    l'entrée et la sortie (le plus récent avant la sortie fait foi).
  //    Si la sortie EST un ordre stop exécuté, son propre prix est le stop.
  let stopPrice: number | null = null;
  let stopSource: StopSource = null;

  if (exitOrder.orderType === "stop") {
    stopPrice = exitOrder.price;
    stopSource = "stop_order";
  } else {
    const candidates = args.stopOrders.filter(
      (s) =>
        s.symbol === symbol &&
        s.mode === mode &&
        s.createdAt.getTime() >= entryAt.getTime() &&
        s.createdAt.getTime() <= exitAt.getTime(),
    );
    if (candidates.length > 0) {
      const latest = candidates[candidates.length - 1];
      stopPrice = latest.price;
      stopSource = "stop_order";
    } else {
      // 2) Stop implicite d'une règle d'auto-trader liée à l'ordre d'achat.
      const pct = args.autoStopPctByOrderId.get(args.entryOrderId);
      if (pct !== undefined && pct > 0) {
        stopPrice = entryPrice * (1 - pct / 100);
        stopSource = "auto_trader";
      }
    }
  }

  // Un « stop » au-dessus de l'entrée ne protège rien : risque non mesurable.
  const validStop = stopPrice !== null && stopPrice < entryPrice;
  const initialRisk = validStop ? (entryPrice - (stopPrice as number)) * quantity : null;
  const riskPct = initialRisk !== null && capitalBase > 0 ? initialRisk / capitalBase : null;
  const realizedR = initialRisk !== null && initialRisk > 0 ? pnl / initialRisk : null;
  const positionPct = capitalBase > 0 ? (entryPrice * quantity) / capitalBase : 0;

  const reasons: string[] = [];
  if (stopPrice === null) {
    reasons.push("Aucun stop de protection connu entre l'achat et la vente");
  } else if (!validStop) {
    reasons.push("Stop enregistré au-dessus du prix d'entrée — risque non mesurable");
  }
  if (riskPct !== null && riskPct > RISK_OK) {
    reasons.push(`Risque initial de ${(riskPct * 100).toFixed(1)} % du capital (> 2 %)`);
  }
  if (positionPct > SIZE_OK) {
    reasons.push(`Position de ${(positionPct * 100).toFixed(1)} % du capital (> 20 %)`);
  }
  if (realizedR !== null) {
    if (realizedR < R_LOSS_TOLERANCE) {
      reasons.push(`Perte de ${Math.abs(realizedR).toFixed(1)} R — dépasse le risque prévu (stop non respecté)`);
    } else if (realizedR >= 0 && realizedR < 1) {
      reasons.push(`R/R réalisé de ${realizedR.toFixed(2)} (< 1) — gain plus petit que le risque pris`);
    }
  }

  const score =
    ((stopPrice !== null && validStop ? 100 : 0) * WEIGHTS.stop +
      scoreRisk(riskPct) * WEIGHTS.risk +
      scoreSize(positionPct) * WEIGHTS.size +
      scoreRR(realizedR) * WEIGHTS.rr) /
    100;

  return {
    symbol,
    mode,
    quantity,
    entryPrice,
    exitPrice,
    pnl,
    entryAt: entryAt.toISOString(),
    closedAt: exitAt.toISOString(),
    stopPrice,
    stopSource,
    initialRisk,
    riskPct,
    realizedR,
    positionPct,
    score: Math.round(score * 10) / 10,
    reasons,
  };
}

function round1(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10) / 10;
}

// ─── Chargement DB + calcul ──────────────────────────────────────────────────

export async function getDisciplineReport(): Promise<DisciplineReport> {
  // En mode live : rapprocher d'abord les ordres "submitted" de leurs
  // exécutions réelles SnapTrade (status/fillPrice/filledQuantity), sinon les
  // vrais fills du courtier n'apparaîtraient dans le score qu'au prochain
  // cycle du worker. Best-effort : un échec de sync ne bloque pas le rapport.
  if (getTradingMode() === "live") {
    try {
      const [conn] = await db.select().from(brokerConnectionsTable).limit(1);
      if (conn) {
        const { syncLiveOrderFills } = await import("../workers/autoTradeWorker");
        await syncLiveOrderFills(conn);
      }
    } catch (err) {
      logger.warn({ err }, "discipline: syncLiveOrderFills échoué — score calculé sur les fills déjà confirmés");
    }
  }

  const [rows, settings] = await Promise.all([
    db.select().from(ordersTable).orderBy(asc(ordersTable.createdAt)),
    getRiskSettings(),
  ]);

  const orders: DisciplineOrderInput[] = rows.map((o) => ({
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    orderType: o.orderType,
    mode: o.mode as "paper" | "live",
    status: o.status,
    quantity: Number(o.filledQuantity ?? o.quantity ?? 0),
    price: Number(o.expectedPrice ?? 0),
    fillPrice: o.fillPrice != null ? Number(o.fillPrice) : null,
    createdAt: o.createdAt,
  }));

  // Lien ordre d'achat → stopLossPct de la règle d'auto-trader.
  const autoStopPctByOrderId = new Map<number, number>();
  const orderIds = rows.filter((o) => o.side.toLowerCase() === "buy").map((o) => o.id);
  if (orderIds.length > 0) {
    const logs = await db
      .select()
      .from(autoTradeLogsTable)
      .where(inArray(autoTradeLogsTable.orderId, orderIds));
    const ruleIds = [...new Set(logs.map((l) => l.ruleId))];
    if (ruleIds.length > 0) {
      const rules = await db
        .select()
        .from(autoTradeRulesTable)
        .where(inArray(autoTradeRulesTable.id, ruleIds));
      const pctByRule = new Map(rules.map((r) => [r.id, r.stopLossPct != null ? Number(r.stopLossPct) : null]));
      for (const log of logs) {
        if (log.orderId == null) continue;
        const pct = pctByRule.get(log.ruleId);
        if (pct != null && pct > 0) autoStopPctByOrderId.set(log.orderId, pct);
      }
    }
  }

  return computeDisciplineReport({
    orders,
    autoStopPctByOrderId,
    capitalBase: settings.maxPortfolioExposure,
  });
}
