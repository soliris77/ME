import { describe, expect, it } from "vitest";
import { FakeAdapter, SnapTradeAdapter, toBrokerSymbol, toInternalSymbol } from "../src";

describe("symboles", () => {
  it("normalise les symboles ccxt sans modifier les symboles actions", () => {
    expect(toBrokerSymbol("BTC-USD", "ccxt")).toBe("BTC/USD");
    expect(toBrokerSymbol("AAPL", "snaptrade")).toBe("AAPL");
    expect(toInternalSymbol("btc/usd")).toBe("BTC-USD");
  });
});

describe("SnapTradeAdapter", () => {
  it("normalise les positions et les ordres sans exposer le SDK", async () => {
    const adapter = new SnapTradeAdapter("snaptrade-test", {
      listBalances: async () => [{ currency: { code: "cad" }, cash: 250 }],
      listPositions: async () => [{
        symbol: { symbol: { ticker: "AAPL" }, currency: { code: "USD" } },
        units: 2,
        average_purchase_price: 95,
        price: 101,
      }],
      placeOrder: async (request) => ({
        brokerage_order_id: "broker-1",
        client_order_id: request.clientOrderId,
        status: "EXECUTED",
        filled_quantity: request.quantity,
        execution_price: 101,
      }),
      cancelOrder: async () => undefined,
      listOrders: async () => [],
    });

    expect(await adapter.getBalances("account")).toEqual([{ currency: "CAD", free: 250, total: 250 }]);
    expect(await adapter.getPositions("account")).toEqual([{
      symbol: "AAPL",
      quantity: 2,
      averagePrice: 95,
      currentPrice: 101,
      currency: "USD",
    }]);
    expect((await adapter.placeOrder({
      accountId: "account",
      symbol: "AAPL",
      side: "buy",
      type: "market",
      quantity: 2,
      clientOrderId: "client-1",
    })).status).toBe("filled");
  });
});

describe("FakeAdapter", () => {
  it("fait tourner un cycle d'ordre complet sans réseau", async () => {
    const adapter = new FakeAdapter();
    const order = await adapter.placeOrder({
      accountId: "paper",
      symbol: "AAPL",
      side: "buy",
      type: "market",
      quantity: 1,
      clientOrderId: "fake-client",
    });
    expect(order.status).toBe("filled");
    expect(await adapter.getOrder("paper", order.brokerOrderId)).toEqual(order);
  });
});