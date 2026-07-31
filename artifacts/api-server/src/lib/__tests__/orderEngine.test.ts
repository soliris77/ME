/**
 * Tests du pipeline submitOrder (orderEngine) — POINT D'ENTRÉE UNIQUE des ordres.
 * ─────────────────────────────────────────────────────────────────────────────
 * Invariant critique : un même signal ne peut JAMAIS déclencher deux ordres réels.
 *   - Kill-switch actif → tout est bloqué, aucun appel courtier
 *   - signalId déjà vu (SELECT optimiste) → "duplicate" sans appel courtier
 *   - Course perdue sur la contrainte unique (23505) → "duplicate" sans appel courtier
 *   - Rejet des garde-fous de risque → "rejected" + insertion dans rejected_signals
 * Approche de mocks db/drizzle reprise de workers/__tests__/autoTradeWorker.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks hissés ──────────────────────────────────────────────────────────────
const h = vi.hoisted(() => {
  // Sentinelles de tables (identité d'objet suffisante pour le fake db)
  const ordersTable = { id: Symbol("orders.id"), signalId: Symbol("orders.signalId"), createdAt: Symbol("orders.createdAt"), $inferSelect: undefined };
  const rejectedSignalsTable = { $inferSelect: undefined };
  const brokerConnectionsTable = { $inferSelect: undefined };

  const state = {
    connections: [] as Record<string, unknown>[],
    orders: [] as Record<string, unknown>[],
    inserts: [] as { table: unknown; values: Record<string, unknown> }[],
    updates: [] as { table: unknown; set: Record<string, unknown> }[],
    /** Si défini, le prochain insert dans ordersTable lève cette erreur. */
    nextOrderInsertError: null as unknown,
    /** Ligne renvoyée par le SELECT de rattrapage après 23505. */
    duplicateRow: null as Record<string, unknown> | null,
  };

  const rowsFor = (table: unknown) =>
    table === brokerConnectionsTable ? state.connections :
    table === ordersTable ? state.orders : [];

  const thenable = (rows: unknown[]) => ({
    where: () => thenable(rows),
    limit: (n: number) => thenable(rows.slice(0, n)),
    orderBy: () => thenable(rows),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(res, rej),
  });

  const db = {
    select: () => ({
      from: (table: unknown) => {
        // Après une 23505, le SELECT de rattrapage sur ordersTable renvoie duplicateRow
        if (table === ordersTable && state.duplicateRow && state.orders.length === 0) {
          return thenable([state.duplicateRow]);
        }
        return thenable(rowsFor(table));
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const doInsert = () => {
          if (table === ordersTable && state.nextOrderInsertError) {
            const err = state.nextOrderInsertError;
            state.nextOrderInsertError = null;
            throw err;
          }
          state.inserts.push({ table, values });
          return [{ id: 1, ...values }];
        };
        return {
          returning: () => Promise.resolve().then(doInsert),
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve().then(doInsert).then(res, rej),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: () => {
          state.updates.push({ table, set });
          return {
            returning: () => Promise.resolve([{ id: 1, ...set }]),
            then: (res: (v: unknown) => unknown) => Promise.resolve().then(res),
          };
        },
      }),
    }),
  };

  return {
    state, db, ordersTable, rejectedSignalsTable, brokerConnectionsTable,
    getTradingMode: vi.fn(),
    placeOrder: vi.fn(),
    listPositions: vi.fn(),
    checkOrderRisk: vi.fn(),
  };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  ordersTable: h.ordersTable,
  rejectedSignalsTable: h.rejectedSignalsTable,
  brokerConnectionsTable: h.brokerConnectionsTable,
}));
vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
  gte: (col: unknown, val: unknown) => ({ col, val }),
  desc: (col: unknown) => ({ desc: col }),
}));
vi.mock("../snaptrade", () => ({
  getTradingMode: h.getTradingMode,
  placeOrder: h.placeOrder,
  listPositions: h.listPositions,
}));
vi.mock("../risk", () => ({ checkOrderRisk: h.checkOrderRisk }));
vi.mock("../settings", () => ({
  getRiskSettings: vi.fn().mockResolvedValue({ maxOrderValue: 1000, largeOrderFrictionPct: 0.5 }),
}));
vi.mock("../notifications", () => ({ notifyLargeOrderExecuted: vi.fn() }));
vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { submitOrder, OrderValidationError } from "../orderEngine";

// ── Helpers ───────────────────────────────────────────────────────────────────
const baseInput = {
  signalId: "sig-1",
  symbol: "AAPL",
  side: "BUY",
  quantity: 2,
};

const riskOk = { ok: true as const, livePrice: 100, orderValue: 200, currency: "USD" };

function uniqueViolation() {
  const err = new Error("duplicate key value violates unique constraint") as Error & { code: string };
  err.code = "23505";
  return err;
}

const orderInserts = () => h.state.inserts.filter(i => i.table === h.ordersTable);
const rejectedInserts = () => h.state.inserts.filter(i => i.table === h.rejectedSignalsTable);

beforeEach(() => {
  vi.clearAllMocks();
  h.state.connections.length = 0;
  h.state.orders.length = 0;
  h.state.inserts.length = 0;
  h.state.updates.length = 0;
  h.state.nextOrderInsertError = null;
  h.state.duplicateRow = null;
  h.getTradingMode.mockReturnValue("paper");
  h.checkOrderRisk.mockResolvedValue(riskOk);
});

// ── 0) Kill-switch ────────────────────────────────────────────────────────────
describe("submitOrder — kill-switch", () => {
  it("kill-switch actif → rejected kill_switch_active, AUCUN appel courtier ni insertion", async () => {
    h.state.connections.push({ tradingHalted: true, haltedAt: new Date("2026-07-30T12:00:00Z") });

    const res = await submitOrder(baseInput);

    expect(res.status).toBe("rejected");
    if (res.status === "rejected") {
      expect(res.reason).toBe("kill_switch_active");
      expect(res.details.haltedAt).toBe("2026-07-30T12:00:00.000Z");
    }
    expect(h.placeOrder).not.toHaveBeenCalled();
    expect(h.checkOrderRisk).not.toHaveBeenCalled();
    expect(h.state.inserts).toHaveLength(0);
  });

  it("kill-switch actif bloque aussi le mode LIVE avec connexion valide", async () => {
    h.getTradingMode.mockReturnValue("live");
    h.state.connections.push({ tradingHalted: true, haltedAt: null });

    const res = await submitOrder({
      ...baseInput,
      accountId: "acct-1",
      brokerConnection: { snaptradeUserId: "u", snaptradeUserSecret: "s" },
    });

    expect(res.status).toBe("rejected");
    expect(h.placeOrder).not.toHaveBeenCalled();
  });

  it("kill-switch inactif → l'ordre passe (paper accepted)", async () => {
    h.state.connections.push({ tradingHalted: false });

    const res = await submitOrder(baseInput);

    expect(res.status).toBe("accepted");
    expect(orderInserts()).toHaveLength(1);
    expect(orderInserts()[0].values).toMatchObject({ signalId: "sig-1", mode: "paper", status: "simulated" });
  });
});

// ── 1) Validation ─────────────────────────────────────────────────────────────
describe("submitOrder — validation des champs", () => {
  it("signalId manquant → OrderValidationError", async () => {
    await expect(submitOrder({ ...baseInput, signalId: "" })).rejects.toBeInstanceOf(OrderValidationError);
  });

  it("side invalide → OrderValidationError", async () => {
    await expect(submitOrder({ ...baseInput, side: "HOLD" })).rejects.toBeInstanceOf(OrderValidationError);
  });

  it("quantity négative → OrderValidationError", async () => {
    await expect(submitOrder({ ...baseInput, quantity: -1 })).rejects.toBeInstanceOf(OrderValidationError);
  });
});

// ── 2) Idempotence ────────────────────────────────────────────────────────────
describe("submitOrder — idempotence par signalId", () => {
  it("signalId déjà en base (<24h) → duplicate, AUCUN appel courtier, aucune insertion", async () => {
    h.getTradingMode.mockReturnValue("live");
    const existing = { id: 7, signalId: "sig-1", status: "submitted" };
    h.state.orders.push(existing);

    const res = await submitOrder({
      ...baseInput,
      accountId: "acct-1",
      brokerConnection: { snaptradeUserId: "u", snaptradeUserSecret: "s" },
    });

    expect(res.status).toBe("duplicate");
    if (res.status === "duplicate") expect(res.order).toBe(existing);
    expect(h.placeOrder).not.toHaveBeenCalled();
    expect(h.checkOrderRisk).not.toHaveBeenCalled();
    expect(h.state.inserts).toHaveLength(0);
  });

  it("course perdue en LIVE : INSERT lève 23505 → duplicate SANS appel SnapTrade", async () => {
    h.getTradingMode.mockReturnValue("live");
    h.listPositions.mockResolvedValue([]);
    h.state.nextOrderInsertError = uniqueViolation();
    h.state.duplicateRow = { id: 9, signalId: "sig-1", status: "submitted" };

    const res = await submitOrder({
      ...baseInput,
      accountId: "acct-1",
      brokerConnection: { snaptradeUserId: "u", snaptradeUserSecret: "s" },
    });

    expect(res.status).toBe("duplicate");
    if (res.status === "duplicate") expect(res.order).toEqual(h.state.duplicateRow);
    expect(h.placeOrder).not.toHaveBeenCalled(); // l'invariant central : pas de 2e ordre réel
  });

  it("course perdue en PAPER : INSERT lève 23505 → duplicate", async () => {
    h.state.nextOrderInsertError = uniqueViolation();
    h.state.duplicateRow = { id: 3, signalId: "sig-1", status: "simulated" };

    const res = await submitOrder(baseInput);

    expect(res.status).toBe("duplicate");
    if (res.status === "duplicate") expect(res.order).toEqual(h.state.duplicateRow);
  });

  it("erreur d'INSERT non-23505 → propagée (pas de duplicate silencieux)", async () => {
    h.state.nextOrderInsertError = new Error("db down");
    await expect(submitOrder(baseInput)).rejects.toThrow("db down");
  });
});

// ── 3) Garde-fous de risque ───────────────────────────────────────────────────
describe("submitOrder — rejet par les garde-fous de risque", () => {
  it("risque KO → rejected + insertion dans rejected_signals, aucun ordre créé", async () => {
    h.checkOrderRisk.mockResolvedValue({
      ok: false,
      reason: "max_order_value",
      message: "Ordre trop gros",
      details: { orderValue: 99999 },
    });

    const res = await submitOrder({ ...baseInput, source: "auto-signal" });

    expect(res.status).toBe("rejected");
    if (res.status === "rejected") {
      expect(res.reason).toBe("max_order_value");
      expect(res.message).toBe("Ordre trop gros");
    }
    expect(rejectedInserts()).toHaveLength(1);
    expect(rejectedInserts()[0].values).toMatchObject({
      signalId: "sig-1",
      symbol: "AAPL",
      reason: "max_order_value",
      details: { orderValue: 99999, side: "BUY", quantity: 2, source: "auto-signal", mode: "paper" },
    });
    expect(orderInserts()).toHaveLength(0);
    expect(h.placeOrder).not.toHaveBeenCalled();
  });

  it("risque KO en LIVE → rejected AVANT tout appel courtier", async () => {
    h.getTradingMode.mockReturnValue("live");
    h.listPositions.mockResolvedValue([]);
    h.checkOrderRisk.mockResolvedValue({ ok: false, reason: "exposure", message: "Exposition max", details: {} });

    const res = await submitOrder({
      ...baseInput,
      accountId: "acct-1",
      brokerConnection: { snaptradeUserId: "u", snaptradeUserSecret: "s" },
    });

    expect(res.status).toBe("rejected");
    expect(rejectedInserts()).toHaveLength(1);
    expect(h.placeOrder).not.toHaveBeenCalled();
    expect(orderInserts()).toHaveLength(0);
  });
});

// ── 5b) Prérequis LIVE (fail closed) ─────────────────────────────────────────
describe("submitOrder — prérequis live", () => {
  it("mode live sans connexion courtier → rejected broker_not_connected, rien en base", async () => {
    h.getTradingMode.mockReturnValue("live");

    const res = await submitOrder({ ...baseInput, accountId: "acct-1" });

    expect(res.status).toBe("rejected");
    if (res.status === "rejected") expect(res.reason).toBe("broker_not_connected");
    expect(h.placeOrder).not.toHaveBeenCalled();
    expect(orderInserts()).toHaveLength(0);
  });

  it("mode live sans accountId → rejected account_required", async () => {
    h.getTradingMode.mockReturnValue("live");

    const res = await submitOrder({
      ...baseInput,
      brokerConnection: { snaptradeUserId: "u", snaptradeUserSecret: "s" },
    });

    expect(res.status).toBe("rejected");
    if (res.status === "rejected") expect(res.reason).toBe("account_required");
    expect(h.placeOrder).not.toHaveBeenCalled();
  });
});

// ── 5b) LIVE nominal : réservation avant appel courtier ─────────────────────
describe("submitOrder — mode live nominal", () => {
  it("réserve la ligne pending AVANT placeOrder, puis met à jour avec le résultat", async () => {
    h.getTradingMode.mockReturnValue("live");
    h.listPositions.mockResolvedValue([]);
    h.placeOrder.mockImplementation(async () => {
      // L'invariant d'ordre des opérations : la réservation DB précède l'appel courtier
      expect(orderInserts()).toHaveLength(1);
      expect(orderInserts()[0].values).toMatchObject({ status: "pending", mode: "live" });
      return { brokerage_order_id: "bo-123" };
    });

    const res = await submitOrder({
      ...baseInput,
      accountId: "acct-1",
      brokerConnection: { snaptradeUserId: "u", snaptradeUserSecret: "s" },
    });

    expect(h.placeOrder).toHaveBeenCalledOnce();
    expect(h.placeOrder.mock.calls[0][0]).toMatchObject({ clientOrderId: "sig-1", symbol: "AAPL", side: "BUY", quantity: 2 });
    expect(res.status).toBe("accepted");
    const update = h.state.updates.find(u => u.table === h.ordersTable);
    expect(update?.set).toMatchObject({ status: "submitted", snaptradeOrderId: "bo-123", errorMessage: null });
  });

  it("échec courtier → accepted mais ordre marqué error (pas d'exception)", async () => {
    h.getTradingMode.mockReturnValue("live");
    h.listPositions.mockResolvedValue([]);
    h.placeOrder.mockRejectedValue(new Error("SnapTrade 500"));

    const res = await submitOrder({
      ...baseInput,
      accountId: "acct-1",
      brokerConnection: { snaptradeUserId: "u", snaptradeUserSecret: "s" },
    });

    expect(res.status).toBe("accepted");
    if (res.status === "accepted") expect(res.order.status).toBe("error");
    const update = h.state.updates.find(u => u.table === h.ordersTable);
    expect(update?.set.status).toBe("error");
    expect(String(update?.set.errorMessage)).toContain("SnapTrade 500");
  });
});
