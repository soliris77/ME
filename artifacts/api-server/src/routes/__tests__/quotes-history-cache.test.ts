/**
 * Tests du cache serveur d'historique (TTL 5 min, dédoublonnage en vol).
 * Le module yahoo est mocké : on compte les appels à chart() par symbole+range.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

const { chartCalls, failingSymbols } = vi.hoisted(() => ({
  chartCalls: [] as string[],
  failingSymbols: new Set<string>(),
}));

vi.mock("../../lib/yahoo", () => ({
  yahooFinance: {
    chart: async (symbol: string) => {
      chartCalls.push(symbol);
      if (failingSymbols.has(symbol)) {
        await new Promise((r) => setTimeout(r, 20));
        throw new Error("Yahoo down");
      }
      // Petite latence pour que des requêtes concurrentes se chevauchent
      await new Promise((r) => setTimeout(r, 50));
      return {
        quotes: [
          { date: new Date("2026-07-30T14:00:00Z"), open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
        ],
      };
    },
    quote: async () => null,
  },
  formatQuote: (q: unknown) => q,
  getQuotes: async () => [],
}));

import quotesRouter from "../quotes";

async function makeServer() {
  const app = express();
  // Stub minimal de req.log (fourni normalement par pino-http)
  app.use((req, _res, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).log = { info: () => {}, error: () => {} };
    next();
  });
  app.use("/api", quotesRouter);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = (server.address() as AddressInfo).port;
  return { server, base: `http://127.0.0.1:${port}` };
}

describe("cache d'historique /quotes/:symbol/history/:range", () => {
  beforeEach(() => {
    chartCalls.length = 0;
    vi.resetModules();
  });

  it("des requêtes concurrentes pour la même clé ne font qu'un seul appel Yahoo", async () => {
    const { server, base } = await makeServer();
    try {
      const url = `${base}/api/quotes/AAPL/history/1mo`;
      const [r1, r2, r3] = await Promise.all([fetch(url), fetch(url), fetch(url)]);
      expect(r1.status).toBe(200);
      const [b1, b2, b3] = await Promise.all([r1.json(), r2.json(), r3.json()]);
      expect(b1).toEqual(b2);
      expect(b2).toEqual(b3);
      expect(b1).toHaveLength(1);
      expect(chartCalls.filter((s) => s === "AAPL")).toHaveLength(1);
    } finally {
      server.close();
    }
  });

  it("une requête suivante dans la fenêtre TTL est servie depuis le cache", async () => {
    const { server, base } = await makeServer();
    try {
      const url = `${base}/api/quotes/MSFT/history/1mo`;
      await fetch(url);
      const before = chartCalls.filter((s) => s === "MSFT").length;
      const r = await fetch(url);
      expect(r.status).toBe(200);
      expect(chartCalls.filter((s) => s === "MSFT").length).toBe(before);
    } finally {
      server.close();
    }
  });

  it("des clés différentes (symbole ou range) sont mises en cache séparément", async () => {
    const { server, base } = await makeServer();
    try {
      await Promise.all([
        fetch(`${base}/api/quotes/TSLA/history/1mo`),
        fetch(`${base}/api/quotes/TSLA/history/6mo`),
        fetch(`${base}/api/quotes/NVDA/history/1mo`),
      ]);
      expect(chartCalls.filter((s) => s === "TSLA")).toHaveLength(2);
      expect(chartCalls.filter((s) => s === "NVDA")).toHaveLength(1);
    } finally {
      server.close();
    }
  });

  it("accepte les trois plages intrajournalières", async () => {
    const { server, base } = await makeServer();
    try {
      for (const range of ["1h", "5m", "1m"]) {
        const response = await fetch(`${base}/api/quotes/AAPL/history/${range}`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([
          {
            date: "2026-07-30T14:00:00.000Z",
            open: 1,
            high: 2,
            low: 0.5,
            close: 1.5,
            volume: 100,
          },
        ]);
      }
    } finally {
      server.close();
    }
  });

  it("un échec Yahoo renvoie 500 à tous les clients, sans unhandledRejection, et permet un nouvel essai", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (err: unknown) => unhandled.push(err);
    process.on("unhandledRejection", onUnhandled);
    const { server, base } = await makeServer();
    try {
      failingSymbols.add("FAIL");
      const url = `${base}/api/quotes/FAIL/history/1mo`;
      const [r1, r2] = await Promise.all([fetch(url), fetch(url)]);
      expect(r1.status).toBe(500);
      expect(r2.status).toBe(500);
      // Requêtes concurrentes partagées : un seul appel Yahoo malgré l'échec
      expect(chartCalls.filter((s) => s === "FAIL")).toHaveLength(1);

      // L'échec n'est pas mis en cache ni bloqué en vol : un nouvel essai réussit
      failingSymbols.delete("FAIL");
      const r3 = await fetch(url);
      expect(r3.status).toBe(200);
      expect(chartCalls.filter((s) => s === "FAIL")).toHaveLength(2);

      // Laisser la boucle d'événements traiter d'éventuels rejets orphelins
      await new Promise((r) => setTimeout(r, 50));
      expect(unhandled).toHaveLength(0);
    } finally {
      failingSymbols.delete("FAIL");
      process.off("unhandledRejection", onUnhandled);
      server.close();
    }
  });

  it("un range invalide renvoie 400 sans appel Yahoo", async () => {
    const { server, base } = await makeServer();
    try {
      const r = await fetch(`${base}/api/quotes/AAPL/history/2y`);
      expect(r.status).toBe(400);
      expect(chartCalls).toHaveLength(0);
    } finally {
      server.close();
    }
  });
});
