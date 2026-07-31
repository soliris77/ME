/**
 * Tests de la route POST /api/broker/orders — validation stricte au boundary HTTP.
 * Fail closed : un orderType inconnu ne doit JAMAIS retomber silencieusement en
 * ordre market réel — il doit être rejeté en 400 avant tout appel à submitOrder.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const h = vi.hoisted(() => ({
  submitOrder: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: { select: () => ({ from: () => ({ limit: () => Promise.resolve([]), orderBy: () => ({ limit: () => Promise.resolve([]) }) }) }) },
  brokerConnectionsTable: {},
  ordersTable: {},
  appSettingsTable: {},
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), desc: vi.fn() }));
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
}));
vi.mock("../../lib/tradingMode", () => ({ getTradingMode: vi.fn(() => "paper"), setTradingMode: vi.fn() }));
vi.mock("../../lib/orderEngine", () => ({
  submitOrder: h.submitOrder,
  OrderValidationError: class OrderValidationError extends Error {},
}));
vi.mock("../../lib/settings", () => ({ getRiskSettings: vi.fn() }));
vi.mock("../../lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("../../lib/notifications", () => ({ notifyKillSwitchActivated: vi.fn() }));
vi.mock("../../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe("POST /api/broker/orders — validation orderType (fail closed)", () => {
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
    h.submitOrder.mockReset();
    h.submitOrder.mockResolvedValue({ status: "accepted", order: { id: 1, status: "simulated" } });
  });

  const post = (body: Record<string, unknown>) =>
    fetch(`${base}/broker/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signalId: "sig-t", symbol: "AAPL", side: "SELL", quantity: 1, ...body }),
    });

  it("orderType inconnu → 400, submitOrder JAMAIS appelé (pas de fallback market)", async () => {
    for (const bad of ["Stop", "STOP", "limit", "stoop", ""]) {
      const res = await post({ orderType: bad, stopPrice: 90 });
      expect(res.status).toBe(400);
      const payload = await res.json();
      expect(String(payload.error)).toContain("orderType invalide");
    }
    expect(h.submitOrder).not.toHaveBeenCalled();
  });

  it("orderType absent → market (comportement historique conservé)", async () => {
    const res = await post({ side: "BUY" });
    expect(res.status).toBe(201);
    expect(h.submitOrder).toHaveBeenCalledOnce();
    expect(h.submitOrder.mock.calls[0][0]).toMatchObject({ orderType: "market" });
  });

  it('orderType "stop" → transmis à submitOrder avec stopPrice', async () => {
    const res = await post({ orderType: "stop", stopPrice: 90.5 });
    expect(res.status).toBe(201);
    expect(h.submitOrder.mock.calls[0][0]).toMatchObject({ orderType: "stop", stopPrice: 90.5 });
  });
});
