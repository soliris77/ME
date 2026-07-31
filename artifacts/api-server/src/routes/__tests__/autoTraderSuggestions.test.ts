/**
 * Test de la route GET /api/auto-trader/suggestions.
 * - Auth : la route est montée derrière requireAuth au niveau du routeur global ;
 *   ici on monte le routeur isolément (comme les tests frères broker*) et on
 *   vérifie le CONTRAT (statut + forme). La couverture d'authentification est
 *   assurée par le montage global requireAuth (routes/index.ts).
 * - Forme : portefeuille + watchlist vides → { suggestions: [], message } ;
 *   position non protégée → au moins une suggestion avec un prefill complet.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const h = vi.hoisted(() => ({
  // Lignes renvoyées par table, pilotées par test.
  rules: [] as Record<string, unknown>[],
  connections: [] as Record<string, unknown>[],
  watchlist: [] as Record<string, unknown>[],
  positions: [] as unknown[],
}));

// Marqueurs de table (identité de référence suffisante pour le mock).
const rulesTable = { __t: "rules" };
const ordersTable = { __t: "orders" };
const connTable = { __t: "conn" };
const watchlistTable = { __t: "watchlist" };

function rowsFor(table: unknown): Record<string, unknown>[] {
  if (table === rulesTable) return h.rules;
  if (table === connTable) return h.connections;
  if (table === watchlistTable) return h.watchlist;
  return [];
}

// Thenable de requête drizzle minimal : supporte from/where/orderBy/limit + await.
function makeQuery(table?: unknown) {
  const rows = () => (table ? rowsFor(table) : []);
  const q: Record<string, unknown> = {};
  q.from = (t: unknown) => makeQuery(t);
  q.where = () => q;
  q.orderBy = () => q;
  q.limit = () => Promise.resolve(rows());
  q.then = (res: (v: unknown[]) => unknown) => res(rows());
  return q;
}

vi.mock("@workspace/db", () => ({
  db: { select: () => makeQuery() },
  autoTradeRulesTable: rulesTable,
  autoTradeLogsTable: { __t: "logs" },
  ordersTable,
  brokerConnectionsTable: connTable,
  autoTradeCopyBindingsTable: { __t: "bindings" },
  followedTradersTable: { __t: "traders" },
  watchlistTable,
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(), desc: vi.fn(() => ({})), and: vi.fn(), inArray: vi.fn(),
}));
vi.mock("../../lib/snaptrade", () => ({
  listPositions: vi.fn(async () => h.positions),
}));
vi.mock("../../lib/settings", () => ({
  getRiskSettings: vi.fn(async () => ({ maxOrderValue: 5000, maxPortfolioExposure: 25000, largeOrderFrictionPct: 0.5, maxDailyLossAmount: null, updatedAt: "" })),
}));
vi.mock("../../lib/tradingMode", () => ({ getTradingMode: vi.fn(() => "paper") }));
vi.mock("../../lib/yahoo", () => ({
  yahooFinance: { chart: vi.fn(async () => ({ quotes: [] })) },
  getQuotes: vi.fn(async () => []),
  guessCurrency: () => "USD",
}));
vi.mock("../../lib/globalRisk", () => ({
  computeGlobalRisk: vi.fn(), guessCurrency: () => "USD",
}));
vi.mock("../../lib/backtest", () => ({ runBacktest: vi.fn(), WARMUP: 55 }));
vi.mock("../../lib/signals", () => ({
  computeIndicators: vi.fn(() => []),
  analyzeTradingSignals: vi.fn(() => ({ score: 0, overall: "NEUTRE", signals: [], recommendation: "", beginnerSummary: "" })),
}));
vi.mock("../../workers/autoTradeWorker", () => ({
  runAutoTradeCheck: vi.fn(), getDailyRealizedPnLStatus: vi.fn(),
}));
vi.mock("../../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

describe("GET /api/auto-trader/suggestions — contrat (statut + forme)", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const { default: router } = await import("../autoTrader");
    const app = express();
    app.use(express.json());
    app.use("/api", router);
    await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/api`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  beforeEach(() => {
    h.rules = [];
    h.connections = [];
    h.watchlist = [];
    h.positions = [];
  });

  const get = () => fetch(`${base}/auto-trader/suggestions`).then(async (r) => ({ status: r.status, body: await r.json() }));

  it("portefeuille et watchlist vides → 200, suggestions [] + message amical", async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions).toHaveLength(0);
    expect(typeof body.message).toBe("string");
    expect(body.message.length).toBeGreaterThan(0);
  });

  it("position courtier non protégée → au moins une suggestion avec prefill complet", async () => {
    h.connections = [{ id: 1, status: "connected", snaptradeUserId: "u", snaptradeUserSecret: "s", accounts: [{ id: "acc-1" }] }];
    h.positions = [{ symbol: { symbol: { ticker: "AAPL" } }, units: 10, price: 150 }];

    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.suggestions.length).toBeGreaterThan(0);
    const s = body.suggestions[0];
    expect(typeof s.title).toBe("string");
    expect(typeof s.explanation).toBe("string");
    expect(s.prefill.symbol).toBe("AAPL");
    expect(["buy", "sell", "both"]).toContain(s.prefill.sideMode);
    expect(s.prefill.minScore).toBeGreaterThanOrEqual(10);
    expect(s.prefill.quantity).toBeGreaterThan(0);
  });
});
