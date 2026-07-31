/**
 * Tests des sorties de protection (checkProtectiveExits) et du trailing stop.
 * ─────────────────────────────────────────────────────────────────────────────
 * Invariant critique : l'état de position (openEntryPrice/openQuantity/highWaterMark)
 * ne doit être effacé QUE si la vente est confirmée (accepted ou duplicate).
 * Rejeté ou exception → la position reste suivie, nouvelle tentative au cycle suivant.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks hissés ──────────────────────────────────────────────────────────────
const h = vi.hoisted(() => {
  // Sentinelles de tables (identité d'objet suffisante pour le fake db)
  const rulesTable = { id: Symbol("rules.id"), enabled: Symbol("rules.enabled"), $inferSelect: undefined };
  const logsTable = { $inferSelect: undefined };
  const connectionsTable = { id: Symbol("conns.id"), $inferSelect: undefined };
  const ordersTable = { id: Symbol("orders.id"), createdAt: Symbol(), status: Symbol("orders.status"), mode: Symbol("orders.mode"), $inferSelect: undefined };
  const settingsTable = { $inferSelect: undefined };
  const auditLogTable = { id: Symbol(), action: Symbol(), createdAt: Symbol(), $inferSelect: undefined };

  const state = {
    rules: [] as Record<string, unknown>[],
    connections: [] as Record<string, unknown>[],
    settings: [] as Record<string, unknown>[],
    orders: [] as Record<string, unknown>[],
    auditRows: [] as Record<string, unknown>[],
    updates: [] as { table: unknown; set: Record<string, unknown> }[],
    inserts: [] as { table: unknown; values: Record<string, unknown> }[],
    deletes: [] as { table: unknown; where: unknown }[],
    txExecutes: [] as unknown[],
    nextAuditId: 1,
  };

  const rowsFor = (table: unknown) =>
    table === rulesTable ? state.rules :
    table === connectionsTable ? state.connections :
    table === settingsTable ? state.settings :
    table === ordersTable ? state.orders :
    table === auditLogTable ? state.auditRows : [];

  // Filtrage minimal des prédicats eq/gte/and pour les colonnes d'audit_log
  // (les autres tables ignorent le where, comme avant).
  const auditColName = (col: unknown) =>
    col === auditLogTable.action ? "action" :
    col === auditLogTable.createdAt ? "createdAt" :
    col === auditLogTable.id ? "id" :
    col === ordersTable.status ? "status" :
    col === ordersTable.mode ? "mode" :
    col === ordersTable.id ? "id" : null;
  const matches = (row: Record<string, unknown>, pred: unknown): boolean => {
    const p = pred as { and?: unknown[]; op?: string; col?: unknown; val?: unknown; vals?: unknown[] } | undefined;
    if (!p) return true;
    if (p.and) return p.and.every(sub => matches(row, sub));
    const name = auditColName(p.col);
    if (name == null) return true; // colonne d'une autre table → pas de filtre
    if (p.op === "eq") return row[name] === p.val;
    if (p.op === "gte") return (row[name] as Date) >= (p.val as Date);
    if (p.op === "inArray") return (p.vals ?? []).includes(row[name]);
    return true;
  };

  const thenable = (rows: unknown[]) => ({
    where: (pred?: unknown) => thenable(rows.filter(r => matches(r as Record<string, unknown>, pred))),
    orderBy: () => thenable(rows),
    limit: (n: number) => thenable(rows.slice(0, n)),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(res, rej),
  });

  const db = {
    select: () => ({ from: (table: unknown) => thenable(rowsFor(table)) }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: (pred?: unknown) => {
          state.updates.push({ table, set });
          // Les ordres sont réellement mutés : syncLiveOrderFills persiste les
          // fills PUIS le P&L relit la même table — la mutation doit être visible.
          if (table === ordersTable) {
            for (const row of state.orders) {
              if (matches(row, pred)) Object.assign(row, set);
            }
          }
          return Promise.resolve();
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        state.inserts.push({ table, values });
        return Promise.resolve();
      },
    }),
    delete: (table: unknown) => ({
      where: (where: unknown) => {
        state.deletes.push({ table, where });
        return Promise.resolve();
      },
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      // Fake tx : mêmes lectures que db, mais insert(...).returning() renvoie
      // la ligne créée avec un id, comme Postgres.
      const tx = {
        execute: (q: unknown) => {
          state.txExecutes.push(q);
          return Promise.resolve();
        },
        select: () => ({ from: (table: unknown) => thenable(rowsFor(table)) }),
        insert: (table: unknown) => ({
          values: (values: Record<string, unknown>) => ({
            returning: () => {
              const id = state.nextAuditId++;
              const row = { ...values, id, createdAt: new Date() }; // défaut DB now()
              state.inserts.push({ table, values: row });
              if (table === auditLogTable) state.auditRows.push(row);
              return Promise.resolve([{ id }]);
            },
          }),
        }),
      };
      return fn(tx);
    },
  };

  return {
    state, db, rulesTable, logsTable, connectionsTable, ordersTable, settingsTable, auditLogTable,
    notifyKillSwitchActivated: vi.fn().mockResolvedValue(undefined),
    notifyDailyLossWarning: vi.fn().mockResolvedValue(true),
    submitOrder: vi.fn(),
    getQuotes: vi.fn(),
    chart: vi.fn(),
    analyzeTradingSignals: vi.fn(),
    getTradingMode: vi.fn(),
    getUserAccountOrders: vi.fn(),
  };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  autoTradeRulesTable: h.rulesTable,
  autoTradeLogsTable: h.logsTable,
  brokerConnectionsTable: h.connectionsTable,
  ordersTable: h.ordersTable,
  appSettingsTable: h.settingsTable,
  auditLogTable: h.auditLogTable,
}));
vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  and: (...args: unknown[]) => ({ and: args }),
  gte: (col: unknown, val: unknown) => ({ op: "gte", col, val }),
  inArray: (col: unknown, vals: unknown) => ({ op: "inArray", col, vals }),
  sql: () => ({}),
}));
vi.mock("../../lib/yahoo", () => ({
  yahooFinance: { chart: h.chart },
  getQuotes: h.getQuotes,
}));
vi.mock("../../lib/orderEngine", () => ({ submitOrder: h.submitOrder }));
vi.mock("../../lib/signals", () => ({
  computeIndicators: (x: unknown) => x,
  analyzeTradingSignals: h.analyzeTradingSignals,
}));
vi.mock("../../lib/smsClient", () => ({ sendSms: vi.fn() }));
vi.mock("../../lib/emailClient", () => ({ sendEmail: vi.fn() }));
vi.mock("../../lib/notificationPrefs", () => ({
  resolveDestinations: vi.fn().mockResolvedValue({ sendSms: false, sendEmail: false }),
}));
vi.mock("../../lib/notifications", () => ({
  notifyKillSwitchActivated: h.notifyKillSwitchActivated,
  notifyDailyLossWarning: h.notifyDailyLossWarning,
}));
vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../lib/tradingMode", () => ({ getTradingMode: h.getTradingMode }));
vi.mock("../../lib/snaptrade", () => ({
  getSnaptradeClientAsync: async () => ({
    accountInformation: { getUserAccountOrders: h.getUserAccountOrders },
  }),
}));

import { checkProtectiveExits, processRule, checkDailyLossCircuitBreaker, maybeNotifyDailyLossWarning, getDailyRealizedPnLStatus } from "../autoTradeWorker";

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    symbol: "AAPL",
    name: null,
    enabled: true,
    sideMode: "buy",
    minScore: 60,
    quantity: "2",
    accountId: null,
    stopLossPct: "5",
    takeProfitPct: "10",
    trailingStopPct: null,
    highWaterMark: null,
    sizingMode: "fixed",
    riskAmount: null,
    confirmWeekly: false,
    maxTradesPerDay: 5,
    tradesToday: 0,
    tradesTodayResetAt: null,
    cooldownMinutes: 0,
    lastTriggeredAt: null,
    notifyOnSignal: false,
    lastSignalScore: null,
    lastSignalVerdict: null,
    openEntryPrice: "100",
    openQuantity: "2",
    openSince: new Date("2026-07-01T00:00:00Z"),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setPrice(symbol: string, price: number) {
  h.getQuotes.mockResolvedValue([{ symbol, regularMarketPrice: price }]);
}

/** Updates qui effacent la position (openEntryPrice: null). */
const clearingUpdates = () =>
  h.state.updates.filter(u => u.table === h.rulesTable && u.set.openEntryPrice === null);
/** Updates du plus-haut (highWaterMark seul). */
const hwmUpdates = () =>
  h.state.updates.filter(u =>
    u.table === h.rulesTable && "highWaterMark" in u.set && !("openEntryPrice" in u.set));
const exitLogs = () => h.state.inserts.filter(i => i.table === h.logsTable);

beforeEach(() => {
  vi.clearAllMocks();
  h.state.rules.length = 0;
  h.state.connections.length = 0;
  h.state.settings.length = 0;
  h.state.orders.length = 0;
  h.state.auditRows.length = 0;
  h.state.updates.length = 0;
  h.state.inserts.length = 0;
  h.state.deletes.length = 0;
  h.state.txExecutes.length = 0;
  h.state.nextAuditId = 1;
  h.getTradingMode.mockReturnValue("paper");
  h.notifyDailyLossWarning.mockResolvedValue(true);
});

// ── checkProtectiveExits — confirmation de la vente ───────────────────────────
describe("checkProtectiveExits — la position n'est effacée que si la vente est confirmée", () => {
  it("accepted → position effacée, log inséré, vente de la TOTALITÉ", async () => {
    h.state.rules.push(makeRule()); // entrée 100, SL 5 % → stop 95
    setPrice("AAPL", 94);
    h.submitOrder.mockResolvedValue({ status: "accepted", order: { id: 42, mode: "paper" } });

    await checkProtectiveExits(null);

    expect(h.submitOrder).toHaveBeenCalledOnce();
    const arg = h.submitOrder.mock.calls[0][0];
    expect(arg.side).toBe("SELL");
    expect(arg.quantity).toBe(2); // totalité de la position
    expect(arg.symbol).toBe("AAPL");
    // Identifiant STABLE par position : pas de composant aléatoire/horodaté,
    // pour que l'idempotence de submitOrder fonctionne d'un cycle à l'autre.
    expect(arg.signalId).toBe(`auto-1-stop_loss-${new Date("2026-07-01T00:00:00Z").getTime()}`);

    expect(clearingUpdates()).toHaveLength(1);
    expect(clearingUpdates()[0].set).toMatchObject({
      openEntryPrice: null, openQuantity: null, openSince: null, highWaterMark: null,
    });
    expect(exitLogs()).toHaveLength(1);
    expect(exitLogs()[0].values).toMatchObject({ triggerType: "stop_loss", orderId: 42, side: "SELL" });
  });

  it("duplicate (ordre sain) → position effacée aussi (déjà soumis à un cycle précédent)", async () => {
    h.state.rules.push(makeRule());
    setPrice("AAPL", 94);
    h.submitOrder.mockResolvedValue({ status: "duplicate", order: { status: "submitted" } });

    await checkProtectiveExits(null);

    expect(h.submitOrder).toHaveBeenCalledOnce(); // pas de re-soumission
    expect(clearingUpdates()).toHaveLength(1);
    expect(exitLogs()).toHaveLength(1);
    expect(exitLogs()[0].values).toMatchObject({ orderId: null });
  });

  it("accepted mais ordre en ERREUR courtier (mode live) → position CONSERVÉE", async () => {
    // Contrat réel de submitOrder : en live, un échec de l'appel courtier renvoie
    // quand même { status: "accepted", order: { status: "error" } }.
    h.state.rules.push(makeRule());
    setPrice("AAPL", 94);
    h.submitOrder.mockResolvedValue({
      status: "accepted",
      order: { id: 99, mode: "live", status: "error", errorMessage: "SnapTrade 500" },
    });

    await checkProtectiveExits(null);

    expect(clearingUpdates()).toHaveLength(0); // la vraie position est toujours ouverte
    expect(exitLogs()).toHaveLength(0);
  });

  it("duplicate pointant sur un ordre en ERREUR → re-soumission avec id de reprise", async () => {
    h.state.rules.push(makeRule());
    setPrice("AAPL", 94);
    h.submitOrder
      .mockResolvedValueOnce({ status: "duplicate", order: { id: 50, mode: "live", status: "error" } })
      .mockResolvedValueOnce({ status: "accepted", order: { id: 51, mode: "live", status: "submitted" } });

    await checkProtectiveExits(null);

    expect(h.submitOrder).toHaveBeenCalledTimes(2);
    const retryId = h.submitOrder.mock.calls[1][0].signalId as string;
    const baseId = h.submitOrder.mock.calls[0][0].signalId as string;
    expect(retryId.startsWith(`${baseId}-r`)).toBe(true); // id de reprise dérivé, unique
    expect(clearingUpdates()).toHaveLength(1); // la reprise a réussi → position effacée
    expect(exitLogs()[0].values).toMatchObject({ orderId: 51 });
  });

  it("duplicate en ERREUR puis reprise aussi en ERREUR → position CONSERVÉE", async () => {
    h.state.rules.push(makeRule());
    setPrice("AAPL", 94);
    h.submitOrder
      .mockResolvedValueOnce({ status: "duplicate", order: { status: "error" } })
      .mockResolvedValueOnce({ status: "accepted", order: { id: 52, mode: "live", status: "error" } });

    await checkProtectiveExits(null);

    expect(h.submitOrder).toHaveBeenCalledTimes(2);
    expect(clearingUpdates()).toHaveLength(0);
    expect(exitLogs()).toHaveLength(0);
  });

  it("rejected → position CONSERVÉE, aucun log, nouvelle tentative possible", async () => {
    h.state.rules.push(makeRule());
    setPrice("AAPL", 94);
    h.submitOrder.mockResolvedValue({ status: "rejected", reason: "kill_switch", message: "", details: {} });

    await checkProtectiveExits(null);

    expect(h.submitOrder).toHaveBeenCalledOnce();
    expect(clearingUpdates()).toHaveLength(0);
    expect(exitLogs()).toHaveLength(0);
  });

  it("exception de submitOrder → position CONSERVÉE, aucun log", async () => {
    h.state.rules.push(makeRule());
    setPrice("AAPL", 94);
    h.submitOrder.mockRejectedValue(new Error("réseau"));

    await checkProtectiveExits(null);

    expect(clearingUpdates()).toHaveLength(0);
    expect(exitLogs()).toHaveLength(0);
  });

  it("échec de getQuotes → aucune action, aucune vente", async () => {
    h.state.rules.push(makeRule());
    h.getQuotes.mockRejectedValue(new Error("yahoo down"));

    await checkProtectiveExits(null);

    expect(h.submitOrder).not.toHaveBeenCalled();
    expect(h.state.updates).toHaveLength(0);
  });

  it("pas de position ouverte → rien à faire", async () => {
    h.state.rules.push(makeRule({ openEntryPrice: null, openQuantity: null }));
    await checkProtectiveExits(null);
    expect(h.getQuotes).not.toHaveBeenCalled();
    expect(h.submitOrder).not.toHaveBeenCalled();
  });
});

// ── checkProtectiveExits — déclencheurs ───────────────────────────────────────
describe("checkProtectiveExits — déclencheurs SL / TP / trailing", () => {
  it("prix entre stop et target → aucune sortie", async () => {
    h.state.rules.push(makeRule()); // stop 95, target 110
    setPrice("AAPL", 100);
    await checkProtectiveExits(null);
    expect(h.submitOrder).not.toHaveBeenCalled();
  });

  it("take-profit atteint → triggerType take_profit", async () => {
    h.state.rules.push(makeRule());
    setPrice("AAPL", 111);
    h.submitOrder.mockResolvedValue({ status: "accepted", order: { id: 1, mode: "paper" } });
    await checkProtectiveExits(null);
    expect(exitLogs()[0].values).toMatchObject({ triggerType: "take_profit" });
  });

  it("trailing : le plus-haut est mis à jour quand le prix monte, sans vendre", async () => {
    h.state.rules.push(makeRule({ trailingStopPct: "4", takeProfitPct: null, highWaterMark: "100" }));
    setPrice("AAPL", 108);
    await checkProtectiveExits(null);

    expect(h.submitOrder).not.toHaveBeenCalled();
    expect(hwmUpdates()).toHaveLength(1);
    expect(hwmUpdates()[0].set.highWaterMark).toBe("108");
  });

  it("trailing : retracement sous le seuil → vente + remise à zéro du plus-haut", async () => {
    // hwm 110 > entrée 100, trail 4 % → seuil 105.6 ; prix 105 le franchit
    h.state.rules.push(makeRule({ trailingStopPct: "4", takeProfitPct: null, highWaterMark: "110" }));
    setPrice("AAPL", 105);
    h.submitOrder.mockResolvedValue({ status: "accepted", order: { id: 7, mode: "paper" } });

    await checkProtectiveExits(null);

    expect(exitLogs()[0].values).toMatchObject({ triggerType: "trailing_stop" });
    expect(clearingUpdates()[0].set.highWaterMark).toBeNull();
  });

  it("trailing non armé (hwm = entrée) : c'est le stop-loss fixe qui sort", async () => {
    // hwm jamais monté au-dessus de l'entrée → trailing inactif ; prix 94 < stop 95
    h.state.rules.push(makeRule({ trailingStopPct: "4", highWaterMark: "100" }));
    setPrice("AAPL", 94);
    h.submitOrder.mockResolvedValue({ status: "accepted", order: { id: 8, mode: "paper" } });

    await checkProtectiveExits(null);

    expect(exitLogs()[0].values).toMatchObject({ triggerType: "stop_loss" });
  });

  it("trailing armé prioritaire sur le stop fixe quand les deux sont franchis", async () => {
    // hwm 120, trail 4 % → seuil 115.2 ; prix 94 franchit trailing ET stop → trailing d'abord
    h.state.rules.push(makeRule({ trailingStopPct: "4", highWaterMark: "120" }));
    setPrice("AAPL", 94);
    h.submitOrder.mockResolvedValue({ status: "accepted", order: { id: 9, mode: "paper" } });

    await checkProtectiveExits(null);

    expect(exitLogs()[0].values).toMatchObject({ triggerType: "trailing_stop" });
  });

  it("hwm absent en base → repli sur le prix d'entrée (pas de fausse vente)", async () => {
    h.state.rules.push(makeRule({ trailingStopPct: "4", takeProfitPct: null, stopLossPct: null, highWaterMark: null }));
    setPrice("AAPL", 97); // 97 ≤ 100×0.96 ? non (96) — et hwm=entrée → non armé
    await checkProtectiveExits(null);
    expect(h.submitOrder).not.toHaveBeenCalled();
  });
});

// ── processRule — initialisation du plus-haut à l'entrée ─────────────────────
describe("processRule — trailing stop initialisé à l'entrée", () => {
  function mockChart(bars = 60, close = 100) {
    h.chart.mockResolvedValue({
      quotes: Array.from({ length: bars }, (_, i) => ({
        date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000),
        open: close, high: close, low: close, close, volume: 1000,
      })),
    });
  }

  it("nouvel achat → highWaterMark initialisé au prix d'entrée", async () => {
    const rule = makeRule({ openEntryPrice: null, openQuantity: null, openSince: null, trailingStopPct: "4" });
    mockChart(60, 100);
    h.analyzeTradingSignals.mockReturnValue({ score: 80, overall: "FORT ACHAT", signals: [] });
    h.submitOrder.mockResolvedValue({ status: "accepted", order: { id: 10, mode: "paper" } });

    await processRule(rule as never, null);

    const posUpdate = h.state.updates.find(u => u.table === h.rulesTable && "openEntryPrice" in u.set && u.set.openEntryPrice !== null);
    expect(posUpdate).toBeDefined();
    expect(posUpdate!.set).toMatchObject({
      openEntryPrice: "100",
      openQuantity: "2",
      highWaterMark: "100", // initialisé au prix d'entrée
    });
  });

  it("renfort d'une position existante → highWaterMark conservé, pas réinitialisé", async () => {
    const rule = makeRule({ openEntryPrice: "90", openQuantity: "1", trailingStopPct: "4", highWaterMark: "120" });
    mockChart(60, 100);
    h.analyzeTradingSignals.mockReturnValue({ score: 80, overall: "FORT ACHAT", signals: [] });
    h.submitOrder.mockResolvedValue({ status: "accepted", order: { id: 11, mode: "paper" } });

    await processRule(rule as never, null);

    const posUpdate = h.state.updates.find(u => u.table === h.rulesTable && "openEntryPrice" in u.set && u.set.openEntryPrice !== null);
    expect(posUpdate).toBeDefined();
    expect(posUpdate!.set.highWaterMark).toBe("120"); // inchangé
    expect(posUpdate!.set.openQuantity).toBe("3"); // 1 + 2
  });

  it("vente manuelle totale via signal → position et highWaterMark remis à zéro", async () => {
    const rule = makeRule({ sideMode: "sell", openEntryPrice: "100", openQuantity: "2", highWaterMark: "115" });
    mockChart(60, 100);
    h.analyzeTradingSignals.mockReturnValue({ score: -80, overall: "FORTE VENTE", signals: [] });
    h.submitOrder.mockResolvedValue({ status: "accepted", order: { id: 12, mode: "paper" } });

    await processRule(rule as never, null);

    const posUpdate = h.state.updates.find(u => u.table === h.rulesTable && "openQuantity" in u.set && !("lastSignalScore" in u.set));
    expect(posUpdate).toBeDefined();
    expect(posUpdate!.set).toMatchObject({
      openQuantity: null, openEntryPrice: null, openSince: null, highWaterMark: null,
    });
  });
});

// ── checkDailyLossCircuitBreaker — coupe-circuit de perte journalière ────────
describe("checkDailyLossCircuitBreaker — coupe-circuit de perte journalière", () => {
  const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const TODAY = new Date();

  function makeConn(overrides: Record<string, unknown> = {}) {
    return { id: 7, tradingHalted: false, haltedAt: null, ...overrides } as never;
  }

  /** Achat hier @buyPrice, vente aujourd'hui @sellPrice (qty 10) → P&L = (sell-buy)*10. */
  function seedTrade(buyPrice: number, sellPrice: number) {
    h.state.orders.push(
      {
        symbol: "AAPL", side: "BUY", status: "filled", mode: "paper",
        quantity: "10", filledQuantity: "10", fillPrice: String(buyPrice),
        expectedPrice: null, createdAt: YESTERDAY,
      },
      {
        symbol: "AAPL", side: "SELL", status: "filled", mode: "paper",
        quantity: "10", filledQuantity: "10", fillPrice: String(sellPrice),
        expectedPrice: null, createdAt: TODAY,
      },
    );
  }

  const haltUpdates = () =>
    h.state.updates.filter(u => u.table === h.connectionsTable && u.set.tradingHalted === true);

  it("perte sous le seuil → aucun kill-switch, aucune notification", async () => {
    h.state.settings.push({ maxDailyLossAmount: "100" });
    seedTrade(100, 95); // perte 50 $ (50 % de la limite, sous le seuil d'avertissement)

    await checkDailyLossCircuitBreaker(makeConn());

    expect(haltUpdates()).toHaveLength(0);
    expect(h.notifyKillSwitchActivated).not.toHaveBeenCalled();
    expect(h.notifyDailyLossWarning).not.toHaveBeenCalled();
  });

  it("perte exactement égale au seuil → pas de kill-switch (strictement au-dessus seulement)", async () => {
    h.state.settings.push({ maxDailyLossAmount: "100" });
    seedTrade(100, 90); // perte 100 $ = limite exacte

    await checkDailyLossCircuitBreaker(makeConn());

    expect(haltUpdates()).toHaveLength(0);
    expect(h.notifyKillSwitchActivated).not.toHaveBeenCalled();
  });

  it("perte au-dessus du seuil → tradingHalted=true + notification kill-switch", async () => {
    h.state.settings.push({ maxDailyLossAmount: "100" });
    seedTrade(100, 89); // perte 110 $ > 100 $

    await checkDailyLossCircuitBreaker(makeConn());

    const halts = haltUpdates();
    expect(halts).toHaveLength(1);
    expect(halts[0].set.haltedAt).toBeInstanceOf(Date);
    expect(h.notifyKillSwitchActivated).toHaveBeenCalledTimes(1);
    expect(String(h.notifyKillSwitchActivated.mock.calls[0][0])).toContain("110.00");
  });

  it("gain aujourd'hui → jamais de kill-switch", async () => {
    h.state.settings.push({ maxDailyLossAmount: "100" });
    seedTrade(100, 150); // gain 500 $

    await checkDailyLossCircuitBreaker(makeConn());

    expect(haltUpdates()).toHaveLength(0);
    expect(h.notifyKillSwitchActivated).not.toHaveBeenCalled();
  });

  it("seuil absent (pas de réglage) → coupe-circuit désactivé même en grosse perte", async () => {
    // Aucune ligne app_settings
    seedTrade(100, 10); // perte 900 $

    await checkDailyLossCircuitBreaker(makeConn());

    expect(haltUpdates()).toHaveLength(0);
    expect(h.notifyKillSwitchActivated).not.toHaveBeenCalled();
  });

  it("seuil null → désactivé", async () => {
    h.state.settings.push({ maxDailyLossAmount: null });
    seedTrade(100, 10);

    await checkDailyLossCircuitBreaker(makeConn());

    expect(haltUpdates()).toHaveLength(0);
  });

  it.each(["0", "-50", "abc"])("seuil invalide (%s) → désactivé", async (raw) => {
    h.state.settings.push({ maxDailyLossAmount: raw });
    seedTrade(100, 10);

    await checkDailyLossCircuitBreaker(makeConn());

    expect(haltUpdates()).toHaveLength(0);
    expect(h.notifyKillSwitchActivated).not.toHaveBeenCalled();
  });

  it("connexion déjà arrêtée (tradingHalted) → aucune action, aucune lecture de P&L", async () => {
    h.state.settings.push({ maxDailyLossAmount: "100" });
    seedTrade(100, 10);

    await checkDailyLossCircuitBreaker(makeConn({ tradingHalted: true }));

    expect(h.state.updates).toHaveLength(0);
    expect(h.notifyKillSwitchActivated).not.toHaveBeenCalled();
  });

  it("connexion absente (null) → aucune action", async () => {
    h.state.settings.push({ maxDailyLossAmount: "100" });
    seedTrade(100, 10);

    await checkDailyLossCircuitBreaker(null);

    expect(h.state.updates).toHaveLength(0);
    expect(h.notifyKillSwitchActivated).not.toHaveBeenCalled();
  });
});

// ── maybeNotifyDailyLossWarning — anti-doublon quotidien ─────────────────────
describe("maybeNotifyDailyLossWarning — une seule notification par jour", () => {
  const auditInserts = () => h.state.inserts.filter(i => i.table === h.auditLogTable);

  it("premier appel du jour → notification envoyée + ligne audit_log (sous verrou)", async () => {
    const notifyFn = vi.fn().mockResolvedValue(true);

    await maybeNotifyDailyLossWarning(80, 100, notifyFn);

    expect(notifyFn).toHaveBeenCalledTimes(1);
    expect(notifyFn).toHaveBeenCalledWith({ loss: 80, maxLoss: 100, pct: 80 });
    expect(auditInserts()).toHaveLength(1);
    expect(h.state.txExecutes).toHaveLength(1); // pg_advisory_xact_lock pris
    expect(h.state.deletes).toHaveLength(0); // réclamation conservée
  });

  it("second appel le même jour → aucun envoi, aucune nouvelle ligne", async () => {
    const notifyFn = vi.fn().mockResolvedValue(true);
    await maybeNotifyDailyLossWarning(80, 100, notifyFn);
    expect(notifyFn).toHaveBeenCalledTimes(1);

    await maybeNotifyDailyLossWarning(85, 100, notifyFn);

    expect(notifyFn).toHaveBeenCalledTimes(1); // pas de second envoi
    expect(auditInserts()).toHaveLength(1); // pas de seconde ligne
    expect(h.state.deletes).toHaveLength(0);
  });

  it("ligne audit_log déjà présente AUJOURD'HUI (autre process / redémarrage) → aucun envoi", async () => {
    h.state.auditRows.push({ id: 99, action: "daily_loss.warning", createdAt: new Date() });
    const notifyFn = vi.fn().mockResolvedValue(true);

    await maybeNotifyDailyLossWarning(80, 100, notifyFn);

    expect(notifyFn).not.toHaveBeenCalled();
    expect(auditInserts()).toHaveLength(0);
  });

  it("ligne d'HIER → n'empêche pas l'envoi du jour (portée quotidienne)", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    h.state.auditRows.push({ id: 98, action: "daily_loss.warning", createdAt: yesterday });
    const notifyFn = vi.fn().mockResolvedValue(true);

    await maybeNotifyDailyLossWarning(80, 100, notifyFn);

    expect(notifyFn).toHaveBeenCalledTimes(1);
    expect(auditInserts()).toHaveLength(1);
  });

  it("envoyé un jour → de nouveau envoyé le lendemain (horloge contrôlée)", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-30T15:00:00Z"));
      const notifyFn = vi.fn().mockResolvedValue(true);

      await maybeNotifyDailyLossWarning(80, 100, notifyFn);
      await maybeNotifyDailyLossWarning(85, 100, notifyFn);
      expect(notifyFn).toHaveBeenCalledTimes(1); // supprimé le même jour

      vi.setSystemTime(new Date("2026-07-31T15:00:00Z"));
      await maybeNotifyDailyLossWarning(82, 100, notifyFn);

      expect(notifyFn).toHaveBeenCalledTimes(2); // ré-envoyé le lendemain
      expect(auditInserts()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ligne d'une AUTRE action aujourd'hui → n'empêche pas l'envoi", async () => {
    h.state.auditRows.push({ id: 97, action: "kill_switch.activated", createdAt: new Date() });
    const notifyFn = vi.fn().mockResolvedValue(true);

    await maybeNotifyDailyLossWarning(80, 100, notifyFn);

    expect(notifyFn).toHaveBeenCalledTimes(1);
    expect(auditInserts()).toHaveLength(1);
  });

  it("envoi échoué (notifyFn retourne false) → réclamation supprimée pour re-tentative", async () => {
    const notifyFn = vi.fn().mockResolvedValue(false);

    await maybeNotifyDailyLossWarning(80, 100, notifyFn);

    expect(notifyFn).toHaveBeenCalledTimes(1);
    expect(auditInserts()).toHaveLength(1); // réclamée puis…
    expect(h.state.deletes).toHaveLength(1); // …libérée
    expect(h.state.deletes[0].table).toBe(h.auditLogTable);
  });

  it("exception de notifyFn → loggée sans propagation ET réclamation libérée pour re-tentative", async () => {
    const notifyFn = vi.fn().mockRejectedValue(new Error("twilio down"));

    await expect(maybeNotifyDailyLossWarning(80, 100, notifyFn)).resolves.toBeUndefined();

    expect(h.state.deletes).toHaveLength(1); // un envoi qui lève = échec d'envoi → re-tentative possible
    expect(h.state.deletes[0].table).toBe(h.auditLogTable);
  });

  it("exception de la transaction (DB down) → loggée sans propagation, aucun envoi", async () => {
    const notifyFn = vi.fn().mockResolvedValue(true);
    const origTx = h.db.transaction;
    (h.db as { transaction: unknown }).transaction = vi.fn().mockRejectedValue(new Error("db down"));

    await expect(maybeNotifyDailyLossWarning(80, 100, notifyFn)).resolves.toBeUndefined();

    expect(notifyFn).not.toHaveBeenCalled();
    (h.db as { transaction: unknown }).transaction = origTx;
  });
});

// ── getDailyRealizedPnLStatus — synchronisation des fills live ────────────────
describe("getDailyRealizedPnLStatus — le coupe-circuit compte les vraies exécutions du courtier", () => {
  const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const TODAY = new Date();

  const liveConn = () => ({
    id: 7,
    snaptradeUserId: "u-1",
    snaptradeUserSecret: "s-1",
    tradingHalted: false,
  }) as never;

  /** Achat live confirmé hier @100 (qty 10). */
  function seedLiveBuy() {
    h.state.orders.push({
      id: 1, symbol: "AAPL", side: "BUY", status: "filled", mode: "live",
      quantity: "10", filledQuantity: "10", fillPrice: "100",
      expectedPrice: null, createdAt: YESTERDAY,
      brokerAccountId: "acc-1", snaptradeOrderId: "B-BUY",
    });
  }

  it("mode live → sync appelée, le fill fraîchement rapproché compte dans le P&L", async () => {
    h.getTradingMode.mockReturnValue("live");
    seedLiveBuy();
    // Vente d'aujourd'hui encore "submitted" : fill inconnu localement.
    h.state.orders.push({
      id: 2, symbol: "AAPL", side: "SELL", status: "submitted", mode: "live",
      quantity: "10", filledQuantity: null, fillPrice: null,
      expectedPrice: null, createdAt: TODAY,
      brokerAccountId: "acc-1", snaptradeOrderId: "B-SELL",
    });
    // SnapTrade rapporte l'exécution réelle : vendu @90.
    h.getUserAccountOrders.mockResolvedValue({
      data: [{ brokerage_order_id: "B-SELL", status: "EXECUTED", execution_price: 90, filled_quantity: 10 }],
    });
    h.state.settings.push({ maxDailyLossAmount: "100" });

    const res = await getDailyRealizedPnLStatus({ conn: liveConn() });

    expect(h.getUserAccountOrders).toHaveBeenCalledTimes(1);
    expect(h.getUserAccountOrders.mock.calls[0][0]).toMatchObject({
      userId: "u-1", userSecret: "s-1", accountId: "acc-1", state: "all",
    });
    // L'ordre a bien été persisté comme exécuté...
    expect(h.state.orders[1]).toMatchObject({ status: "filled", fillPrice: "90", filledQuantity: "10" });
    // ...et son fill compte dans le P&L : (90 − 100) × 10 = −100.
    expect(res.realizedPnL).toBeCloseTo(-100, 6);
    expect(res.mode).toBe("live");
    expect(res.maxDailyLossAmount).toBe(100);
  });

  it("échec de la sync SnapTrade → pas d'exception, P&L calculé sur les fills déjà confirmés", async () => {
    h.getTradingMode.mockReturnValue("live");
    seedLiveBuy();
    // Vente confirmée @95 aujourd'hui (déjà rapprochée lors d'un cycle précédent).
    h.state.orders.push({
      id: 2, symbol: "AAPL", side: "SELL", status: "filled", mode: "live",
      quantity: "5", filledQuantity: "5", fillPrice: "95",
      expectedPrice: null, createdAt: TODAY,
      brokerAccountId: "acc-1", snaptradeOrderId: "B-SELL-OK",
    });
    // Vente "submitted" dont le fill reste inconnu — la sync échoue.
    h.state.orders.push({
      id: 3, symbol: "AAPL", side: "SELL", status: "submitted", mode: "live",
      quantity: "5", filledQuantity: null, fillPrice: null,
      expectedPrice: null, createdAt: TODAY,
      brokerAccountId: "acc-1", snaptradeOrderId: "B-SELL-KO",
    });
    h.getUserAccountOrders.mockRejectedValue(new Error("SnapTrade indisponible"));

    const res = await getDailyRealizedPnLStatus({ conn: liveConn() });

    expect(h.getUserAccountOrders).toHaveBeenCalledTimes(1);
    // Seule la vente confirmée compte : (95 − 100) × 5 = −25 ; la submitted est exclue.
    expect(res.realizedPnL).toBeCloseTo(-25, 6);
    expect(h.state.orders[2].status).toBe("submitted"); // pas touché
  });

  it("mode paper → aucune sync SnapTrade, même avec une connexion fournie", async () => {
    h.getTradingMode.mockReturnValue("paper");
    // Ordres paper : achat hier @100, vente aujourd'hui @95 (qty 10).
    h.state.orders.push(
      {
        id: 1, symbol: "AAPL", side: "BUY", status: "filled", mode: "paper",
        quantity: "10", filledQuantity: "10", fillPrice: "100",
        expectedPrice: null, createdAt: YESTERDAY,
      },
      {
        id: 2, symbol: "AAPL", side: "SELL", status: "simulated", mode: "paper",
        quantity: "10", filledQuantity: null, fillPrice: null,
        expectedPrice: "95", createdAt: TODAY,
      },
    );

    const res = await getDailyRealizedPnLStatus({ conn: liveConn() });

    expect(h.getUserAccountOrders).not.toHaveBeenCalled();
    expect(res.mode).toBe("paper");
    expect(res.realizedPnL).toBeCloseTo(-50, 6);
  });

  it("mode live sans connexion → aucune sync, pas d'exception", async () => {
    h.getTradingMode.mockReturnValue("live");
    seedLiveBuy();

    const res = await getDailyRealizedPnLStatus({});

    expect(h.getUserAccountOrders).not.toHaveBeenCalled();
    expect(res.mode).toBe("live");
    expect(res.realizedPnL).toBe(0);
  });

  it("mode live → les ordres du mode paper sont exclus du P&L", async () => {
    h.getTradingMode.mockReturnValue("live");
    // Grosse perte paper aujourd'hui : ne doit PAS compter en live.
    h.state.orders.push(
      {
        id: 1, symbol: "TSLA", side: "BUY", status: "filled", mode: "paper",
        quantity: "10", filledQuantity: "10", fillPrice: "100",
        expectedPrice: null, createdAt: YESTERDAY,
      },
      {
        id: 2, symbol: "TSLA", side: "SELL", status: "filled", mode: "paper",
        quantity: "10", filledQuantity: "10", fillPrice: "10",
        expectedPrice: null, createdAt: TODAY,
      },
    );
    h.getUserAccountOrders.mockResolvedValue({ data: [] });

    const res = await getDailyRealizedPnLStatus({ conn: liveConn() });

    expect(res.realizedPnL).toBe(0);
    // Aucun ordre live non terminal → pas même besoin d'interroger SnapTrade.
    expect(h.getUserAccountOrders).not.toHaveBeenCalled();
  });
});
