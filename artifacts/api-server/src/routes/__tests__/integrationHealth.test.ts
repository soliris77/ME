import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({
  getQuotes: vi.fn(),
  resolveCredentials: vi.fn(),
  getSnaptradeClientAsync: vi.fn(),
  resolveCred: vi.fn(),
  isWhopConfigured: vi.fn(),
  getAutoTradeWorkerStatus: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const query = {
    from: () => query,
    where: () => query,
    orderBy: () => query,
    limit: async () => [],
  };
  return {
    db: { select: vi.fn(() => query) },
    autoTradeRulesTable: { id: "id", enabled: "enabled" },
    brokerConnectionsTable: { id: "id", status: "status", tradingHalted: "tradingHalted" },
  };
});
vi.mock("../../lib/auth", () => ({
  requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) =>
    req.header("x-test-auth") === "yes"
      ? next()
      : res.status(401).json({ error: "Authentification requise." }),
}));
vi.mock("../../lib/snaptrade", () => ({
  resolveCredentials: mocks.resolveCredentials,
  getSnaptradeClientAsync: mocks.getSnaptradeClientAsync,
}));
vi.mock("../../lib/yahoo", () => ({
  getQuotes: mocks.getQuotes,
  cotationPerimee: () => false,
}));
vi.mock("../../lib/persistCreds", () => ({ resolveCred: mocks.resolveCred }));
vi.mock("../../whopClient", () => ({ isWhopConfigured: mocks.isWhopConfigured }));
vi.mock("../../lib/tradingMode", () => ({ getTradingMode: () => "paper" }));
vi.mock("../../workers/autoTradeWorker", () => ({
  getAutoTradeWorkerStatus: mocks.getAutoTradeWorkerStatus,
}));

import healthRouter from "../health";

async function makeServer() {
  const app = express();
  app.use("/api", healthRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, url: `http://127.0.0.1:${port}/api/integrations/health` };
}

describe("GET /api/integrations/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCredentials.mockResolvedValue({
      clientId: "public-id",
      consumerKey: "snaptrade-super-secret",
      userId: "user-secret",
      userSecret: "another-secret",
    });
    mocks.getSnaptradeClientAsync.mockResolvedValue({ apiStatus: { check: vi.fn().mockResolvedValue({}) } });
    mocks.getQuotes.mockResolvedValue([{ price: 100, marketTime: new Date().toISOString(), marketState: "REGULAR" }]);
    mocks.resolveCred.mockResolvedValue("twilio-secret");
    mocks.isWhopConfigured.mockReturnValue(true);
    mocks.getAutoTradeWorkerStatus.mockReturnValue({ running: true, cycleInFlight: false });
    process.env.RESEND_API_KEY = "resend-super-secret";
  });

  it("requires authentication", async () => {
    const { server, url } = await makeServer();
    try {
      expect((await fetch(url)).status).toBe(401);
    } finally {
      server.close();
    }
  });

  it("returns the documented shape without secret values", async () => {
    const { server, url } = await makeServer();
    try {
      const response = await fetch(url, { headers: { "x-test-auth": "yes" } });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        overall: "ok",
        entries: {
          snaptrade: { configured: true, reachable: "ok" },
          yahoo: { configured: true, fresh: true },
          twilio: { configured: true },
          resend: { configured: true },
          whop: { configured: true },
          autoTrader: { mode: "paper", worker: "running" },
        },
      });
      expect(new Date(body.generatedAt).toISOString()).toBe(body.generatedAt);
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain("super-secret");
      expect(serialized).not.toContain("user-secret");
      expect(serialized).not.toContain("another-secret");
    } finally {
      server.close();
    }
  });

  it("reports a degraded Yahoo check without failing the endpoint", async () => {
    mocks.getQuotes.mockResolvedValue([]);
    const { server, url } = await makeServer();
    try {
      const response = await fetch(url, { headers: { "x-test-auth": "yes" } });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.overall).toBe("degraded");
      expect(body.entries.yahoo).toMatchObject({ status: "degraded", reachable: "unavailable" });
    } finally {
      server.close();
    }
  });
});