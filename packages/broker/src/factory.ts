import type { BrokerAdapter, TradingAccount } from "./types";

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
    throw new Error(`Fournisseur ccxt non configuré pour le compte ${account.id}`);
  }
  return getAdapterForAccount(account);
}