import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  db: { select: () => ({ from: () => ({ then: (resolve: (v: unknown) => unknown) => Promise.resolve(h.rows).then(resolve) }) }) },
}));
vi.mock("@workspace/db", () => ({ db: h.db, brokerConnectionsTable: {} }));

import { resolveAuthoritativeConnection } from "../connectionResolver";

describe("authoritative account resolution", () => {
  it("resolves an unprefixed kraken account through persisted CCXT membership", async () => {
    h.rows = [{ id: 1, provider: "ccxt", status: "connected", accounts: [{ id: "kraken" }] }];
    await expect(resolveAuthoritativeConnection("kraken")).resolves.toMatchObject({ id: 1 });
  });

  it("rejects an ambiguous raw account shared by providers", async () => {
    h.rows = [
      { id: 1, provider: "ccxt", status: "connected", accounts: [{ id: "kraken" }] },
      { id: 2, provider: "snaptrade", status: "connected", accounts: [{ id: "kraken" }] },
    ];
    await expect(resolveAuthoritativeConnection("kraken")).rejects.toThrow(/ambigu/i);
  });
});