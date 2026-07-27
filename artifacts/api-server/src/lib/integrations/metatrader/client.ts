/**
 * Wrapper REST pour MetaApi.cloud — provisioning et données de trading.
 *
 * Utilise l'API REST MetaApi directement (sans SDK) pour rester cohérent avec
 * le pattern du projet (emailClient.ts, freeNews.ts, etc.).
 *
 * Endpoints utilisés :
 *   Provisioning : https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/v1
 *   Trading data : https://mt-client-api-v1.{region}.agiliumtrade.ai/v1
 *   CopyFactory  : https://copyfactory-api-v1.agiliumtrade.agiliumtrade.ai/v1
 *
 * Authentification : header "auth-token: <METAAPI_TOKEN>"
 *
 * ⚠️  Si METAAPI_TOKEN n'est pas défini, toutes les fonctions lèvent une erreur
 *     explicite — jamais de fallback silencieux sur une donnée sensible.
 */
import { logger } from "../../logger";
import type {
  MetaApiAccount,
  MetaApiPosition,
  CopyFactoryStrategy,
} from "./types";

const PROVISIONING_BASE = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/v1";
const COPYFACTORY_BASE = "https://copyfactory-api-v1.agiliumtrade.agiliumtrade.ai/v1";
// La région "london" est le default européen ; configurable via META_API_REGION
const TRADING_REGION = process.env.META_API_REGION ?? "london";
const TRADING_BASE = `https://mt-client-api-v1.${TRADING_REGION}.agiliumtrade.agiliumtrade.ai/v1`;

const REQUEST_TIMEOUT_MS = 15_000;

function getToken(): string {
  const token = process.env.METAAPI_TOKEN;
  if (!token) {
    throw new Error(
      "METAAPI_TOKEN n'est pas configuré. " +
      "Crée un compte sur https://app.metaapi.cloud et ajoute le token comme secret Replit.",
    );
  }
  return token;
}

async function metaApiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const resp = await fetch(url, {
    ...options,
    headers: {
      "auth-token": token,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`MetaApi ${resp.status}: ${body}`);
  }

  // Certains endpoints retournent 204 No Content
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

// ─── Provisioning — gestion du compte MT ──────────────────────────────────────

/**
 * Enregistre un compte MT4/MT5 auprès de MetaApi (provisioning cloud).
 * Retourne l'accountId MetaApi assigné.
 */
export async function provisionMtAccount(params: {
  login: string;
  investorPassword: string;
  server: string;
  platform: "mt4" | "mt5";
  accountName?: string;
}): Promise<MetaApiAccount> {
  logger.info({ login: params.login, server: params.server }, "metaapi: provisioning account");
  return metaApiFetch<MetaApiAccount>(`${PROVISIONING_BASE}/users/current/accounts`, {
    method: "POST",
    body: JSON.stringify({
      login: params.login,
      password: params.investorPassword,
      name: params.accountName ?? `Soliris-${params.login}`,
      server: params.server,
      platform: params.platform,
      type: "cloud-g2",
      // Mode investisseur = lecture seule
      magic: 0,
    }),
  });
}

/**
 * Récupère les informations d'un compte MetaApi.
 */
export async function getMtAccount(metaApiAccountId: string): Promise<MetaApiAccount> {
  return metaApiFetch<MetaApiAccount>(
    `${PROVISIONING_BASE}/users/current/accounts/${metaApiAccountId}`,
  );
}

/**
 * Supprime un compte MetaApi (révocation côté MetaApi).
 */
export async function deleteMtAccount(metaApiAccountId: string): Promise<void> {
  logger.info({ metaApiAccountId }, "metaapi: deleting account");
  await metaApiFetch<void>(
    `${PROVISIONING_BASE}/users/current/accounts/${metaApiAccountId}`,
    { method: "DELETE" },
  );
}

// ─── Trading data — positions ouvertes ────────────────────────────────────────

/**
 * Récupère les positions ouvertes du compte MT via l'API REST trading.
 */
export async function getOpenPositions(metaApiAccountId: string): Promise<MetaApiPosition[]> {
  return metaApiFetch<MetaApiPosition[]>(
    `${TRADING_BASE}/users/current/accounts/${metaApiAccountId}/positions`,
  );
}

// ─── CopyFactory — recherche de traders / stratégies ─────────────────────────

/**
 * Recherche des stratégies CopyFactory publiques.
 * Filtre côté client si un terme de recherche est fourni.
 */
export async function searchStrategies(query?: string): Promise<CopyFactoryStrategy[]> {
  const strategies = await metaApiFetch<CopyFactoryStrategy[]>(
    `${COPYFACTORY_BASE}/users/current/configuration/strategies`,
  );
  if (!query) return strategies;
  const q = query.toLowerCase();
  return strategies.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      (s.description ?? "").toLowerCase().includes(q),
  );
}

/**
 * Configure l'abonnement CopyFactory d'un compte subscriber à une stratégie.
 * Utilisé uniquement en mode autoExecute=true.
 */
export async function subscribeToCopyFactoryStrategy(
  subscriberAccountId: string,
  strategyId: string,
  multiplier = 1,
): Promise<void> {
  logger.info({ subscriberAccountId, strategyId }, "metaapi: subscribing to CopyFactory strategy");

  // Récupérer les abonnements actuels
  type SubscriberPayload = { subscriptions: { strategyId: string; multiplier: number }[] };
  let current: SubscriberPayload;
  try {
    current = await metaApiFetch<SubscriberPayload>(
      `${COPYFACTORY_BASE}/users/current/configuration/subscribers/${subscriberAccountId}`,
    );
  } catch {
    current = { subscriptions: [] };
  }

  // Ajouter la stratégie si pas déjà présente
  const already = current.subscriptions.some((s) => s.strategyId === strategyId);
  if (already) return;

  await metaApiFetch<void>(
    `${COPYFACTORY_BASE}/users/current/configuration/subscribers/${subscriberAccountId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        subscriptions: [
          ...current.subscriptions,
          { strategyId, multiplier },
        ],
      }),
    },
  );
}

/**
 * Supprime l'abonnement CopyFactory à une stratégie.
 */
export async function unsubscribeFromCopyFactoryStrategy(
  subscriberAccountId: string,
  strategyId: string,
): Promise<void> {
  logger.info({ subscriberAccountId, strategyId }, "metaapi: unsubscribing from CopyFactory strategy");

  type SubscriberPayload = { subscriptions: { strategyId: string; multiplier: number }[] };
  let current: SubscriberPayload;
  try {
    current = await metaApiFetch<SubscriberPayload>(
      `${COPYFACTORY_BASE}/users/current/configuration/subscribers/${subscriberAccountId}`,
    );
  } catch {
    return; // déjà absent
  }

  const remaining = current.subscriptions.filter((s) => s.strategyId !== strategyId);
  await metaApiFetch<void>(
    `${COPYFACTORY_BASE}/users/current/configuration/subscribers/${subscriberAccountId}`,
    {
      method: "PUT",
      body: JSON.stringify({ subscriptions: remaining }),
    },
  );
}
