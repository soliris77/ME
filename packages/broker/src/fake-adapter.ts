import type {
  AssetClass,
  Balance,
  BrokerAdapter,
  MarketLimits,
  OrderRequest,
  OrderResult,
  Position,
} from "./types";

export class FakeAdapter implements BrokerAdapter {
  readonly balances: Balance[] = [];
  readonly positions: Position[] = [];
  readonly orders: OrderResult[] = [];

  constructor(
    readonly id = "fake",
    readonly assetClass: AssetClass = "equity",
    private readonly limits: MarketLimits = {
      minQuantity: 0.0001,
      quantityStep: 0.0001,
      priceStep: 0.01,
    },
  ) {}

  supportsExchangeSideProtection(): boolean {
    return true;
  }

  async getBalances(): Promise<Balance[]> {
    return structuredClone(this.balances);
  }

  async getPositions(): Promise<Position[]> {
    return structuredClone(this.positions);
  }

  async getMarketLimits(): Promise<MarketLimits> {
    return { ...this.limits };
  }

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const result: OrderResult = {
      brokerOrderId: `fake-${this.orders.length + 1}`,
      clientOrderId: request.clientOrderId,
      status: "filled",
      filledQuantity: request.quantity,
      raw: request,
    };
    this.orders.push(result);
    return structuredClone(result);
  }

  async cancelOrder(_accountId: string, brokerOrderId: string): Promise<void> {
    const order = this.orders.find((item) => item.brokerOrderId === brokerOrderId);
    if (order) order.status = "cancelled";
  }

  async getOrder(_accountId: string, brokerOrderId: string): Promise<OrderResult> {
    const order = this.orders.find((item) => item.brokerOrderId === brokerOrderId);
    if (!order) throw new Error(`Ordre introuvable: ${brokerOrderId}`);
    return structuredClone(order);
  }

  async listOpenOrders(): Promise<OrderResult[]> {
    return structuredClone(this.orders.filter((order) =>
      ["pending", "open", "partially_filled"].includes(order.status),
    ));
  }

  async listOrders(): Promise<OrderResult[]> {
    return structuredClone(this.orders);
  }
}