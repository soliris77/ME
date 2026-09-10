import { db, protectiveOrdersTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import type { BrokerAdapter } from "@workspace/broker";
import { logger } from "./logger";

type ProtectionInput = {
  accountId: string;
  symbol: string;
  parentOrderId: string;
  quantity: number;
  entryPrice: number;
  stopLossPct?: number | null;
  takeProfitPct?: number | null;
  adapter: BrokerAdapter;
};

const failures = new Map<string, number>();

/**
 * Broker-side protection.  This deliberately does not use market data: the
 * exchange owns the trigger after these orders have been accepted.
 */
export class ProtectiveOrderService {
  async protectFilledEntry(input: ProtectionInput): Promise<void> {
    const { accountId, symbol, parentOrderId, quantity, entryPrice, adapter } = input;
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(entryPrice) || entryPrice <= 0) return;
    const stop = input.stopLossPct != null ? entryPrice * (1 - input.stopLossPct / 100) : null;
    const target = input.takeProfitPct != null ? entryPrice * (1 + input.takeProfitPct / 100) : null;
    if (stop == null && target == null) return;
    const existing = await db.select().from(protectiveOrdersTable).where(and(
      eq(protectiveOrdersTable.accountId, accountId),
      eq(protectiveOrdersTable.parentOrderId, parentOrderId),
    ));
    // A fill can be reported repeatedly (and partially filled orders grow).
    // Increase quantity only by creating a new deterministic parent revision.
    const desired = new Map([["stop_loss", stop], ["take_profit", target]]);
    for (const [kind, trigger] of desired) {
      if (trigger == null) continue;
      const row = existing.find((r) => r.kind === kind && ["pending", "placed"].includes(r.status));
      if (row && Number(row.quantity) >= quantity) continue;
      await this.placeOne({ ...input, kind: kind as "stop_loss" | "take_profit", trigger, quantity });
    }
    const pair = await db.select().from(protectiveOrdersTable).where(and(
      eq(protectiveOrdersTable.accountId, accountId),
      eq(protectiveOrdersTable.parentOrderId, parentOrderId),
      inArray(protectiveOrdersTable.status, ["pending", "placed", "failed"]),
    ));
    if (pair.length === 2 && (!pair[0].siblingId || !pair[1].siblingId)) {
      await db.update(protectiveOrdersTable).set({ siblingId: pair[1].id, updatedAt: new Date() }).where(eq(protectiveOrdersTable.id, pair[0].id));
      await db.update(protectiveOrdersTable).set({ siblingId: pair[0].id, updatedAt: new Date() }).where(eq(protectiveOrdersTable.id, pair[1].id));
    }
  }

  private async placeOne(input: ProtectionInput & { kind: "stop_loss" | "take_profit"; trigger: number }) {
    const { accountId, symbol, parentOrderId, quantity, adapter, kind, trigger } = input;
    const key = `${accountId}:${parentOrderId}:${kind}:${quantity}`;
    let [row] = await db.select().from(protectiveOrdersTable).where(and(
      eq(protectiveOrdersTable.accountId, accountId),
      eq(protectiveOrdersTable.parentOrderId, parentOrderId),
      eq(protectiveOrdersTable.kind, kind),
    )).limit(1);
    if (row?.status === "placed" && Number(row.quantity) < quantity && row.brokerOrderId) {
      await adapter.cancelOrder(accountId, row.brokerOrderId).catch((error) =>
        logger.warn({ error, rowId: row!.id }, "unable to cancel undersized protection before replacement"));
      [row] = await db.update(protectiveOrdersTable).set({
        status: "pending", quantity: String(quantity), triggerPrice: String(trigger),
        updatedAt: new Date(), lastError: null,
      }).where(eq(protectiveOrdersTable.id, row.id)).returning();
    } else if (row?.status === "failed") {
      [row] = await db.update(protectiveOrdersTable).set({
        status: "pending", quantity: String(quantity), triggerPrice: String(trigger),
        updatedAt: new Date(), lastError: null,
      }).where(eq(protectiveOrdersTable.id, row.id)).returning();
    } else if (!row) {
      [row] = await db.insert(protectiveOrdersTable).values({
        accountId, positionSymbol: symbol.toUpperCase(), parentOrderId, kind,
        triggerPrice: String(trigger), quantity: String(quantity), status: "pending",
      }).returning();
    }
    if (!row) return;
    try {
      const result = await adapter.placeOrder({
        accountId, symbol: symbol.toUpperCase(), side: "sell",
        type: kind === "stop_loss" ? "stop" : "limit",
        quantity, ...(kind === "stop_loss" ? { stopPrice: trigger } : { limitPrice: trigger }),
        reduceOnly: true, clientOrderId: `protect-${row.id}`,
      });
      await db.update(protectiveOrdersTable).set({
        brokerOrderId: result.brokerOrderId, status: "placed", updatedAt: new Date(), lastError: null,
      }).where(eq(protectiveOrdersTable.id, row.id));
      failures.delete(key);
    } catch (error) {
      const count = (failures.get(key) ?? 0) + 1;
      failures.set(key, count);
      const nextFailureCount = (row.failureCount ?? 0) + 1;
      await db.update(protectiveOrdersTable).set({
        status: "failed", failureCount: nextFailureCount, lastError: String(error), updatedAt: new Date(),
      }).where(eq(protectiveOrdersTable.id, row.id));
      logger.error({ error, accountId, symbol, kind, attempt: nextFailureCount }, "PROTECTION PLACEMENT FAILED");
      if (nextFailureCount === 3) {
        // Claim the emergency close for the whole protection pair, rather
        // than independently for stop and target.  A pair with both legs
        // failing must still produce one (and only one) market close.
        const [claimed] = await db.update(protectiveOrdersTable).set({
          emergencyCloseIssued: true, updatedAt: new Date(),
        }).where(and(
          eq(protectiveOrdersTable.accountId, accountId),
          eq(protectiveOrdersTable.parentOrderId, parentOrderId),
          eq(protectiveOrdersTable.emergencyCloseIssued, false),
        )).returning();
        if (!claimed) return;
        logger.error({ accountId, symbol, quantity }, "CRITICAL: three protection failures; closing position at market");
        try {
          await adapter.placeOrder({
            accountId, symbol: symbol.toUpperCase(), side: "sell", type: "market",
            quantity, reduceOnly: true, clientOrderId: `protect-emergency-${parentOrderId}-${kind}`,
          });
        } catch (closeError) {
          logger.error({ closeError, accountId, symbol }, "CRITICAL: emergency market close failed");
        }
      }
    }
  }

  async reconcile(accountId: string, adapter: BrokerAdapter): Promise<void> {
    const rows = await db.select().from(protectiveOrdersTable).where(and(
      eq(protectiveOrdersTable.accountId, accountId),
      inArray(protectiveOrdersTable.status, ["placed", "pending"]),
    ));
    for (const row of rows) {
      if (!row.brokerOrderId) continue;
      try {
        const result = await adapter.getOrder(accountId, row.brokerOrderId);
        if (result.status === "filled") {
          await db.update(protectiveOrdersTable).set({ status: "filled", updatedAt: new Date() })
            .where(eq(protectiveOrdersTable.id, row.id));
          if (row.siblingId) {
            const [sibling] = await db.select().from(protectiveOrdersTable)
              .where(eq(protectiveOrdersTable.id, row.siblingId)).limit(1);
            if (sibling && sibling.status !== "cancelled") {
              let cancellationTerminal = !sibling.brokerOrderId;
              if (sibling.brokerOrderId) {
                try {
                  await adapter.cancelOrder(accountId, sibling.brokerOrderId);
                  cancellationTerminal = true;
                } catch (error) {
                  // A broker's not-found response means it has already
                  // disappeared (usually because it filled), hence terminal.
                  cancellationTerminal = /not.?found|unknown.?order|does not exist/i.test(String(error));
                  if (!cancellationTerminal) throw error;
                }
              }
              if (cancellationTerminal) {
                await db.update(protectiveOrdersTable).set({ status: "cancelled", updatedAt: new Date() })
                  .where(eq(protectiveOrdersTable.id, sibling.id));
              }
            }
          }
        }
      } catch (error) {
        logger.warn({ error, rowId: row.id }, "protective order reconciliation failed");
      }
    }
  }

  async reconcileOpenPosition(input: ProtectionInput): Promise<void> {
    const active = await db.select().from(protectiveOrdersTable).where(and(
      eq(protectiveOrdersTable.accountId, input.accountId),
      eq(protectiveOrdersTable.positionSymbol, input.symbol.toUpperCase()),
      inArray(protectiveOrdersTable.status, ["pending", "placed"]),
    ));
    if (active.length < 2) await this.protectFilledEntry(input);
  }
}

export const protectiveOrderService = new ProtectiveOrderService();