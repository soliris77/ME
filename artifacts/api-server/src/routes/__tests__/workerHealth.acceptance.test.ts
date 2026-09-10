import { describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";

const state = vi.hoisted(() => ({
  health: {
    id: 1,
    lastCycleExecutedAt: new Date("2026-01-01T12:00:00.000Z"),
    latestCandleAt: new Date("2026-01-01T11:59:00.000Z"),
    killSwitchActive: true,
    pendingProtectiveOrderCount: 3,
  },
}));

vi.mock("@workspace/db", () => ({
  workerHealthTable: { id: "worker_health.id" },
  autoTradeRulesTable: { id: "rules.id", enabled: "rules.enabled" },
  brokerConnectionsTable: { id: "connections.id", tradingHalted: "connections.trading_halted" },
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([state.health]),
        orderBy: () => ({ limit: () => Promise.resolve([]) }),
      }),
    }),
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  desc: () => ({}),
}));
vi.mock("../../workers/workerLease", () => ({
  databaseLeaseRepository: {
    status: async () => ({ ownerToken: "test-owner", leaseUntil: new Date("2099-01-01T00:00:00.000Z") }),
  },
}));
vi.mock("../../workers/autoTradeWorker", () => ({
  getAutoTradeWorkerStatus: () => ({ running: false, cycleInFlight: false }),
}));
vi.mock("../../lib/auth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

describe("GET /api/health/worker", () => {
  it("returns all required worker indicators over the mounted HTTP route", async () => {
    const { default: healthRouter } = await import("../health");
    const app = express();
    app.use("/api", healthRouter);
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/health/worker`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        lastCycleExecutedAt: "2026-01-01T12:00:00.000Z",
        latestCandleAt: "2026-01-01T11:59:00.000Z",
        killSwitchActive: true,
        pendingProtectiveOrderCount: 3,
      });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});