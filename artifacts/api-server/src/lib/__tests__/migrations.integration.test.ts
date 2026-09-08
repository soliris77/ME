/**
 * Test d'intégration du runner de migrations (scripts/apply-migrations.mjs) —
 * vérifie qu'il ne peut pas bloquer le démarrage de l'API sur des données
 * réelles. Deux scénarios, chacun sur une base scratch dédiée (créée puis
 * supprimée par le test — jamais la base principale) :
 *
 * 1. Base VIERGE (nouveau remix) : la baseline 0000 crée tout le schéma et
 *    les contraintes uniques nommées selon la convention drizzle.
 * 2. Base EXISTANTE « driftée » : schéma historique SANS contraintes uniques
 *    et AVEC doublons (learn_progress, watchlist_lists, investment_theses,
 *    spotify_connections) — les migrations doivent dédoublonner selon la
 *    politique documentée puis poser les contraintes, sans jamais échouer.
 *
 * Ignoré sans DATABASE_URL.
 */
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";

type Pool = typeof import("@workspace/db").pool;

// `pg` est une dépendance de @workspace/db (pas de l'API) — on le résout
// depuis ce paquet, comme le fait scripts/apply-migrations.mjs.
const DB_PKG_DIR = path.resolve(__dirname, "../../../../../lib/db");
const pg = createRequire(path.join(DB_PKG_DIR, "package.json"))("pg") as {
  Pool: new (options: { connectionString?: string }) => Pool;
};
const { Pool } = pg;

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

const RUNNER = path.resolve(__dirname, "../../../scripts/apply-migrations.mjs");
const RUN_ID = randomUUID().slice(0, 8).replace(/-/g, "");
const FRESH_DB = `mig_test_fresh_${RUN_ID}`;
const DRIFT_DB = `mig_test_drift_${RUN_ID}`;

function scratchUrl(dbName: string): string {
  const u = new URL(process.env.DATABASE_URL!);
  u.pathname = `/${dbName}`;
  return u.toString();
}

async function withAdmin<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

function runMigrations(dbName: string): string {
  return execFileSync("node", [RUNNER], {
    env: { ...process.env, DATABASE_URL: scratchUrl(dbName) },
    encoding: "utf8",
  });
}

async function uniqueConstraints(pool: Pool, table: string): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT conname FROM pg_constraint
     WHERE contype = 'u' AND conrelid = ($1)::regclass`,
    [`public.${table}`],
  );
  return rows.map((r: { conname: string }) => r.conname).sort();
}

d("apply-migrations (intégration DB scratch)", () => {
  afterAll(async () => {
    await withAdmin(async (pool) => {
      await pool.query(`DROP DATABASE IF EXISTS ${FRESH_DB}`);
      await pool.query(`DROP DATABASE IF EXISTS ${DRIFT_DB}`);
    });
  });

  it("base vierge : la baseline crée le schéma complet avec les contraintes drizzle", async () => {
    await withAdmin((pool) => pool.query(`CREATE DATABASE ${FRESH_DB}`));
    const out = runMigrations(FRESH_DB);
    expect(out).toContain("0000_baseline_fresh_db.sql");

    const pool = new Pool({ connectionString: scratchUrl(FRESH_DB) });
    try {
      const { rows } = await pool.query(
        "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'",
      );
      expect(rows[0].n).toBeGreaterThanOrEqual(20);
      expect(await uniqueConstraints(pool, "learn_progress")).toContain(
        "learn_progress_section_id_unique",
      );
      expect(await uniqueConstraints(pool, "watchlist_lists")).toContain(
        "watchlist_lists_name_unique",
      );
      expect(await uniqueConstraints(pool, "investment_theses")).toContain(
        "investment_theses_symbol_unique",
      );
      expect(await uniqueConstraints(pool, "spotify_connections")).toContain(
        "spotify_connections_spotify_user_id_unique",
      );
    } finally {
      await pool.end();
    }
  });

  it("base driftée avec doublons : dédoublonne selon la politique puis pose les contraintes sans échouer", async () => {
    await withAdmin((pool) => pool.query(`CREATE DATABASE ${DRIFT_DB}`));
    const pool = new Pool({ connectionString: scratchUrl(DRIFT_DB) });
    try {
      // Schéma « historique » minimal : tables SANS contraintes uniques,
      // + app_settings pour que la baseline 0000 se désactive (base existante).
      await pool.query(`
        CREATE TABLE app_settings (id serial PRIMARY KEY, password_hash text);
        CREATE TABLE learn_progress (
          id serial PRIMARY KEY, section_id text NOT NULL,
          completed boolean NOT NULL DEFAULT false, quiz_score integer,
          quiz_total integer, completed_at timestamp,
          updated_at timestamp NOT NULL DEFAULT now());
        CREATE TABLE watchlist_lists (
          id serial PRIMARY KEY, name text NOT NULL,
          position integer NOT NULL DEFAULT 0,
          created_at timestamp NOT NULL DEFAULT now());
        CREATE TABLE investment_theses (
          id serial PRIMARY KEY, symbol text NOT NULL, reason text NOT NULL,
          target_price numeric, invalidation_price numeric,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now());
        -- Tables historiques requises par la migration 0005 (FKs et index).
        CREATE TABLE auto_trade_rules (id serial PRIMARY KEY, symbol text NOT NULL);
        CREATE TABLE followed_traders (id serial PRIMARY KEY, name text NOT NULL);
        CREATE TABLE auto_trade_logs (id serial PRIMARY KEY, rule_id integer);
        CREATE TABLE copied_trades (
          id serial PRIMARY KEY, followed_trader_id integer NOT NULL,
          external_trade_id text NOT NULL);
        CREATE TABLE spotify_connections (
          id serial PRIMARY KEY, spotify_user_id text NOT NULL,
          encrypted_refresh_token text NOT NULL,
          is_premium boolean NOT NULL DEFAULT false,
          connected_at timestamp NOT NULL DEFAULT now());

        INSERT INTO learn_progress (section_id, completed) VALUES
          ('bases', true), ('bases', false), ('risques', true);
        INSERT INTO watchlist_lists (name, position) VALUES
          ('Tech', 0), ('Tech', 5), ('Énergie', 1);
        INSERT INTO investment_theses (symbol, reason, updated_at) VALUES
          ('SHOP.TO', 'ancienne', '2026-01-01'), ('SHOP.TO', 'récente', '2026-06-01');
        INSERT INTO spotify_connections (spotify_user_id, encrypted_refresh_token, connected_at) VALUES
          ('user1', 'vieux-token', '2026-01-01'), ('user1', 'nouveau-token', '2026-06-01');
      `);

      const out = runMigrations(DRIFT_DB);
      expect(out).toContain("0006_learn_progress_unique_constraint.sql");
      expect(out).toContain("0007_missing_unique_constraints.sql");

      // Contraintes posées, nommées selon la convention drizzle.
      expect(await uniqueConstraints(pool, "learn_progress")).toContain(
        "learn_progress_section_id_unique",
      );
      expect(await uniqueConstraints(pool, "watchlist_lists")).toContain(
        "watchlist_lists_name_unique",
      );
      expect(await uniqueConstraints(pool, "investment_theses")).toContain(
        "investment_theses_symbol_unique",
      );
      expect(await uniqueConstraints(pool, "spotify_connections")).toContain(
        "spotify_connections_spotify_user_id_unique",
      );

      // Politique de conservation : learn_progress garde la ligne la plus
      // ancienne ; watchlist_lists la plus ancienne (position d'origine) ;
      // investment_theses la plus récemment mise à jour ; spotify_connections
      // la connexion la plus récente (token le plus frais).
      const lp = await pool.query(
        "SELECT completed FROM learn_progress WHERE section_id = 'bases'",
      );
      expect(lp.rows).toEqual([{ completed: true }]);

      const wl = await pool.query(
        "SELECT position FROM watchlist_lists WHERE name = 'Tech'",
      );
      expect(wl.rows).toEqual([{ position: 0 }]);

      const th = await pool.query(
        "SELECT reason FROM investment_theses WHERE symbol = 'SHOP.TO'",
      );
      expect(th.rows).toEqual([{ reason: "récente" }]);

      const sp = await pool.query(
        "SELECT encrypted_refresh_token FROM spotify_connections WHERE spotify_user_id = 'user1'",
      );
      expect(sp.rows).toEqual([{ encrypted_refresh_token: "nouveau-token" }]);

      // Idempotence : un second passage ne change rien et n'échoue pas.
      runMigrations(DRIFT_DB);
    } finally {
      await pool.end();
    }
  });
});
