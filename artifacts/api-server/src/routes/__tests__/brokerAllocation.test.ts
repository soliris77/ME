/**
 * Tests de GET /api/broker/allocation — répartition du portefeuille :
 * secteurs, devises, espèces vs investi.
 *
 * Invariants critiques :
 * - courtier non configuré / non connecté → connected:false avec message explicite,
 *   jamais un tableau vide silencieux ;
 * - taux de change manquant → montants exclus des totaux CAD + fxWarning,
 *   jamais une conversion silencieuse à 1:1 ;
 * - FNB sans secteur → « FNB / Fonds », inconnu → « Secteur inconnu »
 *   (jamais un secteur inventé).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const h = vi.hoisted(() => ({
  connections: [] as Record<string, unknown>[],
  listPositions: vi.fn(),
  listBalances: vi.fn(),
  getAssetProfiles: vi.fn(),
  getQuotes: vi.fn(),
}));
vi.mock("../../lib/connectionResolver", () => ({
  resolveAuthoritativeConnection: vi.fn(async () => h.connections.find((c) => c.status === "connected" || c.status === "pending") ?? null),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        orderBy: () => ({ limit: () => Promise.resolve(h.connections) }),
        limit: () => Promise.resolve(h.connections),
        where: () => ({
          limit: () => Promise.resolve([]),
          orderBy: () => ({ limit: () => Promise.resolve([]) }),
        }),
      }),
    }),
  },
  brokerConnectionsTable: { id: "id" },
  ordersTable: {},
  appSettingsTable: {},
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), desc: vi.fn(), and: vi.fn(), inArray: vi.fn() }));
vi.mock("../../lib/snaptrade", () => ({
  registerSnaptradeUser: vi.fn(),
  getConnectionPortalUrl: vi.fn(),
  listAccounts: vi.fn(),
  listPositions: h.listPositions,
  listBalances: h.listBalances,
  refreshConnection: vi.fn(),
  getSnaptradeClientAsync: vi.fn(),
  resolveCredentials: vi.fn(),
  invalidateSnaptradeClient: vi.fn(),
  cancelBrokerOrder: vi.fn(),
}));
vi.mock("../../lib/yahoo", () => ({
  getAssetProfiles: h.getAssetProfiles,
  getQuotes: h.getQuotes,
}));
vi.mock("../../lib/tradingMode", () => ({ getTradingMode: vi.fn(() => "paper"), setTradingMode: vi.fn() }));
vi.mock("../../lib/orderEngine", () => ({ submitOrder: vi.fn(), OrderValidationError: class extends Error {} }));
vi.mock("../../lib/settings", () => ({ getRiskSettings: vi.fn() }));
vi.mock("../../lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("../../lib/notifications", () => ({ notifyKillSwitchActivated: vi.fn() }));
vi.mock("../../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../workers/autoTradeWorker", () => ({ syncLiveOrderFills: vi.fn() }));

describe("GET /broker/allocation", () => {
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
    h.connections = [];
    h.listPositions.mockReset();
    h.listBalances.mockReset();
    h.getAssetProfiles.mockReset();
    h.getQuotes.mockReset();
  });

  const connectedConn = () => ({
    id: 1,
    provider: "snaptrade",
    snaptradeUserId: "u",
    snaptradeUserSecret: "s",
    status: "connected",
    accounts: [{ id: "acc-1", name: "TFSA" }],
  });

  // Position au format SnapTrade (SDK 10.x) : Position.currency = devise de la
  // position (celle de `price`), Position.symbol.symbol.currency = devise de
  // cotation du titre — les deux peuvent différer.
  const pos = (ticker: string, units: number, price: number, currency: string, over: Record<string, unknown> = {}) => ({
    symbol: { symbol: { symbol: ticker, currency: { code: currency }, description: ticker } },
    currency: { code: currency },
    units,
    price,
    ...over,
  });

  it("courtier non configuré → connected:false + message explicite", async () => {
    const res = await fetch(`${base}/broker/allocation`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.connected).toBe(false);
    expect(body.reason).toBe("not_setup");
    expect(body.message).toBeTruthy();
  });

  it("connexion en attente (pending) → connected:false", async () => {
    h.connections = [{ ...connectedConn(), status: "pending" }];
    const body = await (await fetch(`${base}/broker/allocation`)).json();
    expect(body.connected).toBe(false);
    expect(body.reason).toBe("pending");
  });

  it("agrège secteurs, devises et espèces avec conversion USD→CAD", async () => {
    h.connections = [connectedConn()];
    h.listPositions.mockResolvedValue([
      pos("AAPL", 10, 200, "USD"),   // 2000 USD → 3000 CAD
      pos("RY.TO", 20, 100, "CAD"),  // 2000 CAD
      pos("XEQT.TO", 30, 30, "CAD"), // 900 CAD — FNB sans secteur
    ]);
    h.listBalances.mockResolvedValue([
      { currency: { code: "CAD" }, cash: 500 },
      { currency: { code: "USD" }, cash: 100 }, // → 150 CAD
    ]);
    h.getAssetProfiles.mockResolvedValue(new Map([
      ["AAPL", { sector: "Technology", quoteType: "EQUITY" }],
      ["RY.TO", { sector: "Financial Services", quoteType: "EQUITY" }],
      ["XEQT.TO", { sector: null, quoteType: "ETF" }],
    ]));
    h.getQuotes.mockResolvedValue([{ symbol: "USDCAD=X", price: 1.5 }]);

    const body = await (await fetch(`${base}/broker/allocation`)).json();
    expect(body.connected).toBe(true);
    expect(body.fxWarning).toBeNull();

    // Totaux : investi = 3000 + 2000 + 900 = 5900 ; cash = 500 + 150 = 650
    expect(body.totals.investedCad).toBeCloseTo(5900);
    expect(body.totals.cashCad).toBeCloseTo(650);
    expect(body.totals.totalCad).toBeCloseTo(6550);
    expect(body.totals.cashPct).toBeCloseTo((650 / 6550) * 100);

    // Secteurs — triés par valeur décroissante, FNB classé explicitement
    const sectors = Object.fromEntries(body.bySector.map((s: { sector: string; valueCad: number }) => [s.sector, s.valueCad]));
    expect(sectors["Technology"]).toBeCloseTo(3000);
    expect(sectors["Financial Services"]).toBeCloseTo(2000);
    expect(sectors["FNB / Fonds"]).toBeCloseTo(900);

    // Devises
    const cur = Object.fromEntries(body.byCurrency.map((c: { currency: string; total: number; totalCad: number }) => [c.currency, c]));
    expect(cur["USD"].invested).toBeCloseTo(2000);
    expect(cur["USD"].cash).toBeCloseTo(100);
    expect(cur["USD"].totalCad).toBeCloseTo(3150);
    expect(cur["CAD"].totalCad).toBeCloseTo(3400);
  });

  it("taux de change manquant → fxWarning + montants exclus (jamais 1:1 silencieux)", async () => {
    h.connections = [connectedConn()];
    h.listPositions.mockResolvedValue([
      pos("AAPL", 10, 200, "USD"),
      pos("RY.TO", 10, 100, "CAD"),
    ]);
    h.listBalances.mockResolvedValue([]);
    h.getAssetProfiles.mockResolvedValue(new Map([
      ["AAPL", { sector: "Technology", quoteType: "EQUITY" }],
      ["RY.TO", { sector: "Financial Services", quoteType: "EQUITY" }],
    ]));
    h.getQuotes.mockResolvedValue([]); // Yahoo avale les erreurs → liste vide

    const body = await (await fetch(`${base}/broker/allocation`)).json();
    expect(body.fxWarning).toContain("USD");
    // Seule la position CAD entre dans les totaux
    expect(body.totals.investedCad).toBeCloseTo(1000);
    // La position USD reste listée avec valueCad:null (pas de conversion inventée)
    const aapl = body.positions.find((p: { symbol: string }) => p.symbol === "AAPL");
    expect(aapl.valueCad).toBeNull();
  });

  it("devise de position ≠ devise de cotation → la devise de POSITION prime", async () => {
    h.connections = [connectedConn()];
    // Titre coté en USD (listing) mais détenu/valorisé en CAD par le courtier
    h.listPositions.mockResolvedValue([
      {
        symbol: { symbol: { symbol: "DLR.TO", currency: { code: "USD" } } },
        currency: { code: "CAD" }, // devise de la position — celle de `price`
        units: 100,
        price: 13.5,
      },
    ]);
    h.listBalances.mockResolvedValue([]);
    h.getAssetProfiles.mockResolvedValue(new Map());
    h.getQuotes.mockResolvedValue([{ symbol: "USDCAD=X", price: 1.5 }]);

    const body = await (await fetch(`${base}/broker/allocation`)).json();
    const p = body.positions.find((x: { symbol: string }) => x.symbol === "DLR.TO");
    expect(p.currency).toBe("CAD");
    // 1350 CAD tel quel — PAS converti comme si c'était de l'USD (2025 CAD serait faux)
    expect(p.valueCad).toBeCloseTo(1350);
    expect(body.totals.investedCad).toBeCloseTo(1350);
  });

  it("équivalent de trésorerie (fonds monétaire) exclu des positions — déjà compté dans le cash", async () => {
    h.connections = [connectedConn()];
    h.listPositions.mockResolvedValue([
      pos("RY.TO", 10, 100, "CAD"),
      pos("CASH.TO", 50, 50, "CAD", { cash_equivalent: true }), // 2500 déjà dans le solde
    ]);
    h.listBalances.mockResolvedValue([{ currency: { code: "CAD" }, cash: 2500 }]);
    h.getAssetProfiles.mockResolvedValue(new Map([["RY.TO", { sector: "Financial Services", quoteType: "EQUITY" }]]));
    h.getQuotes.mockResolvedValue([]);

    const body = await (await fetch(`${base}/broker/allocation`)).json();
    expect(body.totals.investedCad).toBeCloseTo(1000); // pas 3500
    expect(body.totals.cashCad).toBeCloseTo(2500);
    expect(body.positions.some((p: { symbol: string }) => p.symbol === "CASH.TO")).toBe(false);
  });

  it("profil inconnu → « Secteur inconnu », jamais un secteur inventé", async () => {
    h.connections = [connectedConn()];
    h.listPositions.mockResolvedValue([pos("ZZZZ", 5, 10, "CAD")]);
    h.listBalances.mockResolvedValue([]);
    h.getAssetProfiles.mockResolvedValue(new Map());
    h.getQuotes.mockResolvedValue([]);

    const body = await (await fetch(`${base}/broker/allocation`)).json();
    expect(body.bySector[0].sector).toBe("Secteur inconnu");
  });

  it("tous les comptes en erreur → 502 avec accountErrors", async () => {
    h.connections = [connectedConn()];
    h.listPositions.mockRejectedValue(new Error("SnapTrade down"));
    h.listBalances.mockRejectedValue(new Error("SnapTrade down"));

    const res = await fetch(`${base}/broker/allocation`);
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.accountErrors).toHaveLength(1);
    expect(body.error).toBeTruthy();
  });

  it("connecté sans compte synchronisé → empty + message", async () => {
    h.connections = [{ ...connectedConn(), accounts: [] }];
    const body = await (await fetch(`${base}/broker/allocation`)).json();
    expect(body.connected).toBe(true);
    expect(body.empty).toBe(true);
    expect(body.message).toBeTruthy();
  });
});
