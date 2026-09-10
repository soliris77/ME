/**
 * Tests du pont copy-trading → auto-trader (processCopySignal).
 * ─────────────────────────────────────────────────────────────────────────────
 * Invariants vérifiés :
 *   - Idempotence : signalId = copy-${trader}-${trade}-${rule} ; un "duplicate"
 *     renvoyé par submitOrder ne re-journalise pas et ne re-compte pas.
 *   - Fail closed : si submitOrder rejette (ex. pas de connexion / cotation
 *     manquante), aucun ordre confirmé — le log porte le motif de rejet, et le
 *     compteur de la règle N'EST PAS incrémenté.
 *   - Le pipeline de risque N'EST PAS dupliqué : processCopySignal délègue
 *     entièrement à submitOrder (mocké) et ne fait AUCUNE évaluation de score.
 * Approche de mocks db/drizzle reprise de workers/__tests__/autoTradeWorker.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const bindingsTable = {
    id: Symbol("bindings.id"),
    ruleId: Symbol("bindings.ruleId"),
    followedTraderId: Symbol("bindings.followedTraderId"),
    enabled: Symbol("bindings.enabled"),
    $inferSelect: undefined,
  };
  const rulesTable = {
    id: Symbol("rules.id"),
    enabled: Symbol("rules.enabled"),
    symbol: Symbol("rules.symbol"),
    $inferSelect: undefined,
  };
  const logsTable = { $inferSelect: undefined };
  const connectionsTable = { $inferSelect: undefined };
  const ordersTable = { $inferSelect: undefined };
  const settingsTable = { $inferSelect: undefined };
  const auditLogTable = { $inferSelect: undefined };

  const state = {
    /** Lignes renvoyées par le SELECT joint bindings ⨝ rules. */
    joinRows: [] as Record<string, unknown>[],
    connections: [] as Record<string, unknown>[],
    inserts: [] as { table: unknown; values: Record<string, unknown> }[],
    updates: [] as { table: unknown; set: Record<string, unknown> }[],
  };

  // Chaîne de requête minimale : select→from→innerJoin→where (thenable),
  // select→from→limit (resolveConnection), insert→values(.catch), update→set→where(.catch).
  const makeSelect = () => {
    let rows: Record<string, unknown>[] = [];
    const chain: Record<string, unknown> = {
      from(table: unknown) {
        rows = table === connectionsTable ? state.connections : state.joinRows;
        return chain;
      },
      innerJoin() { return chain; },
      leftJoin() { return chain; },
      where() { return chain; },
      orderBy() { return chain; },
      limit(n: number) { return Promise.resolve(rows.slice(0, n)); },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        return Promise.resolve(rows).then(res, rej);
      },
    };
    return chain;
  };

  const db = {
    select: () => makeSelect(),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        state.inserts.push({ table, values });
        return Promise.resolve([{ id: 1, ...values }]);
      },
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: () => {
          state.updates.push({ table, set });
          return Promise.resolve(undefined);
        },
      }),
    }),
  };

  return {
    state, db, bindingsTable, rulesTable, logsTable, connectionsTable, ordersTable, settingsTable, auditLogTable,
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
  autoTradeCopyBindingsTable: h.bindingsTable,
}));
vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  and: (...args: unknown[]) => ({ and: args }),
  gte: (col: unknown, val: unknown) => ({ op: "gte", col, val }),
  inArray: (col: unknown, vals: unknown) => ({ op: "inArray", col, vals }),
  sql: () => ({}),
}));
vi.mock("../../lib/yahoo", () => ({ yahooFinance: { chart: h.chart }, getQuotes: h.getQuotes }));
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
  notifyKillSwitchActivated: vi.fn(),
  notifyDailyLossWarning: vi.fn(),
}));
vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../lib/tradingMode", () => ({ getTradingMode: h.getTradingMode }));
vi.mock("../../lib/snaptrade", () => ({
  getSnaptradeClientAsync: async () => ({
    accountInformation: { getUserAccountOrders: h.getUserAccountOrders },
  }),
}));

import { processCopySignal, type CopySignalEvent } from "../autoTradeWorker";

function makeRule(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 10, symbol: "AAPL", name: "Apple", enabled: true, sideMode: "both",
    quantity: "2", accountId: null, tradesToday: 0, tradesTodayResetAt: null,
    lastTriggeredAt: null,
    // Garde-fous d'entrée au niveau de la règle (partagés avec processRule).
    cooldownMinutes: 240, maxTradesPerDay: 3,
    // Dimensionnement.
    sizingMode: "fixed", riskAmount: null, stopLossPct: null,
    ...over,
  };
}

const baseEvent: CopySignalEvent = {
  followedTraderId: 5,
  externalTradeId: "T-999",
  symbol: "AAPL",
  side: "buy",
  openedAt: null,
  source: "copy-trading",
};

beforeEach(() => {
  h.state.joinRows = [];
  h.state.connections = [];
  h.state.inserts = [];
  h.state.updates = [];
  h.submitOrder.mockReset();
  // Cotation par défaut disponible (200 $) — les tests de fail-closed la retirent.
  h.getQuotes.mockReset();
  h.getQuotes.mockResolvedValue([{ symbol: "AAPL", price: 200 }]);
});

describe("processCopySignal — pont copy-trading → auto-trader", () => {
  it("ne fait rien s'il n'existe aucune liaison active correspondante", async () => {
    h.state.joinRows = []; // aucune liaison
    await processCopySignal(baseEvent);
    expect(h.submitOrder).not.toHaveBeenCalled();
    expect(h.state.inserts).toHaveLength(0);
  });

  it("soumet un ordre via submitOrder avec le signalId idempotent attendu", async () => {
    h.state.joinRows = [{ rule: makeRule(), bindingId: 1 }];
    h.state.connections = [{ status: "connected", snaptradeUserId: "u", snaptradeUserSecret: "s" }];
    h.submitOrder.mockResolvedValue({ status: "accepted", order: { id: 42, status: "submitted" } });

    await processCopySignal(baseEvent);

    expect(h.submitOrder).toHaveBeenCalledTimes(1);
    const arg = h.submitOrder.mock.calls[0][0];
    expect(arg.signalId).toBe("copy-5-T-999-10");
    expect(arg.side).toBe("BUY");
    expect(arg.source).toBe("copy-trading");
    // Aucune évaluation de score technique.
    expect(h.analyzeTradingSignals).not.toHaveBeenCalled();
    // Log copy-trading + incrément du compteur de la règle.
    const log = h.state.inserts.find((i) => i.table === h.logsTable);
    expect(log?.values.source).toBe("copy-trading");
    expect(log?.values.followedTraderId).toBe(5);
    expect(log?.values.externalTradeId).toBe("T-999");
    expect(h.state.updates.some((u) => u.table === h.rulesTable && u.set.tradesToday === 1)).toBe(true);
  });

  it("IDEMPOTENCE : un ordre 'duplicate' n'est ni re-journalisé ni re-compté", async () => {
    h.state.joinRows = [{ rule: makeRule(), bindingId: 1 }];
    h.state.connections = [{ status: "connected", snaptradeUserId: "u", snaptradeUserSecret: "s" }];
    h.submitOrder.mockResolvedValue({ status: "duplicate", order: { id: 42, status: "submitted" } });

    await processCopySignal(baseEvent);

    expect(h.submitOrder).toHaveBeenCalledTimes(1);
    // Doublon : pas de log, pas d'incrément.
    expect(h.state.inserts.filter((i) => i.table === h.logsTable)).toHaveLength(0);
    expect(h.state.updates.filter((u) => u.table === h.rulesTable)).toHaveLength(0);
  });

  it("FAIL CLOSED : rejet de submitOrder → aucun ordre confirmé, log de rejet, pas d'incrément", async () => {
    h.state.joinRows = [{ rule: makeRule(), bindingId: 1 }];
    h.state.connections = []; // aucune connexion courtier
    h.submitOrder.mockResolvedValue({
      status: "rejected",
      reason: "broker_not_connected",
      message: "Aucune connexion courtier",
      details: {},
    });

    await processCopySignal(baseEvent);

    const log = h.state.inserts.find((i) => i.table === h.logsTable);
    expect(log).toBeDefined();
    expect(log?.values.triggerType).toBe("notification_only");
    expect(log?.values.orderId).toBeNull();
    expect(String(log?.values.notes)).toContain("broker_not_connected");
    // Compteur de la règle NON incrémenté (aucun ordre passé).
    expect(h.state.updates.some((u) => u.table === h.rulesTable)).toBe(false);
  });

  it("FAIL CLOSED : 'accepted' avec order.status === 'error' n'est PAS considéré comme confirmé", async () => {
    h.state.joinRows = [{ rule: makeRule(), bindingId: 1 }];
    h.state.connections = [{ status: "connected", snaptradeUserId: "u", snaptradeUserSecret: "s" }];
    h.submitOrder.mockResolvedValue({ status: "accepted", order: { id: 42, status: "error" } });

    await processCopySignal(baseEvent);

    const log = h.state.inserts.find((i) => i.table === h.logsTable);
    expect(log?.values.triggerType).toBe("notification_only");
    expect(log?.values.orderId).toBeNull();
    expect(String(log?.values.notes)).toContain("broker_error");
    expect(h.state.updates.some((u) => u.table === h.rulesTable)).toBe(false);
  });

  it("respecte la direction configurée sur la règle (sell interdit → pas de soumission)", async () => {
    h.state.joinRows = [{ rule: makeRule({ sideMode: "buy" }), bindingId: 1 }];
    h.state.connections = [{ status: "connected", snaptradeUserId: "u", snaptradeUserSecret: "s" }];

    await processCopySignal({ ...baseEvent, side: "sell" });

    expect(h.submitOrder).not.toHaveBeenCalled();
    expect(h.state.inserts).toHaveLength(0);
  });

  it("GARDE-FOU : quota journalier atteint → aucun ordre, log 'quota', pas d'incrément", async () => {
    // tradesToday = maxTradesPerDay, réinitialisé aujourd'hui (todayReset).
    const rule = makeRule({ tradesToday: 3, maxTradesPerDay: 3, tradesTodayResetAt: new Date() });
    h.state.joinRows = [{ rule, bindingId: 1 }];
    h.state.connections = [{ status: "connected", snaptradeUserId: "u", snaptradeUserSecret: "s" }];

    await processCopySignal(baseEvent);

    expect(h.submitOrder).not.toHaveBeenCalled();
    const log = h.state.inserts.find((i) => i.table === h.logsTable);
    expect(String(log?.values.notes)).toContain("quota");
    expect(h.state.updates.some((u) => u.table === h.rulesTable)).toBe(false);
  });

  it("GARDE-FOU : cooldown actif → aucun ordre, log 'cooldown', pas d'incrément", async () => {
    // Dernier déclenchement il y a 10 min, cooldown de 240 min → bloqué.
    const rule = makeRule({ lastTriggeredAt: new Date(Date.now() - 10 * 60 * 1000), cooldownMinutes: 240 });
    h.state.joinRows = [{ rule, bindingId: 1 }];
    h.state.connections = [{ status: "connected", snaptradeUserId: "u", snaptradeUserSecret: "s" }];

    await processCopySignal(baseEvent);

    expect(h.submitOrder).not.toHaveBeenCalled();
    const log = h.state.inserts.find((i) => i.table === h.logsTable);
    expect(String(log?.values.notes)).toContain("cooldown");
    expect(h.state.updates.some((u) => u.table === h.rulesTable)).toBe(false);
  });

  it("SIZING RISK : la quantité est calculée depuis riskAmount / (prix × SL%), pas rule.quantity", async () => {
    // riskAmount 100 $, SL 5 %, prix 200 $ → riskPerShare = 10 → qty = 10 (≠ rule.quantity=2).
    const rule = makeRule({ sizingMode: "risk", riskAmount: "100", stopLossPct: "5", quantity: "2" });
    h.state.joinRows = [{ rule, bindingId: 1 }];
    h.state.connections = [{ status: "connected", snaptradeUserId: "u", snaptradeUserSecret: "s" }];
    h.getQuotes.mockResolvedValue([{ symbol: "AAPL", price: 200 }]);
    h.submitOrder.mockResolvedValue({ status: "accepted", order: { id: 7, status: "submitted" } });

    await processCopySignal(baseEvent);

    expect(h.submitOrder).toHaveBeenCalledTimes(1);
    expect(h.submitOrder.mock.calls[0][0].quantity).toBe(10);
  });

  it("SIZING RISK + FAIL CLOSED : cotation absente → rejet, aucune soumission, log fail-closed", async () => {
    const rule = makeRule({ sizingMode: "risk", riskAmount: "100", stopLossPct: "5", quantity: "2" });
    h.state.joinRows = [{ rule, bindingId: 1 }];
    h.state.connections = [{ status: "connected", snaptradeUserId: "u", snaptradeUserSecret: "s" }];
    h.getQuotes.mockResolvedValue([]); // aucune cotation

    await processCopySignal(baseEvent);

    expect(h.submitOrder).not.toHaveBeenCalled();
    const log = h.state.inserts.find((i) => i.table === h.logsTable);
    expect(String(log?.values.notes)).toContain("cotation absente");
    expect(h.state.updates.some((u) => u.table === h.rulesTable)).toBe(false);
  });
});
