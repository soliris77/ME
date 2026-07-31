/**
 * Test d'intégration — gestion des listes de la Watchlist (barre d'onglets).
 * S'exécute contre la vraie base (schéma appliqué par
 * lib/db/migrations/0003_watchlist_lists.sql via scripts/apply-migrations.mjs).
 * Couvre le scénario « watchlist vierge » : création de la première liste vide
 * depuis la barre d'onglets, persistance après rechargement, doublon refusé,
 * suppression d'une liste vide. Ignoré si DATABASE_URL n'est pas défini.
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import express from "express";
import type { Server } from "node:http";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

const TEST_LIST = "__test_liste_vide__";

d("watchlist lists (intégration DB)", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const { default: router } = await import("../watchlist");
    const app = express();
    app.use(express.json());
    // Stub du logger pino attaché par le middleware de l'app réelle.
    app.use((req, _res, next) => {
      (req as unknown as { log: { error: () => void } }).log = { error: () => {} };
      next();
    });
    app.use("/api", router);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/api`;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { pool } = await import("@workspace/db");
    await pool.query("DELETE FROM watchlist_lists WHERE name = $1", [TEST_LIST]).catch(() => {});
    await pool.end().catch(() => {});
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it("le schéma migré existe (table watchlist_lists)", async () => {
    const { pool } = await import("@workspace/db");
    const table = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'watchlist_lists'",
    );
    expect(table.rowCount).toBe(1);
  });

  it("crée une première liste vide et la retrouve après rechargement", async () => {
    const created = await fetch(`${base}/watchlist/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: TEST_LIST }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { name: string; position: number };
    expect(body.name).toBe(TEST_LIST);

    // « Rechargement » : un nouveau GET doit contenir la liste vide persistée.
    const reloaded = await fetch(`${base}/watchlist/lists`);
    expect(reloaded.status).toBe(200);
    const lists = (await reloaded.json()) as { name: string }[];
    expect(lists.map((l) => l.name)).toContain(TEST_LIST);
  });

  it("refuse un doublon (409) et un nom vide (400)", async () => {
    const dup = await fetch(`${base}/watchlist/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: ` ${TEST_LIST} ` }),
    });
    expect(dup.status).toBe(409);

    const empty = await fetch(`${base}/watchlist/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    expect(empty.status).toBe(400);
  });

  it("supprime une liste vide (204) et elle disparaît", async () => {
    const del = await fetch(`${base}/watchlist/lists/${encodeURIComponent(TEST_LIST)}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);
    const after = await fetch(`${base}/watchlist/lists`);
    const lists = (await after.json()) as { name: string }[];
    expect(lists.map((l) => l.name)).not.toContain(TEST_LIST);
  });
});
