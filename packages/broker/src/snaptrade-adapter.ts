import { toInternalSymbol } from "./symbols";
import type {
  Balance,
  BrokerAdapter,
  MarketLimits,
  OrderRequest,
  OrderResult,
  OrderStatus,
  Position,
} from "./types";

export interface SnapTradePort {
  listBalances(accountId: string): Promise<unknown[]>;
  listPositions(accountId: string): Promise<unknown[]>;
  placeOrder(request: OrderRequest): Promise<unknown>;
  cancelOrder(accountId: string, brokerOrderId: string): Promise<void>;
  listOrders(accountId: string, options?: { days?: number }): Promise<unknown[]>;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function snapTradeStatus(rawStatus: unknown, filled: number, quantity: number): OrderStatus {
  const status = String(rawStatus ?? "").toUpperCase();
  if (["EXECUTED", "FILLED", "CLOSED"].includes(status)) return "filled";
  if (["PARTIAL", "PARTIALLY_EXECUTED", "PARTIALLY_FILLED"].includes(status)) return "partially_filled";
  if (["REJECTED", "FAILED", "ERROR"].includes(status)) return "rejected";
  if (["CANCELED", "CANCELLED", "PARTIAL_CANCELED", "EXPIRED"].includes(status)) return "cancelled";
  if (filled > 0 && quantity > filled) return "partially_filled";
  return status ? "open" : "pending";
}

export function snapTradeRecordKeys(record: unknown): string[] {
  const value = record as Record<string, unknown>;
  const brokerageId = value.brokerage_order_id;
  const id = value.id ?? (value.order as Record<string, unknown> | undefined)?.id;
  return [brokerageId, id]
    .filter((item): item is string | number => item !== null && item !== undefined && item !== "")
    .map(String)
    .filter((item, index, all) => all.indexOf(item) === index);
}

export class SnapTradeAdapter implements BrokerAdapter {
  readonly assetClass = "equity" as const;

  constructor(
    readonly id: string,
    private readonly port: SnapTradePort,
  ) {}

  supportsExchangeSideProtection(): boolean {
    return false;
  }

  async getBalances(accountId: string): Promise<Balance[]> {
    const raw = await this.port.listBalances(accountId);
    return raw.map((item) => {
      const value = item as Record<string, unknown>;
      const currencyValue = value.currency as Record<string, unknown> | string | undefined;
      const currency = typeof currencyValue === "string"
        ? currencyValue
        : String(currencyValue?.code ?? value.code ?? "USD");
      const total = finiteNumber(value.total ?? value.cash ?? value.amount ?? value.balance);
      const free = finiteNumber(value.free ?? value.available ?? value.cash ?? total);
      return { currency: currency.toUpperCase(), free, total };
    });
  }

  async getPositions(accountId: string): Promise<Position[]> {
    const raw = await this.port.listPositions(accountId);
    return raw.map((item) => {
      const value = item as Record<string, unknown>;
      const symbolValue = value.symbol as Record<string, unknown> | string | undefined;
      const nestedSymbol = typeof symbolValue === "object" && symbolValue
        ? symbolValue.symbol as Record<string, unknown> | string | undefined
        : undefined;
      const ticker = typeof nestedSymbol === "object" && nestedSymbol
        ? nestedSymbol.ticker
        : typeof nestedSymbol === "string"
          ? nestedSymbol
          : typeof symbolValue === "object" && symbolValue
            ? symbolValue.ticker
            : symbolValue;
      const currencyValue = typeof symbolValue === "object" && symbolValue
        ? symbolValue.currency as Record<string, unknown> | string | undefined
        : value.currency;
      const currency = typeof currencyValue === "object" && currencyValue
        ? (currencyValue as Record<string, unknown>).code
        : currencyValue;
      const averagePrice = finiteNumber(value.average_purchase_price ?? value.averagePrice ?? value.price);
      const currentPrice = finiteNumber(value.price ?? value.current_price ?? averagePrice);
      return {
        symbol: toInternalSymbol(String(ticker ?? "")),
        quantity: finiteNumber(value.units ?? value.quantity),
        averagePrice,
        currentPrice,
        currency: String(currency ?? "USD").toUpperCase(),
      };
    }).filter((position) => position.symbol && position.quantity !== 0);
  }

  async getMarketLimits(_symbol: string): Promise<MarketLimits> {
    return {
      minQuantity: 0.0001,
      quantityStep: 0.0001,
      priceStep: 0.01,
    };
  }

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    return this.toOrderResult(await this.port.placeOrder(request), request.clientOrderId, request.quantity);
  }

  async cancelOrder(accountId: string, brokerOrderId: string): Promise<void> {
    await this.port.cancelOrder(accountId, brokerOrderId);
  }

  async getOrder(accountId: string, brokerOrderId: string): Promise<OrderResult> {
    const orders = await this.listOrders(accountId);
    const order = orders.find((item) => item.brokerOrderId === brokerOrderId);
    if (!order) throw new Error(`Ordre courtier introuvable: ${brokerOrderId}`);
    return order;
  }

  async listOpenOrders(accountId: string): Promise<OrderResult[]> {
    return (await this.listOrders(accountId)).filter((order) =>
      ["pending", "open", "partially_filled"].includes(order.status),
    );
  }

  async listOrders(accountId: string, options?: { days?: number }): Promise<OrderResult[]> {
    const raw = await this.port.listOrders(accountId, options);
    return raw.map((item) => this.toOrderResult(item));
  }

  private toOrderResult(raw: unknown, fallbackClientOrderId = "", fallbackQuantity = 0): OrderResult {
    const value = raw as Record<string, unknown>;
    const nested = (value.order as Record<string, unknown> | undefined) ?? value;
    const keys = snapTradeRecordKeys(value);
    const filledQuantity = finiteNumber(value.filled_quantity ?? nested.filled_quantity);
    const quantity = finiteNumber(value.units ?? value.quantity ?? nested.units ?? nested.quantity, fallbackQuantity);
    return {
      brokerOrderId: keys[0] ?? "",
      clientOrderId: String(value.client_order_id ?? nested.client_order_id ?? fallbackClientOrderId),
      status: snapTradeStatus(value.status ?? nested.status, filledQuantity, quantity),
      filledQuantity,
      averagePrice: finiteNumber(value.execution_price ?? nested.execution_price) || undefined,
      raw,
    };
  }
}