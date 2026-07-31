#!/usr/bin/env node
/**
 * Applique les migrations SQL versionnées (lib/db/migrations/*.sql) dans
 * l'ordre lexicographique, sans aucune interaction. Chaque migration déjà
 * appliquée (table schema_migrations) est ignorée ; chaque nouvelle migration
 * est exécutée dans une transaction.
 *
 * Contrairement à `drizzle-kit push` (qui exige un TTY pour ses prompts et
 * échoue silencieusement au démarrage), ce script FAIT ÉCHOUER le démarrage
 * (exit 1) si une migration ne peut pas être appliquée — jamais de schéma
 * manquant masqué.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const DB_PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../lib/db");
const MIGRATIONS_DIR = path.join(DB_PKG_DIR, "migrations");

// `pg` est une dépendance de @workspace/db — on le résout depuis ce paquet
// pour ne pas dupliquer la dépendance ici.
const pg = createRequire(path.join(DB_PKG_DIR, "package.json"))("pg");

if (!process.env.DATABASE_URL) {
  console.error("[migrations] DATABASE_URL manquant — impossible d'appliquer les migrations.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamp DEFAULT now() NOT NULL
      )
    `);

    const { rows } = await client.query("SELECT name FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`[migrations] appliquée : ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Échec de la migration ${file} : ${err.message}`);
      }
    }
    console.log(`[migrations] à jour (${files.length} migration(s) au total).`);
  } finally {
    client.release();
  }
} catch (err) {
  console.error(`[migrations] ERREUR : ${err.message}`);
  process.exit(1);
} finally {
  await pool.end();
}
