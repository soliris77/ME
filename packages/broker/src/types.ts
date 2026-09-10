export type AssetClass = "equity" | "crypto";

export interface Balance {
  currency: string;
  free: number;
  total: number;
}

export interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice?: number;
  currency?: string;
}

export interface MarketLimits {
  minQuantity: number;
  quantityStep: number;
  priceStep: number;
  minNotional?: number;
}

export interface OrderRequest {
  accountId: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce?: "day" | "gtc";
  reduceOnly?: boolean;
  clientOrderId: string;
  protection?: {
    stopLoss?: number;
    takeProfit?: number;
  };
}

export type OrderStatus =
  | "pending"
  | "open"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "rejected";

export interface OrderResult {
  brokerOrderId: string;
  clientOrderId: string;
  status: OrderStatus;
  filledQuantity: number;
  averagePrice?: number;
  raw: unknown;
}

export interface BrokerAdapter {
  readonly id: string;
  readonly assetClass: AssetClass;

  supportsExchangeSideProtection(): boolean;
  getBalances(accountId: string): Promise<Balance[]>;
  getPositions(accountId: string): Promise<Position[]>;
  getMarketLimits(symbol: string): Promise<MarketLimits>;
  placeOrder(req: OrderRequest): Promise<OrderResult>;
  cancelOrder(accountId: string, brokerOrderId: string): Promise<void>;
  getOrder(accountId: string, brokerOrderId: string): Promise<OrderResult>;
  listOpenOrders(accountId: string): Promise<OrderResult[]>;
  listOrders(accountId: string, options?: { days?: number }): Promise<OrderResult[]>;
}

export interface TradingAccount {
  id: string;
  provider: "snaptrade" | "ccxt";
  assetClass: AssetClass;
  exchangeId?: string;
  secretPrefix?: string;
}