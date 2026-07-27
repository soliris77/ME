/**
 * Soliris Market — SnapTrade broker integration
 * ─────────────────────────────────────────────
 * Thin wrapper around snaptrade-typescript-sdk.
 * Initialised lazily so the server starts cleanly even without credentials
 * (TRADING_MODE=paper), and throws a clear error if live mode is requested
 * without valid keys.
 */
import { Snaptrade } from "snaptrade-typescript-sdk";
import { logger } from "./logger";
import { getTradingMode, isLiveMode } from "./tradingMode";

let _client: Snaptrade | null = null;

export function getSnaptradeClient(): Snaptrade {
  if (_client) return _client;

  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;

  if (!clientId || !consumerKey) {
    throw new Error(
      "SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY must be set. " +
        "Create a partner account at snaptrade.com to obtain them."
    );
  }

  _client = new Snaptrade({ clientId, consumerKey });
  return _client;
}

// Re-export depuis le module centralisé — toute logique de mode vit là-bas.
export { getTradingMode, isLiveMode } from "./tradingMode";

// ─── User registration (single-user app, idempotent) ─────────────────────────

export interface SnaptradeUser {
  userId: string;
  userSecret: string;
}

/**
 * Register a new SnapTrade user. If userId already exists (409), rotates
 * and returns a fresh userSecret.
 */
export async function registerSnaptradeUser(userId: string): Promise<SnaptradeUser> {
  const client = getSnaptradeClient();
  try {
    const res = await client.authentication.registerSnapTradeUser({ userId });
    const data = res.data as { userId: string; userSecret: string };
    logger.info({ userId }, "snaptrade: user registered");
    return { userId: data.userId, userSecret: data.userSecret };
  } catch (err: unknown) {
    // 409 — userId already registered; rotate the secret
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status === 409) {
      logger.info({ userId }, "snaptrade: user already exists, rotating secret");
      const reset = await client.authentication.resetSnapTradeUserSecret({ userId, userSecret: "" });
      const data = reset.data as { userId: string; userSecret: string };
      return { userId: data.userId, userSecret: data.userSecret };
    }
    throw err;
  }
}

// ─── Connection Portal URL ────────────────────────────────────────────────────

export async function getConnectionPortalUrl(
  userId: string,
  userSecret: string,
  reconnect?: string
): Promise<string> {
  const client = getSnaptradeClient();

  const res = await client.authentication.loginSnapTradeUser({
    userId,
    userSecret,
    ...(reconnect ? { reconnect } : {}),
    connectionType: "trade-if-available",
    connectionPortalVersion: "v4",
  });

  // Response is either LoginRedirectURI or EncryptedResponse
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = res.data as any;
  return (data?.redirectURI ?? data?.loginLink ?? "") as string;
}

// ─── Account data ─────────────────────────────────────────────────────────────

export async function listAccounts(userId: string, userSecret: string) {
  const client = getSnaptradeClient();
  const res = await client.accountInformation.listUserAccounts({ userId, userSecret });
  return res.data ?? [];
}

export async function listPositions(userId: string, userSecret: string, accountId: string) {
  const client = getSnaptradeClient();
  const res = await client.accountInformation.getUserAccountPositions({
    userId,
    userSecret,
    accountId,
  });
  return res.data ?? [];
}

export async function listBalances(userId: string, userSecret: string, accountId: string) {
  const client = getSnaptradeClient();
  const res = await client.accountInformation.getUserAccountBalance({
    userId,
    userSecret,
    accountId,
  });
  return res.data ?? [];
}

// ─── Order placement ──────────────────────────────────────────────────────────

export interface PlaceOrderParams {
  userId: string;
  userSecret: string;
  /** SnapTrade account_id (UUID) */
  accountId: string;
  /** Ticker symbol (e.g. "AAPL") — SnapTrade resolves it via universal symbol lookup */
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  orderType?: "Market" | "Limit" | "Stop" | "StopLimit";
  limitPrice?: number;
  /** Client-side idempotency key (signal ID) */
  clientOrderId?: string;
}

/**
 * Submit an order directly to the brokerage via placeForceOrder.
 * Guarded at runtime — throws if TRADING_MODE !== "live", so a bug in a
 * caller (or a future automated engine) can never silently place a real
 * order while the app believes it's in paper mode.
 */
export async function placeOrder(params: PlaceOrderParams) {
  if (!isLiveMode()) {
    throw new Error(
      `placeOrder() appelé alors que TRADING_MODE="${getTradingMode()}" — un ordre réel ne peut être soumis qu'en mode live.`
    );
  }

  const client = getSnaptradeClient();

  const res = await client.trading.placeForceOrder({
    userId: params.userId,
    userSecret: params.userSecret,
    account_id: params.accountId,
    action: params.side, // "BUY" | "SELL"
    order_type: params.orderType ?? "Market",
    time_in_force: "Day",
    symbol: params.symbol,
    units: params.quantity,
    ...(params.limitPrice != null ? { price: params.limitPrice } : {}),
    ...(params.clientOrderId != null ? { client_order_id: params.clientOrderId } : {}),
  });

  return res.data;
}
