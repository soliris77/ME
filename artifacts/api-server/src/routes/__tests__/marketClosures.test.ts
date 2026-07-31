/**
 * Tests de la route GET /api/market/closures — prochaines fermetures de bourse
 * (jours fériés complets + demi-journées à fermeture anticipée 13h00 ET).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

vi.mock("../../lib/yahoo", () => ({
  yahooFinance: { search: vi.fn(), quote: vi.fn() },
  getQuotes: vi.fn(async () => []),
}));

interface Closure {
  date: string;
  kind: "holiday" | "early_close";
  exchanges: string[];
  closesAt?: string;
}

describe("GET /api/market/closures", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const { default: router } = await import("../market");
    const app = express();
    app.use((req, _res, next) => {
      // Stub du logger pino attaché par le middleware de prod
      (req as unknown as { log: { error: () => void; warn: () => void } }).log = {
        error: () => {},
        warn: () => {},
      };
      next();
    });
    app.use("/api", router);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const addr = server.address();
    if (addr === null || typeof addr === "string") throw new Error("no port");
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(() => {
    server?.close();
  });

  it("renvoie des fermetures triées, futures, avec métadonnées", async () => {
    const res = await fetch(`${base}/api/market/closures`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { asOf: string; timezone: string; closures: Closure[] };

    expect(body.timezone).toBe("America/New_York");
    expect(body.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.closures.length).toBeGreaterThan(0);
    expect(body.closures.length).toBeLessThanOrEqual(12);

    const dates = body.closures.map((c) => c.date);
    expect([...dates].sort()).toEqual(dates); // triées croissant
    for (const c of body.closures) {
      expect(c.date >= body.asOf).toBe(true); // aucune date passée
      expect(["holiday", "early_close"]).toContain(c.kind);
      expect(c.exchanges.length).toBeGreaterThan(0);
      for (const ex of c.exchanges) expect(["TSX", "NASDAQ_NYSE"]).toContain(ex);
      if (c.kind === "early_close") {
        expect(c.closesAt).toBe("13:00");
      } else {
        expect(c.closesAt).toBeUndefined();
      }
    }
  });

  it("respecte le paramètre limit et le plafonne à 50", async () => {
    const res = await fetch(`${base}/api/market/closures?limit=3`);
    const body = (await res.json()) as { closures: Closure[] };
    expect(body.closures.length).toBeLessThanOrEqual(3);

    const resBig = await fetch(`${base}/api/market/closures?limit=999`);
    const bodyBig = (await resBig.json()) as { closures: Closure[] };
    expect(bodyBig.closures.length).toBeLessThanOrEqual(50);
  });

  it("inclut au moins une demi-journée (24 décembre, commun aux deux bourses)", async () => {
    const res = await fetch(`${base}/api/market/closures?limit=50`);
    const body = (await res.json()) as { closures: Closure[] };
    const early = body.closures.filter((c) => c.kind === "early_close");
    expect(early.length).toBeGreaterThan(0);
    const dec24 = early.find((c) => c.date.endsWith("-12-24"));
    expect(dec24).toBeDefined();
    expect(dec24!.exchanges).toContain("TSX");
    expect(dec24!.exchanges).toContain("NASDAQ_NYSE");
  });
});
