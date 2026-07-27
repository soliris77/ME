/**
 * Soliris Market — SnapTrade broker integration
 * ─────────────────────────────────────────────
 * Thin wrapper around snaptrade-typescript-sdk.
 * Initialised lazily so the server starts cleanly even without credentials
 * (TRADING_MODE=paper), and throws a clear error if live mode is requested
 * without valid keys.
 *
 * Le clientId est codé en dur — c'est un identifiant public non-secret.
 * Le consumerKey est lu depuis la DB en priorité (persisté au démarrage),
 * puis depuis l'env var. Survit aux suppressions de secrets et aux remixes.
 */
import { Snaptrade } from "snaptrade-typescript-sdk";
import { db, appSettingsTable } from "@workspace/db";
import { logger } from "./logger";
import { getTradingMode, isLiveMode } from "./tradingMode";

// Identifiant public SnapTrade — hardcodé pour survivre aux remixes.
export const SNAPTRADE_CLIENT_ID = "PERS-XKI3EVCCAD5854MC2YDH";

let _client: Snaptrade | null = null;

/** Résout le consumerKey : DB en priorité, env var en fallback. */
export async function resolveConsumerKey(): Promise<string | null> {
  try {
    const [row] = await db.select().from(appSettingsTable).limit(1);
    if (row?.snaptradeConsumerKey) return row.snaptradeConsumerKey;
  } catch {
    // DB inaccessible — on tombe sur l'env var
  }
  return process.env.SNAPTRADE_CONSUMER_KEY ?? null;
}

/** Persiste le consumerKey depuis l'env vers la DB si absent. */
export async function persistConsumerKeyIfNeeded(): Promise<void> {
  const envKey = process.env.SNAPTRADE_CONSUMER_KEY;
  if (!envKey) return;

  try {
    const [row] = await db.select().from(appSettingsTable).limit(1);
    if (!row) return; // la ligne n'existe pas encore — ensureRow() la créera plus tard
    if (row.snaptradeConsumerKey) return; // déjà persisté

    const { eq } = await import("drizzle-orm");
    await db
      .update(appSettingsTable)
      .set({ snaptradeConsumerKey: envKey })
      .where(eq(appSettingsTable.id, row.id));

    logger.info("snaptrade: consumerKey persisté en base — survivra aux suppressions de secrets");
  } catch (err) {
    logger.warn({ err }, "snaptrade: impossible de persister le consumerKey en base");
  }
}

export function getSnaptradeClient(): Snaptrade {
  if (_client) return _client;

  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;

  if (!consumerKey) {
    throw new Error(
      "SNAPTRADE_CONSUMER_KEY must be set. " +
        "Ajoute-le comme Secret Replit ou via le portail /courtier."
    );
  }

  _client = new Snaptrade({ clientId: SNAPTRADE_CLIENT_ID, consumerKey });
  return _client;
}

/** Version async — lit le consumerKey depuis la DB si l'env var est absent. */
export async function getSnaptradeClientAsync(): Promise<Snaptrade> {
  if (_client) return _client;

  const consumerKey = await resolveConsumerKey();
  if (!consumerKey) {
    throw new Error(
      "SNAPTRADE_CONSUMER_KEY introuvable (ni en base ni dans les Secrets). " +
        "Configure-le via le portail /courtier."
    );
  }

  _client = new Snaptrade({ clientId: SNAPTRADE_CLIENT_ID, consumerKey });
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
