/**
 * Tests du second avis IA (hook runAiSecondOpinion + intégration processRule).
 * ─────────────────────────────────────────────────────────────────────────────
 * Invariants vérifiés :
 *   - verdict "block" → aucun ordre soumis + log tracé (ai_verdict = "block").
 *   - verdict "approve" → ordre soumis + ai_verdict/ai_reason sur le log.
 *   - null (IA indisponible) → ordre soumis (FAIL-OPEN), ai_verdict null.
 *   - rule.aiReview = false → getAiSecondOpinion JAMAIS appelé.
 * Mocks db/drizzle repris de workers/__tests__/autoTradeWorker.test.ts, plus un
 * mock de ../../lib/aiReview pour piloter le verdict sans réseau.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const rulesTable = { id: Symbol("rules.id"), enabled: Symbol("rules.enabled"), ruleId: Symbol("logs.ruleId"), $inferSelect: undefined };
  const logsTable = { ruleId: Symbol("logs.ruleId"), $inferSelect: undefined };
  const connectionsTable = { id: Symbol("conns.id"), $inferSelect: undefined };
  const ordersTable = { id: Symbol("orders.id"), $inferSelect: undefined };
  const settingsTable = { $inferSelect: undefined };
  const auditLogTable = { $inferSelect: undefined };

  const state = {
    logs: [] as Record<string, unknown>[],
    rules: [] as Record<string, unknown>[],
    updates: [] as { table: unknown; set: Record<string, unknown> }[],
    inserts: [] as { table: unknown; values: Record<string, unknown> }[],
    // Quand true, tout db.insert(...).values(...) rejette (simule une panne DB).
    failInserts: false,
  };

  const thenable = (rows: unknown[]) => ({
    where: () => thenable(rows),
    orderBy: () => thenable(rows),
    limit: (n: number) => thenable(rows.slice(0, n)),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(res, rej),
  });

  const rowsFor = (table: unknown) =>
    table === logsTable ? state.logs :
    table === rulesTable ? state.rules : [];

  const db = {
    select: () => ({ from: (table: unknown) => thenable(rowsFor(table)) }),
    update: () => ({ set: (set: Record<string, unknown>) => ({ where: () => { state.updates.push({ table: rulesTable, set }); return Promise.resolve(); } }) }),
    insert: (table: unknown) => ({ values: (values: Record<string, unknown>) => { state.inserts.push({ table, values }); return state.failInserts ? Promise.reject(new Error("DB indisponible")) : Promise.resolve(); } }),
  };

  return {
    state, db, rulesTable, logsTable, connectionsTable, ordersTable, settingsTable, auditLogTable,
    submitOrder: vi.fn(),
    getQuotes: vi.fn(),
    chart: vi.fn(),
    analyzeTradingSignals: vi.fn(),
    getTradingMode: vi.fn(),
    getUserAccountOrders: vi.fn(),
    getAiSecondOpinion: vi.fn(),
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
  autoTradeCopyBindingsTable: { $inferSelect: undefined },
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
vi.mock("../../lib/aiReview", () => ({ getAiSecondOpinion: h.getAiSecondOpinion }));
// Calendrier boursier (fonctionnalité fusionnée) : forcer « bourse ouverte » pour
// que processRule atteigne le hook du second avis dans ces tests.
vi.mock("../../lib/risk", () => ({ isMarketOpen: () => ({ open: true, message: null }) }));
vi.mock("../../routes/market", () => ({ computeClosureWarnings: () => [] }));

import { processRule, runAutoTradeCheck } from "../autoTradeWorker";

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, symbol: "AAPL", name: "Apple", enabled: true, sideMode: "buy",
    minScore: 60, quantity: "2", accountId: null,
    stopLossPct: null, takeProfitPct: null, trailingStopPct: null, highWaterMark: null,
    sizingMode: "fixed", riskAmount: null, confirmWeekly: false,
    maxTradesPerDay: 5, tradesToday: 0, tradesTodayResetAt: null,
    cooldownMinutes: 0, lastTriggeredAt: null, notifyOnSignal: false,
    lastSignalScore: null, lastSignalVerdict: null,
    openEntryPrice: null, openQuantity: null, openSince: null,
    aiReview: false,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function mockChart(bars = 60, close = 100) {
  h.chart.mockResolvedValue({
    quotes: Array.from({ length: bars }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000),
      open: close, high: close, low: close, close, volume: 1000,
    })),
  });
}

beforeEach(() => {
  h.state.logs = [];
  h.state.rules = [];
  h.state.updates = [];
  h.state.inserts = [];
  h.state.failInserts = false;
  h.submitOrder.mockReset();
  h.getAiSecondOpinion.mockReset();
  h.analyzeTradingSignals.mockReset();
  h.chart.mockReset();
  mockChart(60, 100);
  h.analyzeTradingSignals.mockReturnValue({ score: 80, overall: "FORT ACHAT", signals: [] });
  h.submitOrder.mockResolvedValue({ status: "accepted", order: { id: 42, mode: "paper" } });
});

describe("processRule — second avis IA", () => {
  it("verdict 'block' → aucun ordre soumis + log ai_verdict='block'", async () => {
    const rule = makeRule({ aiReview: true });
    h.getAiSecondOpinion.mockResolvedValue({ verdict: "block", reason: "Signal contradictoire." });

    await processRule(rule as never, null);

    expect(h.getAiSecondOpinion).toHaveBeenCalledTimes(1);
    expect(h.submitOrder).not.toHaveBeenCalled();
    const log = h.state.inserts.find(i => i.table === h.logsTable);
    expect(log).toBeDefined();
    expect(log!.values.aiVerdict).toBe("block");
    expect(log!.values.aiReason).toBe("Signal contradictoire.");
    expect(log!.values.orderId).toBeNull();
  });

  it("verdict 'approve' → ordre soumis + ai_verdict/ai_reason sur le log", async () => {
    const rule = makeRule({ aiReview: true });
    h.getAiSecondOpinion.mockResolvedValue({ verdict: "approve", reason: "Contexte favorable." });

    await processRule(rule as never, null);

    expect(h.getAiSecondOpinion).toHaveBeenCalledTimes(1);
    expect(h.submitOrder).toHaveBeenCalledTimes(1);
    const log = h.state.inserts.find(i => i.table === h.logsTable);
    expect(log!.values.aiVerdict).toBe("approve");
    expect(log!.values.aiReason).toBe("Contexte favorable.");
    expect(log!.values.triggerType).toBe("order");
  });

  it("avis null (exception inattendue) → ordre soumis (fail-open), ai_verdict/ai_reason null", async () => {
    const rule = makeRule({ aiReview: true });
    h.getAiSecondOpinion.mockResolvedValue(null);

    await processRule(rule as never, null);

    expect(h.getAiSecondOpinion).toHaveBeenCalledTimes(1);
    expect(h.submitOrder).toHaveBeenCalledTimes(1);
    const log = h.state.inserts.find(i => i.table === h.logsTable);
    expect(log!.values.aiVerdict).toBeNull();
    expect(log!.values.aiReason).toBeNull();
  });

  it("rule.aiReview = false → getAiSecondOpinion JAMAIS appelé, ordre soumis", async () => {
    const rule = makeRule({ aiReview: false });

    await processRule(rule as never, null);

    expect(h.getAiSecondOpinion).not.toHaveBeenCalled();
    expect(h.submitOrder).toHaveBeenCalledTimes(1);
    const log = h.state.inserts.find(i => i.table === h.logsTable);
    expect(log!.values.aiVerdict).toBeNull();
  });

  it("blocage IA + échec d'insertion du log → console.error haute-sévérité, pas de crash, pas d'ordre", async () => {
    const rule = makeRule({ aiReview: true });
    h.getAiSecondOpinion.mockResolvedValue({ verdict: "block", reason: "Quantité incohérente." });
    h.state.failInserts = true; // simule une panne DB sur l'insertion du blocage
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Ne doit PAS lever (la boucle de règles ne doit pas planter).
    await expect(processRule(rule as never, null)).resolves.toBeUndefined();

    // Aucun ordre soumis malgré l'échec de journalisation.
    expect(h.submitOrder).not.toHaveBeenCalled();
    // L'insertion a bien été tentée (puis a rejeté).
    expect(h.state.inserts.some(i => i.table === h.logsTable)).toBe(true);
    // console.error distinct et bruyant (ce n'est PAS un skip normal).
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0][0])).toContain("ALERTE");
    expect(String(errSpy.mock.calls[0][0])).toContain("BLOCAGE IA");

    errSpy.mockRestore();
  });
});

describe("runAutoTradeCheck — verrou anti-chevauchement (in-flight)", () => {
  it("un second appel pendant un cycle lent (attente IA) est ignoré, pas de double évaluation", async () => {
    // Une règle active avec IA activée → processRule attendra getAiSecondOpinion.
    h.state.rules = [makeRule({ aiReview: true })];

    // IA LENTE : le premier cycle reste "en vol" tant que cette promesse ne se
    // résout pas. On garde la main dessus pour piloter le timing.
    let releaseAi!: () => void;
    const aiGate = new Promise<void>((resolve) => { releaseAi = resolve; });
    h.getAiSecondOpinion.mockImplementation(async () => {
      await aiGate;
      return { verdict: "approve", reason: "OK." };
    });

    // 1er cycle : démarre et se bloque sur l'attente IA (ne pas await encore).
    const first = runAutoTradeCheck();
    // Laisse le microtask/timer atteindre l'appel IA.
    await new Promise((r) => setTimeout(r, 20));

    // 2e cycle pendant que le 1er est en vol → doit être coalescé (skip immédiat).
    await runAutoTradeCheck();

    // Le 2e appel n'a lancé AUCUNE nouvelle évaluation : getAiSecondOpinion et
    // submitOrder n'ont été sollicités qu'une seule fois (par le 1er cycle).
    expect(h.getAiSecondOpinion).toHaveBeenCalledTimes(1);
    expect(h.submitOrder).not.toHaveBeenCalled(); // encore bloqué sur l'IA

    // On libère l'IA → le 1er cycle se termine et soumet enfin.
    releaseAi();
    await first;

    expect(h.getAiSecondOpinion).toHaveBeenCalledTimes(1);
    expect(h.submitOrder).toHaveBeenCalledTimes(1);

    // Après complétion, un nouveau cycle peut de nouveau tourner (verrou relâché).
    await runAutoTradeCheck();
    expect(h.getAiSecondOpinion).toHaveBeenCalledTimes(2);
  });
});
