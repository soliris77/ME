/**
 * Test d'intégration — le score de discipline reflète les VRAIES exécutions
 * du courtier en mode live : un aller-retour dont les ordres sont "submitted"
 * en base est d'abord rapproché de SnapTrade (mocké ici) qui confirme les
 * fills ; le trade apparaît alors dans /api/performance/discipline avec les
 * prix d'exécution réels. S'exécute contre la vraie base. Ignoré si
 * DATABASE_URL n'est pas défini.
 */
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

const SYMBOL = "__TEST_DISC__";
const ACCOUNT = "test-discipline-account";

// SnapTrade mocké : confirme l'exécution des deux ordres avec des prix réels
// différents des prix attendus.
vi.mock("../../lib/snaptrade", () => ({
  getSnaptradeClientAsync: async () => ({
    accountInformation: {
      getUserAccountOrders: async () => ({
        data: [
          { brokerage_order_id: "st-disc-buy", status: "EXECUTED", execution_price: 101, filled_quantity: 10 },
          { brokerage_order_id: "st-disc-sell", status: "EXECUTED", execution_price: 119.5, filled_quantity: 10 },
        ],
      }),
    },
  }),
}));
vi.mock("../../lib/brokerAdapter", () => ({
  resolveBrokerAdapter: () => ({
    listOrders: async () => ([
      { brokerOrderId: "st-disc-buy", clientOrderId: "", status: "filled", averagePrice: 101, filledQuantity: 10, raw: {} },
      { brokerOrderId: "st-disc-sell", clientOrderId: "", status: "filled", averagePrice: 119.5, filledQuantity: 10, raw: {} },
    ]),
  }),
}));

// Mode live forcé pour que getDisciplineReport déclenche la synchronisation.
vi.mock("../../lib/tradingMode", () => ({ getTradingMode: () => "live" }));

d("discipline — fills live synchronisés depuis le courtier (intégration DB)", () => {
  let server: Server;
  let base: string;
  let insertedConn = false;

  beforeAll(async () => {
    const { db, ordersTable, brokerConnectionsTable } = await import("@workspace/db");

    // Connexion courtier requise par la synchronisation (créée si absente).
    const existing = await db.select().from(brokerConnectionsTable).limit(1);
    if (existing.length === 0) {
      await db.insert(brokerConnectionsTable).values({
        snaptradeUserId: "test-user",
        snaptradeUserSecret: "test-secret",
        status: "connected",
      });
      insertedConn = true;
    }

    // Aller-retour live encore "submitted" en base — l'état que laisse
    // l'orderEngine tant que le courtier n'a pas confirmé l'exécution.
    await db.insert(ordersTable).values([
      {
        signalId: "test-disc-buy", symbol: SYMBOL, side: "buy", quantity: "10",
        orderType: "market", mode: "live", status: "submitted",
        expectedPrice: "100", snaptradeOrderId: "st-disc-buy", brokerAccountId: ACCOUNT,
        createdAt: new Date("2026-07-01T10:00:00Z"),
      },
      {
        signalId: "test-disc-sell", symbol: SYMBOL, side: "sell", quantity: "10",
        orderType: "market", mode: "live", status: "submitted",
        expectedPrice: "120", snaptradeOrderId: "st-disc-sell", brokerAccountId: ACCOUNT,
        createdAt: new Date("2026-07-08T10:00:00Z"),
      },
    ]);

    const { default: router } = await import("../performance");
    const app = express();
    app.use("/api", router);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/api`;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { pool } = await import("@workspace/db");
    await pool.query("DELETE FROM orders WHERE symbol = $1", [SYMBOL]).catch(() => {});
    if (insertedConn) {
      await pool.query("DELETE FROM broker_connections WHERE snaptrade_user_id = 'test-user'").catch(() => {});
    }
    await pool.end().catch(() => {});
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it("un fill confirmé par le courtier apparaît dans le rapport avec le prix d'exécution réel", async () => {
    const res = await fetch(`${base}/performance/discipline`);
    expect(res.status).toBe(200);
    const report = (await res.json()) as {
      trades: { symbol: string; entryPrice: number; exitPrice: number; pnl: number }[];
    };

    const trade = report.trades.find((t) => t.symbol === SYMBOL);
    expect(trade).toBeDefined();
    // Prix d'exécution réels (101 / 119.5), pas les prix attendus (100 / 120).
    expect(trade!.entryPrice).toBe(101);
    expect(trade!.exitPrice).toBe(119.5);
    expect(trade!.pnl).toBeCloseTo(185);

    // La synchronisation a bien persisté les fills en base.
    const { pool } = await import("@workspace/db");
    const rows = await pool.query(
      "SELECT status, fill_price FROM orders WHERE symbol = $1 ORDER BY created_at",
      [SYMBOL],
    );
    expect(rows.rows.map((r: { status: string }) => r.status)).toEqual(["filled", "filled"]);
    expect(rows.rows.map((r: { fill_price: string }) => Number(r.fill_price))).toEqual([101, 119.5]);
  });
});
