import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrokerAdapter, OrderRequest, OrderResult } from "@workspace/broker";

const h = vi.hoisted(() => {
  const table = {
    id: Symbol("id"), accountId: Symbol("accountId"), positionSymbol: Symbol("positionSymbol"),
    parentOrderId: Symbol("parentOrderId"), kind: Symbol("kind"), status: Symbol("status"),
    emergencyCloseIssued: Symbol("emergencyCloseIssued"),
  };
  const names = new Map<unknown, string>([
    [table.id, "id"], [table.accountId, "accountId"], [table.positionSymbol, "positionSymbol"],
    [table.parentOrderId, "parentOrderId"], [table.kind, "kind"], [table.status, "status"],
    [table.emergencyCloseIssued, "emergencyCloseIssued"],
  ]);
  const state = { rows: [] as Record<string, any>[], nextId: 1 };
  const matches = (row: Record<string, any>, condition: any): boolean => {
    if (!condition) return true;
    if (condition.and) return condition.and.every((item: any) => matches(row, item));
    if (condition.in) return condition.in.includes(row[names.get(condition.col)!]);
    return row[names.get(condition.col)!] === condition.val;
  };
  const chain = (rows: Record<string, any>[]): any => ({
    where: (condition: any) => chain(rows.filter((row) => matches(row, condition))),
    limit: (count: number) => chain(rows.slice(0, count)),
    then: (resolve: (value: any) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  });
  const db = {
    select: () => ({ from: () => chain(state.rows) }),
    insert: () => ({
      values: (values: Record<string, any>) => ({
        returning: () => {
          const row = {
            ...values, id: state.nextId++, failureCount: 0,
            emergencyCloseIssued: false, status: values.status ?? "pending",
          };
          state.rows.push(row);
          return Promise.resolve([row]);
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, any>) => ({
        where: (condition: any) => ({
          returning: () => {
            const changed = state.rows.filter((row) => matches(row, condition))
              .map((row) => ({ ...row, ...values }));
            state.rows = state.rows.map((row) => matches(row, condition) ? { ...row, ...values } : row);
            return Promise.resolve(changed);
          },
          then: (resolve: (value: any) => unknown, reject?: (error: unknown) => unknown) =>
            Promise.resolve().then(() => {
              state.rows = state.rows.map((row) => matches(row, condition) ? { ...row, ...values } : row);
              return [];
            }).then(resolve, reject),
        }),
      }),
    }),
  };
  return { table, state, db };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  protectiveOrdersTable: h.table,
  riskSettingsTable: {},
  orderAuditLogTable: {},
}));
vi.mock("@workspace/risk", () => ({
  RiskGate: class {
    async evaluate() {
      return { allowed: true, mode: "live" as const };
    }
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...items: unknown[]) => ({ and: items }),
  inArray: (col: unknown, values: unknown[]) => ({ col, in: values }),
}));
vi.mock("../logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { ProtectiveOrderService } from "../protectiveOrders";

const input = (adapter: BrokerAdapter, quantity = 2) => ({
  accountId: "acct", symbol: "AAPL", parentOrderId: "entry-1", quantity,
  entryPrice: 100, stopLossPct: 5, takeProfitPct: 10, adapter,
});
const adapterFor = (implementation: (request: OrderRequest) => Promise<OrderResult>) => {
  const placeOrder = vi.fn(implementation);
  const cancelOrder = vi.fn().mockResolvedValue(undefined);
  const getOrder = vi.fn();
  return {
    id: "test",
    assetClass: "equity" as const,
    supportsExchangeSideProtection: () => true,
    getBalances: vi.fn(), getPositions: vi.fn(), getMarketLimits: vi.fn(),
    placeOrder, cancelOrder, getOrder, listOpenOrders: vi.fn(), listOrders: vi.fn(),
  } satisfies BrokerAdapter;
};

beforeEach(() => {
  h.state.rows.splice(0);
  h.state.nextId = 1;
});

describe("protective order acceptance invariants", () => {
  it("creates exactly two linked placed rows for a filled or partial entry", async () => {
    const adapter = adapterFor(async (request) => ({
      brokerOrderId: `broker-${request.clientOrderId}`, clientOrderId: request.clientOrderId,
      status: "open", filledQuantity: request.quantity, raw: request,
    }));
    await new ProtectiveOrderService().protectFilledEntry(input(adapter));
    const protections = h.state.rows.filter((row) => row.kind);
    expect(protections).toHaveLength(2);
    expect(protections.every((row) => row.status === "placed")).toBe(true);
    expect(protections[0].siblingId).toBe(protections[1].id);
    expect(protections[1].siblingId).toBe(protections[0].id);
  });

  it("cancels the placed target when the stop fills", async () => {
    const adapter = adapterFor(async (request) => ({
      brokerOrderId: request.clientOrderId, clientOrderId: request.clientOrderId,
      status: "open", filledQuantity: request.quantity, raw: request,
    }));
    await new ProtectiveOrderService().protectFilledEntry(input(adapter));
    const stop = h.state.rows.find((row) => row.kind === "stop_loss")!;
    const target = h.state.rows.find((row) => row.kind === "take_profit")!;
    adapter.getOrder.mockImplementation(async (_accountId: string, brokerOrderId: string) => ({
      brokerOrderId, status: brokerOrderId === stop.brokerOrderId ? "filled" : "open",
      clientOrderId: brokerOrderId, filledQuantity: 0, raw: {},
    }));
    await new ProtectiveOrderService().reconcile("acct", adapter);
    expect(adapter.cancelOrder).toHaveBeenCalledWith("acct", target.brokerOrderId);
    expect(h.state.rows.find((row) => row.id === stop.id)?.status).toBe("filled");
    expect(h.state.rows.find((row) => row.id === target.id)?.status).toBe("cancelled");
  });

  it("recreates missing protection during open-position reconciliation", async () => {
    const adapter = adapterFor(async (request) => ({
      brokerOrderId: `broker-${request.clientOrderId}`, clientOrderId: request.clientOrderId,
      status: "open", filledQuantity: 0, raw: request,
    }));
    await new ProtectiveOrderService().reconcileOpenPosition(input(adapter));
    expect(h.state.rows.filter((row) => row.kind)).toHaveLength(2);
    expect(adapter.placeOrder).toHaveBeenCalledTimes(2);
  });

  it("issues one emergency close after three failures across retries and service instances", async () => {
    const adapter = adapterFor(async (request) => {
      if (request.type === "market") {
        return {
          brokerOrderId: "close", clientOrderId: request.clientOrderId,
          status: "filled", filledQuantity: request.quantity, raw: request,
        };
      }
      throw new Error("broker unavailable");
    });
    const first = new ProtectiveOrderService();
    await first.protectFilledEntry(input(adapter));
    await first.protectFilledEntry(input(adapter));
    await first.protectFilledEntry(input(adapter));
    await new ProtectiveOrderService().protectFilledEntry(input(adapter));
    expect(adapter.placeOrder.mock.calls.filter(([request]) => request.type === "market")).toHaveLength(1);
    expect(h.state.rows.some((row) => row.emergencyCloseIssued)).toBe(true);
  });

  it("replaces undersized broker orders without adding database rows", async () => {
    const adapter = adapterFor(async (request) => ({
      brokerOrderId: `broker-${request.clientOrderId}-${request.quantity}`,
      clientOrderId: request.clientOrderId, status: "open", filledQuantity: 0, raw: request,
    }));
    const service = new ProtectiveOrderService();
    await service.protectFilledEntry(input(adapter, 2));
    const ids = h.state.rows.filter((row) => row.kind).map((row) => row.id);
    await service.protectFilledEntry(input(adapter, 5));
    const protections = h.state.rows.filter((row) => row.kind);
    expect(protections).toHaveLength(2);
    expect(protections.map((row) => row.id)).toEqual(ids);
    expect(adapter.cancelOrder).toHaveBeenCalledTimes(2);
    expect(protections.every((row) => row.quantity === "5")).toBe(true);
  });
});