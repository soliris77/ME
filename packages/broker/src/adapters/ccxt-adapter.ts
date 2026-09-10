import ccxt from "ccxt";
import { toBrokerSymbol, toInternalSymbol } from "../symbols";
import type {
  Balance, BrokerAdapter, MarketLimits, OrderRequest, OrderResult, Position,
} from "../types";

export interface CcxtExchange {
  rateLimit: number;
  loadMarkets(): Promise<unknown>;
  market(symbol: string): any;
  fetchBalance(): Promise<any>;
  createOrder(...args: any[]): Promise<any>;
  cancelOrder(id: string): Promise<any>;
  fetchOrder(id: string): Promise<any>;
  fetchOpenOrders(): Promise<any[]>;
  fetchClosedOrders(): Promise<any[]>;
  amountToPrecision(symbol: string, amount: number): string;
  priceToPrecision(symbol: string, price: number): string;
}

export interface CcxtAdapterOptions {
  exchangeId: string;
  apiKey: string;
  secret: string;
  /** A mock exchange may be supplied by unit tests. */
  exchange?: CcxtExchange;
  sleep?: (milliseconds: number) => Promise<void>;
  onAuthenticationError?: (error: unknown) => void;
}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function errorIs(error: unknown, name: string): boolean {
  return error instanceof (ccxt as any)[name] || (error as any)?.constructor?.name === name ||
    (error as any)?.name === name;
}

function mapStatus(status: string | undefined, filled: number, amount: number) {
  if (status === "closed") return "filled" as const;
  if (status === "canceled" || status === "cancelled") return "cancelled" as const;
  if (status === "rejected") return "rejected" as const;
  if (filled > 0 && filled < amount) return "partially_filled" as const;
  return "open" as const;
}

export class CcxtAdapter implements BrokerAdapter {
  readonly assetClass = "crypto" as const;
  private readonly exchange: CcxtExchange;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private marketsLoaded = false;

  constructor(
    readonly id: string,
    private readonly options: CcxtAdapterOptions,
  ) {
    if (options.exchange) {
      this.exchange = options.exchange;
    } else {
      const ExchangeCtor = (ccxt as any)[options.exchangeId];
      if (!ExchangeCtor) throw new Error(`Exchange ccxt inconnu: ${options.exchangeId}`);
      this.exchange = new ExchangeCtor({
        apiKey: options.apiKey,
        secret: options.secret,
        enableRateLimit: true,
        options: { adjustForTimeDifference: true },
      });
    }
    this.sleep = options.sleep ?? defaultSleep;
  }

  supportsExchangeSideProtection(): boolean { return true; }

  private async call<T>(
    operation: () => Promise<T>,
    reconcile?: () => Promise<T | undefined>,
  ): Promise<T> {
    let networkRetries = 0;
    let rateLimitRetries = 0;
    for (;;) {
      try {
        return await operation();
      } catch (error) {
        if (errorIs(error, "AuthenticationError")) {
          this.options.onAuthenticationError?.(error);
          throw error;
        }
        if (errorIs(error, "InsufficientFunds") || errorIs(error, "InvalidOrder")) throw error;
        if (errorIs(error, "RateLimitExceeded") && rateLimitRetries < 1) {
          rateLimitRetries++;
          await this.sleep(this.exchange.rateLimit);
          continue;
        }
        if (errorIs(error, "NetworkError") || errorIs(error, "RequestTimeout")) {
          if (reconcile) {
            const existing = await reconcile();
            if (existing) return existing;
          }
        }
        if ((errorIs(error, "NetworkError") || errorIs(error, "RequestTimeout")) && networkRetries < 3) {
          await this.sleep(1000 * (2 ** networkRetries));
          networkRetries++;
          continue;
        }
        throw error;
      }
    }
  }

  private async ensureMarkets(): Promise<void> {
    if (!this.marketsLoaded) {
      await this.call(() => this.exchange.loadMarkets());
      this.marketsLoaded = true;
    }
  }

  async getBalances(_accountId?: string): Promise<Balance[]> {
    const raw = await this.call(() => this.exchange.fetchBalance());
    return Object.entries(raw.total ?? {})
      .filter(([, total]) => Number(total) > 0)
      .map(([currency, total]) => ({
        currency, total: Number(total), free: Number(raw.free?.[currency] ?? 0),
      }));
  }

  async getPositions(_accountId?: string): Promise<Position[]> {
    const balances = await this.getBalances();
    return balances
      .filter((balance) => !["USD", "CAD", "USDT"].includes(balance.currency))
      .map((balance) => ({
        symbol: toInternalSymbol(`${balance.currency}/USD`),
        quantity: balance.total,
        averagePrice: 0,
      }));
  }

  async getMarketLimits(symbol: string): Promise<MarketLimits> {
    await this.ensureMarkets();
    const market = this.exchange.market(toBrokerSymbol(symbol, "ccxt"));
    return {
      minQuantity: Number(market.limits?.amount?.min ?? 0),
      quantityStep: Number(market.precision?.amount ?? 0),
      priceStep: Number(market.precision?.price ?? 0),
      ...(market.limits?.cost?.min != null ? { minNotional: Number(market.limits.cost.min) } : {}),
    };
  }

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    await this.ensureMarkets();
    const symbol = toBrokerSymbol(request.symbol, "ccxt");
    const amount = Number(this.exchange.amountToPrecision(symbol, request.quantity));
    const price = request.limitPrice == null
      ? undefined : Number(this.exchange.priceToPrecision(symbol, request.limitPrice));
    const params: Record<string, unknown> = { clientOrderId: request.clientOrderId };
    if (request.reduceOnly) params.reduceOnly = true;
    const order = await this.call(
      () => this.exchange.createOrder(symbol, request.type, request.side, amount, price, params),
      () => this.findByClientOrderId(request.clientOrderId),
    );
    if (order && typeof order === "object" && "brokerOrderId" in order) {
      return order as OrderResult;
    }
    return this.toOrderResult(order, request.clientOrderId);
  }

  private async findByClientOrderId(clientOrderId: string): Promise<OrderResult | undefined> {
    const orders = [
      ...(await this.call(() => this.exchange.fetchOpenOrders())),
      ...(await this.call(() => this.exchange.fetchClosedOrders())),
    ];
    const found = orders.find((order) => String(order.clientOrderId ?? order.info?.clientOrderId ?? "") === clientOrderId);
    return found ? this.toOrderResult(found, clientOrderId) : undefined;
  }

  async cancelOrder(_accountId: string, brokerOrderId: string): Promise<void> {
    await this.call(() => this.exchange.cancelOrder(brokerOrderId)).then(() => undefined);
  }

  async getOrder(_accountId: string, brokerOrderId: string): Promise<OrderResult> {
    const order = await this.call(() => this.exchange.fetchOrder(brokerOrderId));
    return this.toOrderResult(order, String(order.clientOrderId ?? ""));
  }

  async listOpenOrders(_accountId?: string): Promise<OrderResult[]> {
    return (await this.call(() => this.exchange.fetchOpenOrders()))
      .map((order) => this.toOrderResult(order, String(order.clientOrderId ?? "")));
  }

  async listOrders(_accountId?: string, _options?: { days?: number }): Promise<OrderResult[]> {
    const orders = await this.call(() => this.exchange.fetchClosedOrders());
    return orders.map((order) => this.toOrderResult(order, String(order.clientOrderId ?? "")));
  }

  private toOrderResult(order: any, clientOrderId: string): OrderResult {
    return {
      brokerOrderId: String(order.id),
      clientOrderId,
      status: mapStatus(order.status, Number(order.filled ?? 0), Number(order.amount ?? 0)),
      filledQuantity: Number(order.filled ?? 0),
      ...(order.average != null ? { averagePrice: Number(order.average) } : {}),
      raw: order,
    };
  }
}