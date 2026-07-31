/**
 * Analyse pédagogique de chaque trade — moteur de règles, LECTURE SEULE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Compare chaque ordre exécuté du jour aux garde-fous existants (paramètres de
 * risque, stops de protection, heures de marché, coupe-circuit) et produit
 * 2 à 4 constats en français. Ne modifie rien : ni la logique du coupe-circuit,
 * ni l'auto-trader — ce module se contente de relire l'historique et les
 * paramètres pour en tirer des leçons.
 *
 * Les seuils et sémantiques reprennent EXACTEMENT ceux des garde-fous :
 *   - taille d'ordre       → maxOrderValue + largeOrderFrictionPct (lib/settings)
 *   - stop de protection   → orderType "stop" + ACTIVE_STOP_STATUSES (lib/orderEngine)
 *   - heures de marché     → isMarketOpen (lib/risk), évaluée à l'heure de l'ordre
 *   - coupe-circuit        → coût moyen / P&L réalisé (workers/autoTradeWorker)
 *     avec le même seuil d'avertissement à 80 % (DAILY_LOSS_WARNING_RATIO)
 */
import { isMarketOpen } from "./risk";
import { ACTIVE_STOP_STATUSES } from "./orderEngine";
import { DAILY_LOSS_WARNING_RATIO } from "../workers/autoTradeWorker";
import type { RiskSettings } from "./settings";

// Statuts considérés « exécutés » — mêmes valeurs que le débriefing.
// En live, `submitted` ≠ exécuté : ces ordres ne sont PAS analysés.
const EXECUTED_STATUSES = ["filled", "partially_filled", "simulated"];

export interface AnalyzableOrder {
  id: number;
  createdAt: Date;
  symbol: string;
  side: string;            // "BUY" | "SELL" (toute casse)
  quantity: string | null;
  filledQuantity?: string | null;
  orderType: string;       // "market" | "stop"
  status: string;
  fillPrice: string | null;
  expectedPrice: string | null;
}

export type FindingTone = "good" | "warn" | "info";
export interface TradeFinding {
  tone: FindingTone;
  text: string;
}

function fmt(n: number): string {
  return n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function priceOf(o: AnalyzableOrder): number {
  const p = parseFloat(o.fillPrice ?? o.expectedPrice ?? "0");
  return isFinite(p) ? p : 0;
}
function qtyOf(o: AnalyzableOrder): number {
  const q = parseFloat(o.filledQuantity ?? o.quantity ?? "0");
  return isFinite(q) ? q : 0;
}

/**
 * Analyse les ordres exécutés d'une journée.
 *
 * @param ordersUpToDay Historique COMPLET des ordres jusqu'à la fin du jour,
 *                      trié chronologiquement (même entrée que le débriefing).
 * @param dayStart      Début du jour analysé (UTC, comme le coupe-circuit).
 * @param settings      Paramètres de risque en vigueur (lecture seule).
 * @returns             Map orderId → 2-4 constats pédagogiques.
 */
export function analyzeDayTrades(
  ordersUpToDay: AnalyzableOrder[],
  dayStart: Date,
  settings: RiskSettings,
): Map<number, TradeFinding[]> {
  const result = new Map<number, TradeFinding[]>();

  // Stops de protection connus (posés à n'importe quel moment jusqu'à la fin du
  // jour) : mêmes critères d'« actif » que le garde-fou anti-empilement.
  const protectiveStops = ordersUpToDay.filter(
    (o) =>
      o.orderType === "stop" &&
      o.side.toUpperCase() === "SELL" &&
      [...ACTIVE_STOP_STATUSES, "filled", "partially_filled"].includes(o.status),
  );

  // P&L réalisé cumulé AVANT chaque ordre du jour — reprend la méthode du
  // coupe-circuit (coût moyen, ventes du jour uniquement) pas à pas.
  const positions = new Map<string, { qty: number; avgCost: number }>();
  let runningPnL = 0;

  for (const o of ordersUpToDay) {
    const price = priceOf(o);
    const qty = qtyOf(o);
    const executed = EXECUTED_STATUSES.includes(o.status);
    const isDayOrder = o.createdAt >= dayStart;

    // ── Analyse pédagogique (avant de mettre à jour le P&L cumulé) ──────────
    if (isDayOrder && executed && price > 0 && qty > 0) {
      const findings: TradeFinding[] = [];
      const side = o.side.toUpperCase();
      const orderValue = price * qty;

      // 1) Taille de position vs limites du plan
      const pctOfMax = (orderValue / settings.maxOrderValue) * 100;
      const frictionThreshold = settings.maxOrderValue * settings.largeOrderFrictionPct;
      if (orderValue > settings.maxOrderValue) {
        findings.push({
          tone: "warn",
          text: `⚠ Taille au-dessus du plan : ${fmt(orderValue)} $ dépasse la limite de ${fmt(settings.maxOrderValue)} $ par ordre.`,
        });
      } else if (orderValue > frictionThreshold) {
        findings.push({
          tone: "warn",
          text: `⚠ Gros ordre : ${fmt(orderValue)} $ soit ${Math.round(pctOfMax)} % de ta limite par ordre — au-delà du seuil de confirmation renforcée (${Math.round(settings.largeOrderFrictionPct * 100)} %).`,
        });
      } else {
        findings.push({
          tone: "good",
          text: `✔ Taille conforme au plan : ${fmt(orderValue)} $ soit ${Math.round(pctOfMax)} % de ta limite par ordre.`,
        });
      }

      // 2) Stop de protection
      if (o.orderType === "stop") {
        findings.push({
          tone: "good",
          text: "✔ Ordre de protection : ce stop applique ton plan de sortie — bonne discipline.",
        });
      } else if (side === "BUY") {
        const hasStop = protectiveStops.some(
          (s) => s.symbol.toUpperCase() === o.symbol.toUpperCase() && s.createdAt >= o.createdAt,
        );
        if (hasStop) {
          findings.push({
            tone: "good",
            text: "✔ Stop de protection posé après l'achat : ta perte maximale est définie.",
          });
        } else {
          findings.push({
            tone: "warn",
            text: "⚠ Aucun stop de protection posé après cet achat : la perte potentielle n'est pas bornée.",
          });
        }
      }

      // 3) Heure de marché (évaluée à l'heure de l'ordre)
      const hours = isMarketOpen(o.symbol, o.createdAt);
      if (hours.open) {
        findings.push({ tone: "good", text: "✔ Passé pendant les heures de marché : exécution au prix courant, sans surprise à l'ouverture." });
      } else {
        findings.push({ tone: "warn", text: "⚠ Passé hors des heures de marché : risque d'écart de prix à l'ouverture suivante." });
      }

      // 4) Proximité du coupe-circuit (perte journalière) au moment du trade
      if (settings.maxDailyLossAmount != null && settings.maxDailyLossAmount > 0) {
        const lossBefore = Math.max(0, -runningPnL);
        const ratio = lossBefore / settings.maxDailyLossAmount;
        if (ratio >= 1) {
          findings.push({
            tone: "warn",
            text: `⚠ Trade passé alors que la perte du jour (${fmt(lossBefore)} $) atteignait déjà la limite du coupe-circuit (${fmt(settings.maxDailyLossAmount)} $).`,
          });
        } else if (ratio >= DAILY_LOSS_WARNING_RATIO) {
          findings.push({
            tone: "warn",
            text: `⚠ Trade passé alors que la perte du jour atteignait ${Math.round(ratio * 100)} % de la limite du coupe-circuit — zone de prudence.`,
          });
        }
      }

      result.set(o.id, findings.slice(0, 4));
    }

    // ── Mise à jour du P&L cumulé — même méthode que computeRealizedDailyPnL.
    // Même prudence que le coupe-circuit : seuls les fills avérés comptent
    // (en live, `submitted` ≠ exécuté).
    if (!executed || price <= 0 || qty <= 0) continue;
    const sym = o.symbol.toUpperCase();
    const pos = positions.get(sym) ?? { qty: 0, avgCost: 0 };
    if (o.side.toUpperCase() === "BUY") {
      const totalCost = pos.qty * pos.avgCost + qty * price;
      pos.qty += qty;
      pos.avgCost = totalCost / pos.qty;
    } else {
      const matchedQty = Math.min(qty, pos.qty);
      if (matchedQty > 0 && o.createdAt >= dayStart) {
        runningPnL += (price - pos.avgCost) * matchedQty;
      }
      pos.qty = Math.max(0, pos.qty - qty);
      if (pos.qty === 0) pos.avgCost = 0;
    }
    positions.set(sym, pos);
  }

  return result;
}
