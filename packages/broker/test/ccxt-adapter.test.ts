import ccxt from "ccxt";
import { describe, expect, it, vi } from "vitest";
import { CcxtAdapter, type CcxtExchange } from "../src";

function exchange(overrides: Partial<CcxtExchange> = {}): CcxtExchange {
  return {
    rateLimit: 250,
    loadMarkets: vi.fn().mockResolvedValue({}),
    market: vi.fn().mockReturnValue({
      limits: { amount: { min: 0.0001 }, cost: { min: 5 } },
      precision: { amount: 0.00001, price: 0.1 },
    }),
    fetchBalance: vi.fn().mockResolvedValue({ total: {}, free: {} }),
    createOrder: vi.fn().mockResolvedValue({
      id: "order-1",
      clientOrderId: "client-1",
      status: "open",
      filled: 0,
      amount: 0.12345,
    }),
    cancelOrder: vi.fn().mockResolvedValue({}),
    fetchOrder: vi.fn().mockResolvedValue({ id: "order-1", status: "open" }),
    fetchOpenOrders: vi.fn().mockResolvedValue([]),
    fetchClosedOrders: vi.fn().mockResolvedValue([]),
    amountToPrecision: vi.fn().mockReturnValue("0.12345"),
    priceToPrecision: vi.fn().mockReturnValue("65432.1"),
    ...overrides,
  };
}

describe("CcxtAdapter", () => {
  it("arrondit quantité et prix avant createOrder", async () => {
    const mock = exchange();
    const adapter = new CcxtAdapter("kraken", {
      exchangeId: "kraken",
      apiKey: "test",
      secret: "test",
      exchange: mock,
      sleep: async () => undefined,
    });

    await adapter.placeOrder({
      accountId: "spot",
      symbol: "BTC-USD",
      side: "buy",
      type: "limit",
      quantity: 0.123456789,
      limitPrice: 65432.149,
      clientOrderId: "client-1",
    });

    expect(mock.amountToPrecision).toHaveBeenCalledWith("BTC/USD", 0.123456789);
    expect(mock.priceToPrecision).toHaveBeenCalledWith("BTC/USD", 65432.149);
    expect(mock.createOrder).toHaveBeenCalledWith(
      "BTC/USD",
      "limit",
      "buy",
      0.12345,
      65432.1,
      { clientOrderId: "client-1" },
    );
  });

  it("réconcilie un timeout par clientOrderId sans créer de doublon", async () => {
    const createOrder = vi.fn().mockRejectedValue(new ccxt.RequestTimeout("timeout"));
    const mock = exchange({
      createOrder,
      fetchOpenOrders: vi.fn().mockResolvedValue([{
        id: "already-created",
        clientOrderId: "stable-client-id",
        status: "open",
        filled: 0,
        amount: 1,
      }]),
    });
    const sleeps = vi.fn().mockResolvedValue(undefined);
    const adapter = new CcxtAdapter("kraken", {
      exchangeId: "kraken",
      apiKey: "test",
      secret: "test",
      exchange: mock,
      sleep: sleeps,
    });

    const result = await adapter.placeOrder({
      accountId: "spot",
      symbol: "BTC-USD",
      side: "buy",
      type: "market",
      quantity: 1,
      clientOrderId: "stable-client-id",
    });

    expect(result.brokerOrderId).toBe("already-created");
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(sleeps).not.toHaveBeenCalled();
  });

  it("ne reprend jamais une erreur InsufficientFunds", async () => {
    const createOrder = vi.fn().mockRejectedValue(new ccxt.InsufficientFunds("fonds insuffisants"));
    const mock = exchange({ createOrder });
    const sleeps = vi.fn().mockResolvedValue(undefined);
    const adapter = new CcxtAdapter("kraken", {
      exchangeId: "kraken",
      apiKey: "test",
      secret: "test",
      exchange: mock,
      sleep: sleeps,
    });

    await expect(adapter.placeOrder({
      accountId: "spot",
      symbol: "BTC-USD",
      side: "buy",
      type: "market",
      quantity: 1,
      clientOrderId: "insufficient-funds",
    })).rejects.toBeInstanceOf(ccxt.InsufficientFunds);

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(mock.fetchOpenOrders).not.toHaveBeenCalled();
    expect(mock.fetchClosedOrders).not.toHaveBeenCalled();
    expect(sleeps).not.toHaveBeenCalled();
  });
});