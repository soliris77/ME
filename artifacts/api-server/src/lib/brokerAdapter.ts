import {
  SnapTradeAdapter,
  type BrokerAdapter,
  type OrderRequest,
} from "@workspace/broker";
import {
  cancelBrokerOrder,
  listBalances,
  listOrders,
  listPositions,
  placeOrder,
} from "./snaptrade";

export interface SnapTradeConnection {
  snaptradeUserId: string;
  snaptradeUserSecret: string;
}

/** API boundary for broker access. Callers only see normalized adapter contracts. */
function createBrokerAdapter(
  connection: SnapTradeConnection,
): BrokerAdapter {
  const port = {
    listBalances: (accountId: string) => listBalances(connection.snaptradeUserId, connection.snaptradeUserSecret, accountId),
    listPositions: (accountId: string) => listPositions(connection.snaptradeUserId, connection.snaptradeUserSecret, accountId),
    listOrders: (accountId: string, options?: { days?: number }) =>
      listOrders(connection.snaptradeUserId, connection.snaptradeUserSecret, accountId, options),
    cancelOrder: (accountId: string, brokerOrderId: string) =>
      cancelBrokerOrder({
        userId: connection.snaptradeUserId,
        userSecret: connection.snaptradeUserSecret,
        accountId,
        brokerageOrderId: brokerOrderId,
      }).then(() => undefined),
    placeOrder: (request: OrderRequest) =>
      placeOrder({
        userId: connection.snaptradeUserId,
        userSecret: connection.snaptradeUserSecret,
        accountId: request.accountId,
        symbol: request.symbol,
        side: request.side.toUpperCase() as "BUY" | "SELL",
        quantity: request.quantity,
        orderType: request.type === "stop_limit" ? "StopLimit" :
          request.type === "stop" ? "Stop" :
          request.type === "limit" ? "Limit" : "Market",
        ...(request.limitPrice != null ? { limitPrice: request.limitPrice } : {}),
        ...(request.stopPrice != null ? { stopPrice: request.stopPrice } : {}),
        timeInForce: request.timeInForce === "gtc" ? "GTC" : "Day",
        clientOrderId: request.clientOrderId,
        reduceOnly: request.reduceOnly,
      }),
  };
  return new SnapTradeAdapter("snaptrade", port);
}

export function resolveBrokerAdapter(connection: SnapTradeConnection): BrokerAdapter;
export function resolveBrokerAdapter(connection: null | undefined): null;
export function resolveBrokerAdapter(
  connection: SnapTradeConnection | null | undefined,
): BrokerAdapter | null {
  return connection ? createBrokerAdapter(connection) : null;
}

/** @deprecated Use resolveBrokerAdapter. */
export const resolveSnapTradeAdapter = resolveBrokerAdapter;