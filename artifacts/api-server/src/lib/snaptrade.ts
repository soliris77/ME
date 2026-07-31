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

// Identifiant public de fallback — remplacé par la valeur en base si présente.
export const SNAPTRADE_CLIENT_ID_DEFAULT = "PERS-XKI3EVCCAD5854MC2YDH";

let _client: Snaptrade | null = null;

/** Invalide le client caché (appeler après mise à jour des credentials). */
export function invalidateSnaptradeClient(): void {
  _client = null;
}

/**
 * Résout tous les credentials SnapTrade.
 * Ordre de priorité : DB → env var → valeur hardcodée (clientId seulement).
 */
export async function resolveCredentials(): Promise<{
  clientId: string | null;
  consumerKey: string | null;
  userId: string | null;
  userSecret: string | null;
}> {
  try {
    const [row] = await db.select().from(appSettingsTable).limit(1);
    return {
      clientId:    row?.snaptradeClientId    ?? process.env.SNAPTRADE_CLIENT_ID    ?? SNAPTRADE_CLIENT_ID_DEFAULT,
      consumerKey: row?.snaptradeConsumerKey ?? process.env.SNAPTRADE_CONSUMER_KEY ?? null,
      userId:      row?.snaptradeUserId      ?? process.env.SNAPTRADE_USER_ID      ?? null,
      userSecret:  row?.snaptradeUserSecret  ?? process.env.SNAPTRADE_USER_SECRET  ?? null,
    };
  } catch {
    return {
      clientId:    process.env.SNAPTRADE_CLIENT_ID    ?? SNAPTRADE_CLIENT_ID_DEFAULT,
      consumerKey: process.env.SNAPTRADE_CONSUMER_KEY ?? null,
      userId:      process.env.SNAPTRADE_USER_ID      ?? null,
      userSecret:  process.env.SNAPTRADE_USER_SECRET  ?? null,
    };
  }
}

/** Résout le consumerKey seul (rétrocompatibilité). */
export async function resolveConsumerKey(): Promise<string | null> {
  const creds = await resolveCredentials();
  return creds.consumerKey;
}

/** Persiste les credentials depuis env vars vers la DB si absents (démarrage). */
export async function persistConsumerKeyIfNeeded(): Promise<void> {
  const envKey = process.env.SNAPTRADE_CONSUMER_KEY;
  if (!envKey) return;

  try {
    const [row] = await db.select().from(appSettingsTable).limit(1);
    if (!row) return;
    if (row.snaptradeConsumerKey) return;

    const { eq } = await import("drizzle-orm");
    const updates: Record<string, string> = { snaptradeConsumerKey: envKey };
    if (!row.snaptradeClientId   && process.env.SNAPTRADE_CLIENT_ID)    updates.snaptradeClientId   = process.env.SNAPTRADE_CLIENT_ID;
    if (!row.snaptradeUserId     && process.env.SNAPTRADE_USER_ID)      updates.snaptradeUserId     = process.env.SNAPTRADE_USER_ID;
    if (!row.snaptradeUserSecret && process.env.SNAPTRADE_USER_SECRET)  updates.snaptradeUserSecret = process.env.SNAPTRADE_USER_SECRET;

    await db.update(appSettingsTable).set(updates).where(eq(appSettingsTable.id, row.id));
    logger.info("snaptrade: credentials persistés en base — survivront aux remixes");
  } catch (err) {
    logger.warn({ err }, "snaptrade: impossible de persister les credentials en base");
  }
}

export function getSnaptradeClient(): Snaptrade {
  if (_client) return _client;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  const clientId    = process.env.SNAPTRADE_CLIENT_ID ?? SNAPTRADE_CLIENT_ID_DEFAULT;
  if (!consumerKey) {
    throw new Error("SNAPTRADE_CONSUMER_KEY introuvable. Configure-le via le portail /courtier.");
  }
  _client = new Snaptrade({ clientId, consumerKey });
  return _client;
}

/** Version async — lit tous les credentials depuis la DB. */
export async function getSnaptradeClientAsync(): Promise<Snaptrade> {
  if (_client) return _client;
  const creds = await resolveCredentials();
  if (!creds.consumerKey) {
    throw new Error("SNAPTRADE_CONSUMER_KEY introuvable (ni en base ni dans les Secrets). Configure-le via le portail /courtier.");
  }
  _client = new Snaptrade({ clientId: creds.clientId ?? SNAPTRADE_CLIENT_ID_DEFAULT, consumerKey: creds.consumerKey });
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
  const client = await getSnaptradeClientAsync();
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
  const client = await getSnaptradeClientAsync();

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
  const client = await getSnaptradeClientAsync();
  const res = await client.accountInformation.listUserAccounts({ userId, userSecret });
  return res.data ?? [];
}

export async function listPositions(userId: string, userSecret: string, accountId: string) {
  const client = await getSnaptradeClientAsync();
  const res = await client.accountInformation.getUserAccountPositions({
    userId,
    userSecret,
    accountId,
  });
  return res.data ?? [];
}

export async function listBalances(userId: string, userSecret: string, accountId: string) {
  const client = await getSnaptradeClientAsync();
  const res = await client.accountInformation.getUserAccountBalance({
    userId,
    userSecret,
    accountId,
  });
  return res.data ?? [];
}

// ─── Connection refresh ───────────────────────────────────────────────────────

/**
 * Demande à SnapTrade de re-synchroniser les données depuis le courtier.
 * Utilise l'ID de la première autorisation de courtage (brokerage authorization)
 * rattachée à l'utilisateur.
 *
 * ⚠️  SnapTrade peut facturer ce type d'appel selon ton plan — à déclencher
 *     manuellement (bouton utilisateur), jamais automatiquement à chaque chargement.
 */
export async function refreshConnection(userId: string, userSecret: string): Promise<void> {
  const client = await getSnaptradeClientAsync();

  // Récupère la liste des autorisations pour obtenir l'authorizationId
  const authRes = await client.connections.listBrokerageAuthorizations({ userId, userSecret });
  const auths = (authRes.data ?? []) as { id?: string }[];
  if (!auths.length || !auths[0].id) {
    throw new Error("Aucune autorisation courtier trouvée pour cet utilisateur SnapTrade.");
  }
  const authorizationId = auths[0].id;

  await client.connections.refreshBrokerageAuthorization({ authorizationId, userId, userSecret });
  logger.info({ authorizationId }, "snaptrade: refresh d'autorisation demandé");
}

// ─── Order cancellation ───────────────────────────────────────────────────────

/**
 * Annule un ordre ouvert chez le courtier via SnapTrade.
 * Utilise le nouvel endpoint Trading_cancelOrder (brokerage_order_id).
 * Lève une erreur si l'ordre n'est plus annulable (déjà exécuté/annulé) —
 * l'appelant doit alors re-synchroniser le statut plutôt que de forcer.
 */
export async function cancelBrokerOrder(params: {
  userId: string;
  userSecret: string;
  accountId: string;
  brokerageOrderId: string;
}) {
  const client = await getSnaptradeClientAsync();
  const res = await client.trading.cancelOrder({
    userId: params.userId,
    userSecret: params.userSecret,
    accountId: params.accountId,
    brokerage_order_id: params.brokerageOrderId,
  });
  logger.info({ brokerageOrderId: params.brokerageOrderId }, "snaptrade: annulation d'ordre demandée");
  return res.data;
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
  /** Prix de déclenchement — requis pour Stop / StopLimit */
  stopPrice?: number;
  /** Durée de validité — "Day" (défaut) ou "GTC" (stops de protection persistants) */
  timeInForce?: "Day" | "GTC";
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

  const client = await getSnaptradeClientAsync();

  const res = await client.trading.placeForceOrder({
    userId: params.userId,
    userSecret: params.userSecret,
    account_id: params.accountId,
    action: params.side, // "BUY" | "SELL"
    order_type: params.orderType ?? "Market",
    time_in_force: params.timeInForce ?? "Day",
    symbol: params.symbol,
    units: params.quantity,
    ...(params.limitPrice != null ? { price: params.limitPrice } : {}),
    ...(params.stopPrice != null ? { stop: params.stopPrice } : {}),
    ...(params.clientOrderId != null ? { client_order_id: params.clientOrderId } : {}),
  });

  return res.data;
}
