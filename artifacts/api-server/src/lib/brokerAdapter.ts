import {
  SnapTradeAdapter,
  CcxtAdapter,
  registerAdapterFactory,
  type TradingAccount,
  type BrokerAdapter,
  type OrderRequest,
} from "@workspace/broker";
import { resolveAuthoritativeConnection } from "./connectionResolver";
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
export const KRAKEN_ACCOUNT_ID = "kraken";

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

async function currentConnection(accountId: string): Promise<SnapTradeConnection> {
  const connection = await resolveAuthoritativeConnection(accountId, "snaptrade");
  if (!connection?.snaptradeUserId || !connection.snaptradeUserSecret) {
    throw new Error("Connexion SnapTrade non configurée");
  }
  return {
    snaptradeUserId: connection.snaptradeUserId,
    snaptradeUserSecret: connection.snaptradeUserSecret,
  };
}

/**
 * Register the server-owned factories exactly once.  The adapter port resolves
 * credentials at call time, so secrets never become part of a TradingAccount
 * (or a client-visible object).
 */
let factoriesRegistered = false;
export function registerBrokerAdapterFactories(): void {
  if (factoriesRegistered) return;
  factoriesRegistered = true;
  registerAdapterFactory("snaptrade", (account: TradingAccount) =>
    new SnapTradeAdapter(account.id, {
      listBalances: async (id) => { const c = await currentConnection(id); return listBalances(c.snaptradeUserId, c.snaptradeUserSecret, id); },
      listPositions: async (id) => { const c = await currentConnection(id); return listPositions(c.snaptradeUserId, c.snaptradeUserSecret, id); },
      listOrders: async (id, options) => { const c = await currentConnection(id); return listOrders(c.snaptradeUserId, c.snaptradeUserSecret, id, options); },
      cancelOrder: async (id, orderId) => {
        const c = await currentConnection(id);
        await cancelBrokerOrder({ userId: c.snaptradeUserId, userSecret: c.snaptradeUserSecret, accountId: id, brokerageOrderId: orderId });
      },
      placeOrder: async (request) => {
        const c = await currentConnection(request.accountId);
        return placeOrder({
          userId: c.snaptradeUserId, userSecret: c.snaptradeUserSecret,
          accountId: request.accountId, symbol: request.symbol,
          side: request.side.toUpperCase() as "BUY" | "SELL", quantity: request.quantity,
          orderType: request.type === "stop_limit" ? "StopLimit" : request.type === "stop" ? "Stop" : request.type === "limit" ? "Limit" : "Market",
          ...(request.limitPrice != null ? { limitPrice: request.limitPrice } : {}),
          ...(request.stopPrice != null ? { stopPrice: request.stopPrice } : {}),
          timeInForce: request.timeInForce === "gtc" ? "GTC" : "Day",
          clientOrderId: request.clientOrderId, reduceOnly: request.reduceOnly,
        });
      },
    }),
  );
  registerAdapterFactory("ccxt", (account) => {
    // Credentials are read only at construction and are never returned/logged.
    // getConfiguredAdapterForAccount performs the same fail-closed check.
    const exchangeId = account.exchangeId ?? "kraken";
    const prefix = account.secretPrefix ?? exchangeId.toUpperCase();
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    const apiKey = env[`${prefix}_API_KEY`];
    const secret = env[`${prefix}_API_SECRET`];
    if (!apiKey || !secret) throw new Error("Identifiants ccxt manquants");
    return new CcxtAdapter(account.id, { exchangeId, apiKey, secret });
  });
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