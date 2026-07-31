/**
 * Tests des avertissements de fermeture contextuels du modal d'ordre :
 * computeClosureWarnings + route GET /api/market/closure-warnings/:symbol.
 *
 * Dates de référence (calendrier 2026) :
 *   - jeu 24 déc 2026 : demi-journée (13h00 ET) TSX + NASDAQ/NYSE
 *   - ven 25 déc 2026 : férié complet, les deux bourses
 *   - jeu 26 nov 2026 : Thanksgiving US — férié NASDAQ/NYSE seulement
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

vi.mock("../../lib/yahoo", () => ({
  yahooFinance: { search: vi.fn(), quote: vi.fn() },
  getQuotes: vi.fn(async () => []),
}));

/** Instant "10h00 ET" (15h00 UTC en hiver) d'une date donnée. */
const etMorning = (isoDate: string) => new Date(`${isoDate}T15:00:00Z`);

describe("computeClosureWarnings", () => {
  let computeClosureWarnings: typeof import("../market").computeClosureWarnings;

  beforeAll(async () => {
    ({ computeClosureWarnings } = await import("../market"));
  });

  it("24 décembre au matin : demi-journée aujourd'hui + férié le lendemain", () => {
    const warnings = computeClosureWarnings("AAPL", etMorning("2026-12-24"));
    expect(warnings).toHaveLength(2);

    const early = warnings.find((w) => w.kind === "early_close_today");
    expect(early).toMatchObject({
      exchange: "NASDAQ_NYSE",
      exchangeLabel: "NASDAQ/NYSE",
      date: "2026-12-24",
      closesAt: "13:00",
    });

    const holiday = warnings.find((w) => w.kind === "holiday_next_business_day");
    expect(holiday).toMatchObject({ exchange: "NASDAQ_NYSE", date: "2026-12-25" });
    expect(holiday?.closesAt).toBeUndefined();
  });

  it("libellé TSX pour un symbole canadien", () => {
    const warnings = computeClosureWarnings("SHOP.TO", etMorning("2026-12-24"));
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) {
      expect(w.exchange).toBe("TSX");
      expect(w.exchangeLabel).toBe("TSX (Toronto)");
    }
  });

  it("après 13h00 ET, l'avertissement de demi-journée disparaît (le férié reste)", () => {
    // 24 déc 2026, 14h00 ET = 19h00 UTC
    const warnings = computeClosureWarnings("AAPL", new Date("2026-12-24T19:00:00Z"));
    expect(warnings.map((w) => w.kind)).toEqual(["holiday_next_business_day"]);
  });

  it("saute le week-end : vendredi → lundi férié détecté", () => {
    // Ven 4 sept 2026 ; lundi 7 sept = fête du Travail (les deux bourses)
    const warnings = computeClosureWarnings("AAPL", etMorning("2026-09-04"));
    const holiday = warnings.find((w) => w.kind === "holiday_next_business_day");
    expect(holiday).toMatchObject({ date: "2026-09-07" });
  });

  it("férié propre à une bourse : Thanksgiving US n'avertit pas pour un titre TSX", () => {
    // Mer 25 nov 2026 ; jeu 26 nov = Thanksgiving US (NASDAQ/NYSE seulement)
    const us = computeClosureWarnings("AAPL", etMorning("2026-11-25"));
    expect(us.find((w) => w.kind === "holiday_next_business_day")).toMatchObject({
      date: "2026-11-26",
      exchange: "NASDAQ_NYSE",
    });

    const ca = computeClosureWarnings("SHOP.TO", etMorning("2026-11-25"));
    expect(ca).toHaveLength(0);
  });

  it("jour ordinaire : aucun avertissement", () => {
    // Mer 12 août 2026 — 16h00 UTC = 12h00 ET (été)
    const warnings = computeClosureWarnings("AAPL", new Date("2026-08-12T16:00:00Z"));
    expect(warnings).toHaveLength(0);
  });

  it("symbole non supporté (crypto / indice / forex) : aucun avertissement", () => {
    for (const sym of ["BTC-USD", "^GSPC", "EURUSD=X"]) {
      expect(computeClosureWarnings(sym, etMorning("2026-12-24"))).toHaveLength(0);
    }
  });
});

describe("GET /api/market/closure-warnings/:symbol", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const { default: router } = await import("../market");
    const app = express();
    app.use((req, _res, next) => {
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

  it("renvoie la forme attendue { symbol, warnings: [] }", async () => {
    const res = await fetch(`${base}/api/market/closure-warnings/AAPL`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { symbol: string; warnings: unknown[] };
    expect(body.symbol).toBe("AAPL");
    expect(Array.isArray(body.warnings)).toBe(true);
  });

  it("liste vide pour un symbole non supporté", async () => {
    const res = await fetch(`${base}/api/market/closure-warnings/${encodeURIComponent("BTC-USD")}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { warnings: unknown[] };
    expect(body.warnings).toEqual([]);
  });
});
