/** Canonical server-side identity; never accept provider/account from HTTP. */
export type BrokerProvider = "snaptrade" | "ccxt";
export function normalizeAccountIdentity(provider: BrokerProvider, accountId: string): string {
  return provider === "ccxt" ? `ccxt:${accountId.replace(/^ccxt:/, "")}` : accountId.replace(/^snaptrade:/, "");
}