/**
 * Tests du worker auto-trade.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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
vi.mock("@workspace/indicators", () => ({
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
vi.mock("../../lib/brokerAdapter", () => ({
  resolveBrokerAdapter: () => ({
    listOrders: async (accountId: string, options?: { days?: number }) => {
      const response = await h.getUserAccountOrders({
        userId: "u-1", userSecret: "s-1", accountId, state: "all", ...options,
      });
      return (response.data ?? []).map((raw: Record<string, unknown>) => ({
        brokerOrderId: String(raw.brokerage_order_id ?? raw.id ?? ""),
        clientOrderId: String(raw.client_order_id ?? ""),
        status: raw.status === "EXECUTED" ? "filled" : raw.status === "PARTIAL" ? "partially_filled" :
          raw.status === "REJECTED" ? "rejected" : raw.status === "CANCELED" ? "cancelled" : "open",
        filledQuantity: Number(raw.filled_quantity ?? 0),
        averagePrice: raw.execution_price as number | undefined,
        raw,
      }));
    },
  }),
}));

import { processRule, checkDailyLossCircuitBreaker, maybeNotifyDailyLossWarning, getDailyRealizedPnLStatus } from "../autoTradeWorker";

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

// Instant "bourse ouverte" : mercredi 12 août 2026, 11h00 ET (15h00 UTC).
// processRule vérifie désormais le calendrier boursier (getClosureContext) :
// les tests qui attendent un ordre doivent s'exécuter à un instant d'ouverture.
const MARKET_OPEN_INSTANT = new Date("2026-08-12T15:00:00Z");

function mockChart(bars = 60, close = 100) {
  h.chart.mockResolvedValue({
    quotes: Array.from({ length: bars }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000),
      open: close, high: close, low: close, close, volume: 1000,
    })),
  });
}

// ── processRule — initialisation du plus-haut à l'entrée ─────────────────────
describe("processRule — trailing stop initialisé à l'entrée", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MARKET_OPEN_INSTANT);
  });
  afterEach(() => vi.useRealTimers());

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

// ── processRule — calendrier boursier (fermeture / fermeture imminente) ──────
describe("processRule — calendrier boursier", () => {
  afterEach(() => vi.useRealTimers());

  function armStrongBuy() {
    h.state.rules.push(makeRule({ openEntryPrice: null, openQuantity: null, openSince: null }));
    mockChart(60, 100);
    h.analyzeTradingSignals.mockReturnValue({ score: 80, overall: "FORT ACHAT", signals: [] });
    h.submitOrder.mockResolvedValue({ status: "accepted", order: { id: 20, mode: "paper" } });
    return h.state.rules[0];
  }

  it("bourse fermée (soirée) → signal différé : aucun ordre, aucun SMS, log explicite", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T23:30:00Z")); // 19h30 ET — fermé
    const rule = armStrongBuy();

    await processRule(rule as never, null);

    expect(h.submitOrder).not.toHaveBeenCalled();
    const log = h.state.inserts.find(i => i.table === h.logsTable);
    expect(log).toBeDefined();
    expect(log!.values).toMatchObject({ triggerType: "notification_only", notificationSent: false });
    expect(String(log!.values.notes)).toContain("Signal différé : bourse fermée");
    // Cooldown/quota non consommés : pas de mise à jour lastTriggeredAt
    expect(h.state.updates.some(u => u.table === h.rulesTable && "lastTriggeredAt" in u.set)).toBe(false);
  });

  it("demi-journée après 13h00 ET (24 déc) → bourse fermée, signal différé", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-24T19:00:00Z")); // 14h00 ET un jour de demi-séance
    const rule = armStrongBuy();

    await processRule(rule as never, null);

    expect(h.submitOrder).not.toHaveBeenCalled();
    const log = h.state.inserts.find(i => i.table === h.logsTable);
    expect(String(log!.values.notes)).toContain("Signal différé : bourse fermée");
  });

  it("demi-journée avant 13h00 ET → ordre passé, log annoté de la fermeture imminente", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-24T15:00:00Z")); // 10h00 ET, veille de Noël
    const rule = armStrongBuy();

    await processRule(rule as never, null);

    expect(h.submitOrder).toHaveBeenCalledTimes(1);
    const log = h.state.inserts.find(i => i.table === h.logsTable);
    expect(String(log!.values.notes)).toContain("Demi-journée aujourd'hui");
  });

  it("veille de Thanksgiving US (25 nov 2026) → note férié le prochain jour ouvrable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T15:00:00Z")); // mercredi 10h00 ET, Thanksgiving US le 26
    const rule = armStrongBuy();

    await processRule(rule as never, null);

    expect(h.submitOrder).toHaveBeenCalledTimes(1);
    const log = h.state.inserts.find(i => i.table === h.logsTable);
    expect(String(log!.values.notes)).toContain("Férié le 2026-11-26");
  });

  it("jour normal en pleine séance → aucune note de fermeture dans le log", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(MARKET_OPEN_INSTANT);
    const rule = armStrongBuy();

    await processRule(rule as never, null);

    expect(h.submitOrder).toHaveBeenCalledTimes(1);
    const log = h.state.inserts.find(i => i.table === h.logsTable);
    expect(String(log!.values.notes)).not.toContain("⏰");
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
