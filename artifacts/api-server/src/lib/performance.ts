/**
 * Tableau de performance — calcule le P&L réalisé à partir de l'historique
 * des ordres, par appariement FIFO (First In, First Out) : chaque vente est
 * imputée aux achats les plus anciens encore ouverts pour ce symbole/mode.
 * ─────────────────────────────────────────────────────────────────────────────
 * Choix FIFO plutôt que coût moyen : c'est la méthode que Wealthsimple utilise
 * pour le calcul du gain en capital côté fiscal, donc les métriques ici restent
 * cohérentes avec ce que l'utilisateur verra sur ses feuillets fiscaux.
 * Ne couvre que les ordres "remplis" (simulated / submitted / filled /
 * partially_filled) — les ordres rejetés ou en erreur ne participent jamais
 * au P&L.
 */
import { db, ordersTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";

interface Lot {
  quantity: number;
  price: number;
}

interface ClosedTrade {
  symbol: string;
  mode: "paper" | "live";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  closedAt: string;
}

export interface PerformanceMetrics {
  mode: "paper" | "live" | "combined";
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number | null; // 0-1, null si aucun trade clôturé
  avgWin: number | null;
  avgLoss: number | null; // valeur positive (magnitude)
  riskRewardRatio: number | null; // avgWin / avgLoss
  totalPnl: number;
  maxDrawdown: number; // valeur positive (magnitude de la plus grande baisse depuis un sommet)
  openPositions: number; // symboles avec une position encore ouverte
}

/** Calcule les trades clôturés (FIFO) pour un mode donné, tous symboles confondus. */
async function computeClosedTrades(mode: "paper" | "live"): Promise<{ trades: ClosedTrade[]; openPositions: number }> {
  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.mode, mode))
    .orderBy(asc(ordersTable.createdAt));

  const relevant = orders.filter((o) =>
    ["simulated", "submitted", "filled", "partially_filled"].includes(o.status),
  );

  const openLotsBySymbol = new Map<string, Lot[]>();
  const trades: ClosedTrade[] = [];

  for (const o of relevant) {
    const symbol = o.symbol;
    const qty = Number(o.filledQuantity ?? o.quantity ?? 0);
    const price = Number(o.expectedPrice ?? 0);
    if (qty <= 0 || price <= 0) continue;

    const side = o.side.toUpperCase();
    const lots = openLotsBySymbol.get(symbol) ?? [];

    if (side === "BUY") {
      lots.push({ quantity: qty, price });
      openLotsBySymbol.set(symbol, lots);
      continue;
    }

    // SELL — imputer FIFO contre les lots ouverts les plus anciens
    let remaining = qty;
    while (remaining > 1e-9 && lots.length > 0) {
      const lot = lots[0];
      const matched = Math.min(remaining, lot.quantity);
      trades.push({
        symbol,
        mode,
        quantity: matched,
        entryPrice: lot.price,
        exitPrice: price,
        pnl: matched * (price - lot.price),
        closedAt: (o.submittedAt ?? o.createdAt).toISOString(),
      });
      lot.quantity -= matched;
      remaining -= matched;
      if (lot.quantity <= 1e-9) lots.shift();
    }
    // Une vente sans lot ouvert correspondant (position déjà détenue avant le
    // suivi Soliris Market) n'est pas comptée comme trade clôturé — pas assez
    // d'info pour calculer un P&L fiable.
    openLotsBySymbol.set(symbol, lots);
  }

  const openPositions = [...openLotsBySymbol.values()].filter((lots) =>
    lots.some((l) => l.quantity > 1e-9),
  ).length;

  return { trades, openPositions };
}

function summarize(trades: ClosedTrade[], openPositions: number, mode: PerformanceMetrics["mode"]): PerformanceMetrics {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);

  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : null;
  const avgLossMagnitude =
    losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : null;

  // Drawdown maximal sur la courbe de P&L cumulé, trades triés chronologiquement
  const sorted = [...trades].sort((a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime());
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const t of sorted) {
    cumulative += t.pnl;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return {
    mode,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length > 0 ? wins.length / trades.length : null,
    avgWin,
    avgLoss: avgLossMagnitude,
    riskRewardRatio: avgWin !== null && avgLossMagnitude ? avgWin / avgLossMagnitude : null,
    totalPnl,
    maxDrawdown,
    openPositions,
  };
}

export interface PerformanceReport {
  paper: PerformanceMetrics;
  live: PerformanceMetrics;
  combined: PerformanceMetrics;
}

export async function getPerformanceReport(): Promise<PerformanceReport> {
  const [paperResult, liveResult] = await Promise.all([
    computeClosedTrades("paper"),
    computeClosedTrades("live"),
  ]);

  return {
    paper: summarize(paperResult.trades, paperResult.openPositions, "paper"),
    live: summarize(liveResult.trades, liveResult.openPositions, "live"),
    combined: summarize(
      [...paperResult.trades, ...liveResult.trades],
      paperResult.openPositions + liveResult.openPositions,
      "combined",
    ),
  };
}
