/**
 * Tests des routes de suivi des ordres stop de protection :
 *   GET  /api/broker/stop-orders        — liste avec statut + drapeau "active"
 *   POST /api/broker/orders/:id/cancel  — annulation (paper local, live via SnapTrade)
 *
 * Invariants critiques :
 * - jamais d'annulation locale optimiste en live : le statut ne passe à
 *   "cancelled" que si SnapTrade confirme ;
 * - un ordre non-stop ou déjà terminal n'est pas annulable (400/409).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const h = vi.hoisted(() => ({
  cancelBrokerOrder: vi.fn(),
  getTradingMode: vi.fn(() => "paper"),
  // état simulé de la base
  orders: [] as Record<string, unknown>[],
  connections: [] as Record<string, unknown>[],
  updates: [] as { set: Record<string, unknown> }[],
}));

vi.mock("@workspace/db", () => {
  // Sélecteur minimal : broker_connections (via orderBy/limit sans where) et
  // orders (via where). On distingue par la table passée à from().
  const makeSelect = () => ({
    from: (table: unknown) => {
      const isOrders = table === ordersTableSentinel;
      const rows = () => (isOrders ? h.orders : h.connections);
      const chain = {
        where: () => ({
          limit: () => Promise.resolve(rows()),
          orderBy: () => ({ limit: () => Promise.resolve(rows()) }),
        }),
        orderBy: () => ({ limit: () => Promise.resolve(rows()) }),
        limit: () => Promise.resolve(rows()),
      };
      return chain;
    },
  });
  const ordersTableSentinel = { __table: "orders", orderType: "orderType", createdAt: "createdAt", id: "id", status: "status", mode: "mode" };
  return {
    db: {
      select: makeSelect,
      update: () => ({
        set: (set: Record<string, unknown>) => {
          h.updates.push({ set });
          return {
            where: () => ({
              returning: () => Promise.resolve([{ ...(h.orders[0] ?? {}), ...set }]),
            }),
          };
        },
      }),
    },
    brokerConnectionsTable: { __table: "broker_connections", id: "id" },
    ordersTable: ordersTableSentinel,
    appSettingsTable: {},
  };
});
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), desc: vi.fn(), and: vi.fn(), inArray: vi.fn() }));
vi.mock("../../lib/snaptrade", () => ({
  registerSnaptradeUser: vi.fn(),
  getConnectionPortalUrl: vi.fn(),
  listAccounts: vi.fn(),
  listPositions: vi.fn(),
  listBalances: vi.fn(),
  refreshConnection: vi.fn(),
  getSnaptradeClientAsync: vi.fn(),
  resolveCredentials: vi.fn(),
  invalidateSnaptradeClient: vi.fn(),
  cancelBrokerOrder: h.cancelBrokerOrder,
}));
vi.mock("../../lib/tradingMode", () => ({ getTradingMode: h.getTradingMode, setTradingMode: vi.fn() }));
vi.mock("../../lib/orderEngine", () => ({ submitOrder: vi.fn(), OrderValidationError: class extends Error {} }));
vi.mock("../../lib/settings", () => ({ getRiskSettings: vi.fn() }));
vi.mock("../../lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("../../lib/notifications", () => ({ notifyKillSwitchActivated: vi.fn() }));
vi.mock("../../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../workers/autoTradeWorker", () => ({ syncLiveOrderFills: vi.fn() }));

describe("routes ordres stop de protection", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const { default: router } = await import("../broker");
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { log: Record<string, () => void> }).log = { info: () => {}, warn: () => {}, error: () => {} };
      next();
    });
    app.use("/api", router);
    await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/api`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  beforeEach(() => {
    h.cancelBrokerOrder.mockReset();
    h.getTradingMode.mockReturnValue("paper");
    h.orders = [];
    h.connections = [];
    h.updates = [];
  });

  const stopOrder = (over: Record<string, unknown> = {}) => ({
    id: 7,
    signalId: "sig-1",
    symbol: "AAPL",
    side: "sell",
    quantity: "3",
    orderType: "stop",
    mode: "paper",
    status: "simulated",
    expectedPrice: "180",
    fillPrice: null,
    filledQuantity: null,
    snaptradeOrderId: null,
    brokerAccountId: null,
    errorMessage: null,
    submittedAt: null,
    createdAt: new Date("2026-07-30T12:00:00Z"),
    ...over,
  });

  describe("GET /broker/stop-orders", () => {
    it("marque actifs les statuts pending/submitted/simulated, inactifs les terminaux", async () => {
      h.orders = [
        stopOrder({ id: 1, status: "simulated" }),
        stopOrder({ id: 2, status: "filled" }),
        stopOrder({ id: 3, status: "cancelled" }),
      ];
      const res = await fetch(`${base}/broker/stop-orders`);
      expect(res.status).toBe(200);
      const body = await res.json();
      const byId = Object.fromEntries(body.orders.map((o: { id: number; active: boolean }) => [o.id, o.active]));
      expect(byId).toEqual({ 1: true, 2: false, 3: false });
    });
  });

  describe("POST /broker/orders/:id/cancel", () => {
    it("refuse un ordre non-stop (400)", async () => {
      h.orders = [stopOrder({ orderType: "market" })];
      const res = await fetch(`${base}/broker/orders/7/cancel`, { method: "POST" });
      expect(res.status).toBe(400);
      expect(h.cancelBrokerOrder).not.toHaveBeenCalled();
    });

    it("refuse un ordre déjà terminal (409) sans toucher au courtier", async () => {
      h.orders = [stopOrder({ status: "filled" })];
      const res = await fetch(`${base}/broker/orders/7/cancel`, { method: "POST" });
      expect(res.status).toBe(409);
      expect(h.cancelBrokerOrder).not.toHaveBeenCalled();
      expect(h.updates).toHaveLength(0);
    });

    it("ordre paper simulé → annulation locale, statut cancelled", async () => {
      h.orders = [stopOrder({ mode: "paper", status: "simulated" })];
      const res = await fetch(`${base}/broker/orders/7/cancel`, { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.order.status).toBe("cancelled");
      expect(h.cancelBrokerOrder).not.toHaveBeenCalled();
    });

    it("ordre live sans identifiant courtier → 409, jamais d'annulation locale", async () => {
      h.orders = [stopOrder({ mode: "live", status: "submitted", snaptradeOrderId: null })];
      const res = await fetch(`${base}/broker/orders/7/cancel`, { method: "POST" });
      expect(res.status).toBe(409);
      expect(h.updates).toHaveLength(0);
    });

    it("ordre live → annulation SnapTrade confirmée puis statut cancelled", async () => {
      h.orders = [stopOrder({ mode: "live", status: "submitted", snaptradeOrderId: "bo-1", brokerAccountId: "acc-1" })];
      h.connections = [{ id: 1, snaptradeUserId: "u", snaptradeUserSecret: "s", status: "connected" }];
      h.cancelBrokerOrder.mockResolvedValue({ ok: true });
      const res = await fetch(`${base}/broker/orders/7/cancel`, { method: "POST" });
      expect(res.status).toBe(200);
      expect(h.cancelBrokerOrder).toHaveBeenCalledWith({
        userId: "u", userSecret: "s", accountId: "acc-1", brokerageOrderId: "bo-1",
      });
      expect(h.updates.at(-1)?.set.status).toBe("cancelled");
    });

    it("refus SnapTrade → 409, PAS de passage local à cancelled", async () => {
      h.orders = [stopOrder({ mode: "live", status: "submitted", snaptradeOrderId: "bo-1", brokerAccountId: "acc-1" })];
      h.connections = [{ id: 1, snaptradeUserId: "u", snaptradeUserSecret: "s", status: "connected" }];
      h.cancelBrokerOrder.mockRejectedValue(new Error("order not cancellable"));
      const res = await fetch(`${base}/broker/orders/7/cancel`, { method: "POST" });
      expect(res.status).toBe(409);
      expect(h.updates.every((u) => u.set.status !== "cancelled")).toBe(true);
    });
  });
});
