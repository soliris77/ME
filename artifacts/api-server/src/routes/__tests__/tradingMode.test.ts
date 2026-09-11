import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const h = vi.hoisted(() => ({
  armLiveTrading: vi.fn(),
  listAccounts: vi.fn(),
  getLiveArm: vi.fn(),
  getTradingMode: vi.fn(() => "paper"),
  logAudit: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        orderBy: () => ({
          limit: () => Promise.resolve([{
            status: "connected",
            snaptradeUserId: "user-1",
            snaptradeUserSecret: "secret-1",
          }]),
        }),
      }),
    },
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  },
  brokerConnectionsTable: { id: "id" },
  ordersTable: {},
  appSettingsTable: {},
}));
vi.mock("drizzle-orm", () => ({ desc: vi.fn(), eq: vi.fn() }));
vi.mock("../../lib/snaptrade", () => ({
  registerSnaptradeUser: vi.fn(),
  getConnectionPortalUrl: vi.fn(),
  listAccounts: h.listAccounts,
  listPositions: vi.fn(),
  listBalances: vi.fn(),
  refreshConnection: vi.fn(),
  getSnaptradeClientAsync: vi.fn(),
  resolveCredentials: vi.fn(),
  invalidateSnaptradeClient: vi.fn(),
  cancelBrokerOrder: vi.fn(),
}));
vi.mock("../../lib/tradingMode", () => ({
  getTradingMode: h.getTradingMode,
  getLiveArm: h.getLiveArm,
  armLiveTrading: h.armLiveTrading,
  disarmLiveTrading: vi.fn(),
  MIN_LIVE_ARM_DURATION_MINUTES: 1,
  MAX_LIVE_ARM_DURATION_MINUTES: 480,
}));
vi.mock("../../lib/yahoo", () => ({ getAssetProfiles: vi.fn(), getQuotes: vi.fn() }));
vi.mock("../../lib/orderEngine", () => ({
  submitOrder: vi.fn(),
  OrderValidationError: class OrderValidationError extends Error {},
}));
vi.mock("../../lib/settings", () => ({ getRiskSettings: vi.fn() }));
vi.mock("../../lib/audit", () => ({ logAudit: h.logAudit }));
vi.mock("../../lib/notifications", () => ({ notifyKillSwitchActivated: vi.fn() }));
vi.mock("../../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe("POST /api/broker/trading-mode", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const { default: router } = await import("../broker");
    const app = express();
    app.use(express.json());
    app.use("/api", router);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/api`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  beforeEach(() => {
    h.armLiveTrading.mockReset();
    h.armLiveTrading.mockResolvedValue(undefined);
    h.listAccounts.mockReset();
    h.listAccounts.mockResolvedValue([{ id: "acct-1" }]);
    h.logAudit.mockReset();
  });

  it("arme le mode live sans exiger de confirmation écrite", async () => {
    const response = await fetch(`${base}/broker/trading-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "live",
        accountId: "acct-1",
        maxOrderValue: 1_000,
        dailyLossCap: 100,
        durationMinutes: 60,
        liveAcknowledged: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(h.armLiveTrading).toHaveBeenCalledOnce();
    expect(h.armLiveTrading.mock.calls[0][0]).toMatchObject({
      accountId: "acct-1",
      maxOrderValue: 1_000,
      dailyLossCap: 100,
    });
  });

  it("refuse l'activation si la case de risque n'est pas cochée", async () => {
    const response = await fetch(`${base}/broker/trading-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "live",
        accountId: "acct-1",
        maxOrderValue: 1_000,
        dailyLossCap: 100,
        durationMinutes: 60,
        liveAcknowledged: false,
      }),
    });

    expect(response.status).toBe(400);
    expect(h.armLiveTrading).not.toHaveBeenCalled();
  });
});