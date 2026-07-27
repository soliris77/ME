/**
 * Types TypeScript pour les réponses de l'API MetaApi.cloud
 * Référence : https://metaapi.cloud/docs/client/restApi/
 */

// ─── Provisioning API ─────────────────────────────────────────────────────────

export interface MetaApiAccount {
  _id: string;             // accountId MetaApi
  login: string;
  name: string;
  server: string;
  platform: "mt4" | "mt5";
  state: string;           // "DEPLOYED" | "DEPLOYING" | "UNDEPLOYING" | "UNDEPLOYED" | "DELETING" | "ERROR"
  connectionStatus: string; // "CONNECTED" | "DISCONNECTED" | "DISCONNECTED_FROM_BROKER"
  type: string;
  region: string;
  magic?: number;
}

// ─── Trading data API ────────────────────────────────────────────────────────

export interface MetaApiPosition {
  id: string;
  type: "POSITION_TYPE_BUY" | "POSITION_TYPE_SELL";
  symbol: string;
  volume: number;
  openPrice: number;
  currentPrice: number;
  profit: number;
  swap?: number;
  commission?: number;
  openTime: string;       // ISO 8601
  comment?: string;
}

export interface MetaApiHistoryDeal {
  id: string;
  type: string;
  symbol: string;
  volume: number;
  price: number;
  profit: number;
  swap?: number;
  commission?: number;
  time: string;           // ISO 8601
  positionId: string;
  entryType: "DEAL_ENTRY_IN" | "DEAL_ENTRY_OUT" | "DEAL_ENTRY_INOUT";
  comment?: string;
}

// ─── CopyFactory API ─────────────────────────────────────────────────────────

export interface CopyFactoryStrategy {
  _id: string;            // strategyId
  name: string;
  description?: string;
  accountId: string;      // MetaApi accountId du leader
  commissionScheme?: {
    type: string;
    billingPeriod: string;
    commissionRate: number;
  };
  platformCommissionRate?: number;
  equity?: number;
  statistics?: {
    absoluteDrawdown?: number;
    relativeDrawdown?: number;
    profit?: number;
    trades?: number;
    wonTrades?: number;
    lostTrades?: number;
    wonTradesByCount?: number;
    tradingPeriodStart?: string;
    tradingPeriodEnd?: string;
    gain?: number;
    maxAbsoluteDrawdown?: number;
    maxRelativeDrawdown?: number;
    absoluteGain?: number;
  };
  subscribers?: number;
  riskLimits?: Array<{
    type: string;
    applyTo: string;
    maxRisk: number;
    closePositions: boolean;
    startOfDay: boolean;
  }>;
}

export interface CopyFactorySubscriberStrategy {
  strategyId: string;
  multiplier: number;
  skipPendingOrders?: boolean;
  maxTradeRisk?: number;
  reduceCorrelations?: boolean;
  stopOutRisk?: {
    value: number;
    startTime: string;
  };
}

export interface CopyFactorySubscriber {
  _id: string;             // accountId (= mtConnectionId MetaApi)
  name: string;
  subscriptions: CopyFactorySubscriberStrategy[];
}

// ─── Réponses API internes (normalisées) ────────────────────────────────────

export interface NormalizedTrader {
  strategyId: string;
  displayName: string;
  description?: string;
  gainPct: number | null;          // gain % sur la période
  maxDrawdownPct: number | null;   // drawdown max %
  totalTrades: number | null;
  winRatePct: number | null;       // % de trades gagnants
  subscribers: number | null;
}

export interface NormalizedPosition {
  id: string;
  direction: "buy" | "sell";
  symbol: string;
  volume: number;
  openPrice: number;
  currentPrice: number;
  profit: number;
  openTime: string;
}
