import { db, dailyEquitySnapshotsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { BrokerAdapter } from "@workspace/broker";
import { getQuotes } from "./yahoo";

const BASE = "USD";
function utcDay(): string { return new Date().toISOString().slice(0, 10); }
export function yahooSymbolForCurrency(currency: string): string {
  const code = currency.toUpperCase();
  if (code === "USD") return "USD";
  if (["BTC", "ETH", "SOL", "ADA", "XRP", "DOGE", "USDT", "USDC"].includes(code)) return `${code}-USD`;
  return `${code}USD=X`;
}

/** Strict valuation: every non-USD balance/position must have a quote/FX rate. */
export async function valueAccountInBase(adapter: BrokerAdapter, accountId: string): Promise<number> {
  const [balances, positions] = await Promise.all([
    adapter.getBalances(accountId),
    adapter.getPositions(accountId),
  ]);
  let total = 0;
  const conversions = new Map<string, number>();
  const currencies = new Set([...balances.map((b) => b.currency.toUpperCase()), ...positions.map((p) => (p.currency ?? BASE).toUpperCase())]);
  currencies.delete(BASE);
  if (currencies.size) {
    const symbols = [...currencies].map(yahooSymbolForCurrency);
    const quotes = await getQuotes(symbols);
    for (const quote of quotes) conversions.set(quote.symbol.toUpperCase(), quote.price);
  }
  for (const balance of balances) {
    const currency = balance.currency.toUpperCase();
    const rate = currency === BASE ? 1 : conversions.get(yahooSymbolForCurrency(currency));
    if (!Number.isFinite(rate) || !rate || !Number.isFinite(balance.total)) throw new Error(`Taux indisponible pour ${currency}`);
    total += balance.total * rate;
  }
  for (const position of positions) {
    if (!Number.isFinite(position.quantity) || !Number.isFinite(position.currentPrice ?? position.averagePrice)) throw new Error("Position non valorisable");
    const currency = (position.currency ?? BASE).toUpperCase();
    const rate = currency === BASE ? 1 : conversions.get(yahooSymbolForCurrency(currency));
    if (!Number.isFinite(rate) || !rate) throw new Error(`Taux indisponible pour ${currency}`);
    total += position.quantity * (position.currentPrice ?? position.averagePrice) * rate;
  }
  if (!Number.isFinite(total) || total <= 0) throw new Error("Valeur de portefeuille invalide");
  return total;
}

export async function readDayStartEquity(identity: string, day = utcDay()): Promise<number> {
  const [existing] = await db.select().from(dailyEquitySnapshotsTable)
    .where(and(eq(dailyEquitySnapshotsTable.accountIdentity, identity), eq(dailyEquitySnapshotsTable.utcDay, day))).limit(1);
  if (!existing) throw new Error(`Day-start equity baseline unavailable for ${identity} on ${day}`);
  const value = Number(existing.dayStartEquity);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Untrustworthy day-start equity baseline for ${identity}`);
  return value;
}

export async function captureDayStartEquity(identity: string, equity: number, now = new Date()): Promise<number> {
  if (!Number.isFinite(equity) || equity <= 0) throw new Error("Invalid day-start equity");
  const day = now.toISOString().slice(0, 10);
  const [created] = await db.insert(dailyEquitySnapshotsTable).values({
    accountIdentity: identity, utcDay: day, dayStartEquity: String(equity), baseCurrency: BASE,
  }).onConflictDoNothing().returning();
  if (created) return Number(created.dayStartEquity);
  return readDayStartEquity(identity, day);
}