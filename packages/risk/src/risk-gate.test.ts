import { describe, expect, it } from "vitest";
import { RiskGate } from "./risk-gate";
import type { AuditRepo, RiskContext, RiskSettings, RiskSettingsRepo } from "./types";
import type { OrderRequest } from "@workspace/broker";

function request(overrides: Partial<OrderRequest> = {}): OrderRequest {
  return {
    accountId: "acct-acceptance",
    symbol: "AAPL",
    side: "buy",
    type: "market",
    quantity: 2,
    clientOrderId: "acceptance-1",
    ...overrides,
  };
}

function context(overrides: Partial<RiskContext> = {}): RiskContext {
  return {
    totalEquity: 10_000,
    dayStartEquity: 10_000,
    currentEquity: 10_000,
    ordersLastHour: 0,
    limits: { minQuantity: 0.01, quantityStep: 0.01, priceStep: 0.01 },
    referencePrice: 100,
    ...overrides,
  };
}

function harness(initial: Partial<RiskSettings> = {}) {
  let settings: RiskSettings = {
    accountId: "acct-acceptance",
    mode: "dry_run",
    maxPositionPct: 5,
    maxDailyLossPct: 2,
    maxOrdersPerHour: 3,
    killSwitchActive: false,
    killSwitchReason: null,
    ...initial,
  };
  const records: { decision: string; reason?: string; result?: Record<string, unknown> }[] = [];
  const repo: RiskSettingsRepo = {
    get: async () => settings,
    activateKillSwitch: async (_accountId, reason) => {
      settings = { ...settings, killSwitchActive: true, killSwitchReason: reason };
    },
  };
  const audit: AuditRepo = {
    record: async (_req, decision, reason, result) => {
      records.push({ decision, reason, result });
    },
  };
  return { gate: new RiskGate(repo, audit), records };
}

describe("Lot 6 acceptance 1 — daily loss threshold activates kill switch and blocks", () => {
  it("blocks at the threshold, activates the switch, and keeps the next request blocked", async () => {
    const h = harness();
    const first = await h.gate.evaluate(request(), context({ currentEquity: 9_800 }));
    const second = await h.gate.evaluate(request({ clientOrderId: "acceptance-2" }), context());

    expect(first).toMatchObject({ allowed: false, reason: "perte quotidienne maximale atteinte" });
    expect(second).toMatchObject({ allowed: false, reason: expect.stringContaining("kill_switch") });
    expect(h.records.map((r) => r.decision)).toEqual(["blocked", "blocked"]);
  });
});

describe("Lot 6 acceptance 2 — excessive quantity returns capped adjusted quantity", () => {
  it("allows the order with quantity capped at max_position_pct", async () => {
    const h = harness({ maxPositionPct: 5 });
    const result = await h.gate.evaluate(request({ quantity: 10 }), context({ referencePrice: 100 }));

    expect(result).toMatchObject({ allowed: true, adjustedQuantity: 5, mode: "dry_run" });
    expect(h.records[0]).toMatchObject({ decision: "adjusted", result: { simulated: true, quantity: 5 } });
  });
});

describe("Lot 6 acceptance 3 — market minimum quantity blocks with exact French reason", () => {
  it("returns the exact minimum-quantity reason", async () => {
    const h = harness();
    const result = await h.gate.evaluate(request({ quantity: 0.001 }), context());

    expect(result).toEqual({
      allowed: false,
      reason: "quantité sous le minimum du marché",
      mode: "dry_run",
    });
  });
});

describe("Lot 6 acceptance 4 — hourly limit and minimum notional audit", () => {
  it("blocks the hourly limit and records an audit entry", async () => {
    const h = harness({ maxOrdersPerHour: 2 });
    const result = await h.gate.evaluate(request(), context({ ordersLastHour: 2 }));

    expect(result.reason).toBe("plafond horaire d’ordres atteint");
    expect(h.records[0]).toMatchObject({ decision: "blocked", reason: "plafond horaire d’ordres atteint" });
  });

  it("blocks minimum notional and records an audit entry", async () => {
    const h = harness();
    const result = await h.gate.evaluate(request({ quantity: 0.02 }), context({
      referencePrice: 100,
      limits: { minQuantity: 0.01, minNotional: 10, quantityStep: 0.01, priceStep: 0.01 },
    }));

    expect(result.reason).toBe("notionnel sous le minimum du marché");
    expect(h.records[0]).toMatchObject({ decision: "blocked", reason: "notionnel sous le minimum du marché" });
  });
});