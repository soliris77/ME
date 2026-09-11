import { db, brokerConnectionsTable } from "@workspace/db";
import { normalizeAccountIdentity } from "./accountIdentity";

export async function resolveAuthoritativeConnection(accountId?: string, provider?: "snaptrade" | "ccxt") {
  const rows = await db.select().from(brokerConnectionsTable);
  const candidates = rows.filter((row) => !provider || row.provider === provider);
  if (!accountId) {
    const active = candidates.filter((row) => row.status === "connected" || row.status === "pending");
    if (active.length !== 1) throw new Error("Connexion courtier ambiguë ou absente");
    return active[0];
  }
  const requestedProvider = provider ?? (accountId.startsWith("ccxt:") ? "ccxt" : accountId.startsWith("snaptrade:") ? "snaptrade" : undefined);
  const rawId = accountId.replace(/^(ccxt|snaptrade):/, "");
  const identity = requestedProvider ? normalizeAccountIdentity(requestedProvider, rawId) : null;
  const found = candidates.filter((row) => {
    if (!identity) {
      return Array.isArray(row.accounts) && row.accounts.some((a) => {
        const account = a as Record<string, unknown>;
        const id = String(account.id ?? account.accountId ?? "");
        return id === rawId || normalizeAccountIdentity(row.provider === "ccxt" ? "ccxt" : "snaptrade", id) === rawId;
      });
    }
    if (row.provider === "ccxt") {
      // CCXT accounts are authoritative only when persisted by setup/refresh.
      // An exchange name alone is not an account membership.
      return Array.isArray(row.accounts) && row.accounts.some((a) => {
        const account = a as Record<string, unknown>;
        return normalizeAccountIdentity("ccxt", String(account.id ?? account.accountId ?? "")) === identity;
      });
    }
    return Array.isArray(row.accounts) && row.accounts.some((account) =>
      normalizeAccountIdentity("snaptrade", String((account as Record<string, unknown>)?.id ?? "")) === identity);
  });
  if (found.length !== 1) throw new Error(found.length ? "Compte courtier ambigu" : "Aucune connexion courtier autoritative pour ce compte");
  return found[0];
}