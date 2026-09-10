import type { MarketLimits, OrderRequest } from "@workspace/broker";

export type RiskMode = "dry_run" | "live";
export type RiskDecisionKind = "allowed" | "blocked" | "adjusted";

export interface RiskSettings {
  accountId: string;
  mode: RiskMode;
  maxPositionPct: number;
  maxDailyLossPct: number;
  maxOrdersPerHour: number;
  killSwitchActive: boolean;
  killSwitchReason?: string | null;
}

export interface RiskSettingsRepo {
  get(accountId: string): Promise<RiskSettings>;
  activateKillSwitch(accountId: string, reason: string): Promise<void>;
}

export interface AuditRepo {
  record(req: OrderRequest, decision: RiskDecisionKind, reason?: string, result?: Record<string, unknown>): Promise<void>;
}

export interface RiskContext {
  totalEquity: number;
  dayStartEquity: number;
  currentEquity: number;
  ordersLastHour: number;
  limits: MarketLimits;
  referencePrice: number;
}

export interface RiskDecision {
  allowed: boolean;
  reason?: string;
  adjustedQuantity?: number;
  mode?: RiskMode;
}