import type { BrokerAdapter, TradingAccount } from "./types";
import { CcxtAdapter } from "./adapters/ccxt-adapter";

export type AdapterFactory = (account: TradingAccount) => BrokerAdapter;

const factories = new Map<TradingAccount["provider"], AdapterFactory>();

export function registerAdapterFactory(
  provider: TradingAccount["provider"],
  factory: AdapterFactory,
): () => void {
  factories.set(provider, factory);
  return () => {
    if (factories.get(provider) === factory) factories.delete(provider);
  };
}

export function getAdapterForAccount(account: TradingAccount): BrokerAdapter {
  const factory = factories.get(account.provider);
  if (!factory) {
    throw new Error(`Fournisseur non configuré: ${account.provider}`);
  }
  return factory(account);
}

/** The crypto adapter is intentionally not wired until exchange credentials are configured. */
export function getConfiguredAdapterForAccount(account: TradingAccount): BrokerAdapter {
  if (account.provider === "ccxt") {
    const exchangeId = account.exchangeId ?? "kraken";
    const prefix = account.secretPrefix ?? exchangeId.toUpperCase();
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    const apiKey = env[`${prefix}_API_KEY`];
    const secret = env[`${prefix}_API_SECRET`];
    if (!apiKey || !secret) {
      throw new Error(`Identifiants ccxt manquants pour le préfixe ${prefix}`);
    }
    return new CcxtAdapter(account.id, { exchangeId, apiKey, secret });
  }
  return getAdapterForAccount(account);
}