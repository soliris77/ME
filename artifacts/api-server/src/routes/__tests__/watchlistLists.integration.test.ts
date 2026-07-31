/**
 * Test d'intégration des routes de gestion des listes de la Watchlist —
 * s'exécute contre la vraie base (schéma appliqué par
 * lib/db/migrations/0003_watchlist_lists.sql). Vérifie que la gestion des
 * listes ne peut pas casser silencieusement : création (doublon refusé, nom
 * vide refusé), renommage/fusion (aucun actif perdu), réordonnancement, et
 * suppression (refusée si la liste n'est pas vide). Ignoré sans DATABASE_URL.
 *
 * Sécurité des données : chaque exécution génère un espace de noms aléatoire
 * (crypto.randomUUID) — les listes et le symbole de test sont uniques à ce
 * run, et le cleanup ne supprime que ces valeurs exactes (jamais de LIKE
 * large ni de nom fixe qui pourrait exister dans une vraie base).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import http from "node:http";
import express from "express";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

// Espace de noms unique par exécution — aucune collision possible avec des
// données réelles, et cleanup strictement limité à ces valeurs exactes.
const RUN_ID = randomUUID().slice(0, 8);
const L = (s: string) => `ITG33-${RUN_ID} ${s}`;
const TEST_SYMBOL = `ITG33${RUN_ID.toUpperCase()}.TST`;
const ALL_TEST_LISTS = [L("Tech"), L("Techno"), L("Cible"), L("A"), L("B"), L("X")];

d("watchlist lists (intégration DB)", () => {
  let server: http.Server;
  let base: string;
  let pool: typeof import("@workspace/db").pool;

  async function cleanup() {
    // Suppressions par valeurs exactes uniquement — jamais de LIKE large.
    await pool.query("DELETE FROM watchlist WHERE symbol = $1", [TEST_SYMBOL]);
    await pool.query("DELETE FROM watchlist_lists WHERE name = ANY($1::text[])", [ALL_TEST_LISTS]);
  }

  beforeAll(async () => {
    ({ pool } = await import("@workspace/db"));
    await cleanup();

    const { default: watchlistRouter } = await import("../watchlist");
    const app = express();
    app.use(express.json());
    // Stub de pino-http : les routes utilisent req.log.error(...)
    app.use((req, _res, next) => {
      (req as unknown as { log: { error: (...a: unknown[]) => void } }).log = {
        error: () => {},
      };
      next();
    });
    app.use(watchlistRouter);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await cleanup();
    await new Promise<void>((r) => server.close(() => r()));
    await pool.end().catch(() => {});
  });

  async function api(method: string, path: string, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }

  it("le schéma migré existe (table watchlist_lists, name UNIQUE)", async () => {
    const table = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'watchlist_lists'",
    );
    expect(table.rowCount).toBe(1);
    const unique = await pool.query(
      `SELECT 1 FROM information_schema.table_constraints
       WHERE table_name = 'watchlist_lists' AND constraint_type = 'UNIQUE'`,
    );
    expect(unique.rowCount).toBeGreaterThanOrEqual(1);
  });

  it("POST /watchlist/lists : 201 création, 409 doublon, 400 nom vide", async () => {
    const created = await api("POST", "/watchlist/lists", { name: L("Tech") });
    expect(created.status).toBe(201);
    expect(created.json.name).toBe(L("Tech"));

    // La liste apparaît dans GET
    const lists = await api("GET", "/watchlist/lists");
    expect(lists.status).toBe(200);
    expect(lists.json.map((l: { name: string }) => l.name)).toContain(L("Tech"));

    // Doublon exact et doublon avec espaces refusés
    expect((await api("POST", "/watchlist/lists", { name: L("Tech") })).status).toBe(409);
    expect((await api("POST", "/watchlist/lists", { name: `  ${L("Tech")}  ` })).status).toBe(409);

    // Nom vide / manquant refusés
    expect((await api("POST", "/watchlist/lists", { name: "" })).status).toBe(400);
    expect((await api("POST", "/watchlist/lists", { name: "   " })).status).toBe(400);
    expect((await api("POST", "/watchlist/lists", {})).status).toBe(400);
  });

  it("PATCH /watchlist/lists/rename : renommage simple met à jour la liste ET les actifs", async () => {
    // Un actif dans la liste à renommer
    const item = await api("POST", "/watchlist", {
      symbol: TEST_SYMBOL,
      name: "Test rename",
      listName: L("Tech"),
    });
    expect(item.status).toBe(201);

    const renamed = await api("PATCH", "/watchlist/lists/rename", {
      oldName: L("Tech"),
      newName: L("Techno"),
    });
    expect(renamed.status).toBe(200);
    expect(renamed.json.name).toBe(L("Techno"));

    // La liste persistée est renommée (pas dupliquée)
    const { rows } = await pool.query(
      "SELECT name FROM watchlist_lists WHERE name = ANY($1::text[]) ORDER BY name",
      [ALL_TEST_LISTS],
    );
    expect(rows.map((r) => r.name)).toContain(L("Techno"));
    expect(rows.map((r) => r.name)).not.toContain(L("Tech"));

    // L'actif a suivi le renommage — aucun actif perdu
    const wl = await api("GET", "/watchlist");
    const moved = wl.json.find((i: { symbol: string }) => i.symbol === TEST_SYMBOL);
    expect(moved.listName).toBe(L("Techno"));
  });

  it("PATCH /watchlist/lists/rename : fusion vers une liste existante sans perdre d'actifs", async () => {
    expect((await api("POST", "/watchlist/lists", { name: L("Cible") })).status).toBe(201);

    const merged = await api("PATCH", "/watchlist/lists/rename", {
      oldName: L("Techno"),
      newName: L("Cible"),
    });
    expect(merged.status).toBe(200);

    // L'ancienne entrée a disparu, une seule entrée cible subsiste
    const { rows } = await pool.query(
      "SELECT name FROM watchlist_lists WHERE name = ANY($1::text[])",
      [ALL_TEST_LISTS],
    );
    expect(rows.map((r) => r.name)).not.toContain(L("Techno"));
    expect(rows.filter((r) => r.name === L("Cible"))).toHaveLength(1);

    // L'actif a été déplacé dans la liste fusionnée
    const wl = await api("GET", "/watchlist");
    const moved = wl.json.find((i: { symbol: string }) => i.symbol === TEST_SYMBOL);
    expect(moved.listName).toBe(L("Cible"));
  });

  it("PATCH /watchlist/lists/rename : 400 si oldName ou newName manquant", async () => {
    expect((await api("PATCH", "/watchlist/lists/rename", { oldName: L("Cible") })).status).toBe(400);
    expect((await api("PATCH", "/watchlist/lists/rename", { newName: L("X") })).status).toBe(400);
    expect((await api("PATCH", "/watchlist/lists/rename", { oldName: " ", newName: L("X") })).status).toBe(400);
  });

  it("PUT /watchlist/lists/order : persiste l'ordre, 400 si payload invalide", async () => {
    expect((await api("POST", "/watchlist/lists", { name: L("A") })).status).toBe(201);
    expect((await api("POST", "/watchlist/lists", { name: L("B") })).status).toBe(201);

    // Réordonner uniquement nos listes de test (les positions envoyées font foi)
    const order = await api("PUT", "/watchlist/lists/order", {
      names: [L("B"), L("A"), L("Cible")],
    });
    expect(order.status).toBe(200);

    const { rows } = await pool.query(
      "SELECT name, position FROM watchlist_lists WHERE name = ANY($1::text[]) ORDER BY position",
      [ALL_TEST_LISTS],
    );
    expect(rows.map((r) => r.name)).toEqual([L("B"), L("A"), L("Cible")]);

    // Payloads invalides
    expect((await api("PUT", "/watchlist/lists/order", { names: "nope" })).status).toBe(400);
    expect((await api("PUT", "/watchlist/lists/order", { names: [L("A"), ""] })).status).toBe(400);
    expect((await api("PUT", "/watchlist/lists/order", { names: [L("A"), 42] })).status).toBe(400);
  });

  it("DELETE /watchlist/lists/:name : 409 si non vide, 204 une fois vidée", async () => {
    // L("Cible") contient encore TEST_SYMBOL → suppression refusée
    const blocked = await api("DELETE", `/watchlist/lists/${encodeURIComponent(L("Cible"))}`);
    expect(blocked.status).toBe(409);

    // La liste existe toujours
    let { rows } = await pool.query("SELECT 1 FROM watchlist_lists WHERE name = $1", [L("Cible")]);
    expect(rows).toHaveLength(1);

    // On vide la liste puis on supprime
    const wl = await api("GET", "/watchlist");
    const item = wl.json.find((i: { symbol: string }) => i.symbol === TEST_SYMBOL);
    expect((await api("DELETE", `/watchlist/${item.id}`)).status).toBe(204);

    const deleted = await api("DELETE", `/watchlist/lists/${encodeURIComponent(L("Cible"))}`);
    expect(deleted.status).toBe(204);
    ({ rows } = await pool.query("SELECT 1 FROM watchlist_lists WHERE name = $1", [L("Cible")]));
    expect(rows).toHaveLength(0);

    // Nom vide → 400 (espace encodé)
    expect((await api("DELETE", "/watchlist/lists/%20")).status).toBe(400);
  });
});
