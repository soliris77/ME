import { describe, expect, it, beforeEach } from "vitest";
import { FakeAdapter } from "./fake-adapter";
import { getAdapterForAccount, registerAdapterFactory } from "./factory";

describe("adapter factory bootstrap contract", () => {
  beforeEach(() => {
    registerAdapterFactory("snaptrade", (account) => new FakeAdapter(account.id, "equity"));
    registerAdapterFactory("ccxt", (account) => new FakeAdapter(account.id, "crypto"));
  });

  it("resolves both providers after idempotent registration", () => {
    const snap = getAdapterForAccount({ id: "equity-1", provider: "snaptrade", assetClass: "equity" });
    const crypto = getAdapterForAccount({ id: "kraken", provider: "ccxt", assetClass: "crypto" });
    expect(snap.assetClass).toBe("equity");
    expect(crypto.assetClass).toBe("crypto");
  });
});