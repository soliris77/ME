/**
 * Test d'intégration Web Push — s'exécute contre la vraie base (schéma
 * appliqué par lib/db/migrations/0001_web_push.sql via scripts/apply-migrations.mjs).
 * Vérifie que le schéma migré existe réellement et que le cycle complet
 * abonnement → upsert → envoi (échec toléré) → désabonnement fonctionne.
 * Ignoré si DATABASE_URL n'est pas défini.
 */
import { describe, it, expect, afterAll } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

const TEST_ENDPOINT = "https://push.example.test/webpush-integration-test";

d("webPush (intégration DB)", () => {
  afterAll(async () => {
    if (!hasDb) return;
    const { removeSubscription } = await import("../webPush");
    await removeSubscription(TEST_ENDPOINT).catch(() => {});
    const { pool } = await import("@workspace/db");
    await pool.end().catch(() => {});
  });

  it("le schéma migré existe (table push_subscriptions + colonnes VAPID)", async () => {
    const { pool } = await import("@workspace/db");
    const table = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'push_subscriptions'",
    );
    expect(table.rowCount).toBe(1);
    const cols = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'app_settings' AND column_name IN ('vapid_public_key','vapid_private_key')",
    );
    expect(cols.rowCount).toBe(2);
  });

  it("génère des clés VAPID stables et persistées", async () => {
    const { ensureVapidKeys } = await import("../webPush");
    const pub1 = await ensureVapidKeys();
    const pub2 = await ensureVapidKeys();
    expect(pub1).toBeTruthy();
    expect(pub2).toBe(pub1);
    const { pool } = await import("@workspace/db");
    const { rows } = await pool.query("SELECT vapid_public_key FROM app_settings LIMIT 1");
    expect(rows[0]?.vapid_public_key).toBe(pub1);
  });

  it("abonnement : insert, upsert par endpoint, suppression", async () => {
    const { saveSubscription, removeSubscription } = await import("../webPush");
    const { pool } = await import("@workspace/db");

    await saveSubscription({ endpoint: TEST_ENDPOINT, keys: { p256dh: "k1", auth: "a1" } }, "vitest");
    await saveSubscription({ endpoint: TEST_ENDPOINT, keys: { p256dh: "k2", auth: "a2" } }, "vitest");

    const { rows } = await pool.query(
      "SELECT p256dh, auth FROM push_subscriptions WHERE endpoint = $1",
      [TEST_ENDPOINT],
    );
    expect(rows).toHaveLength(1); // upsert — jamais de doublon
    expect(rows[0].p256dh).toBe("k2");

    await removeSubscription(TEST_ENDPOINT);
    const after = await pool.query("SELECT 1 FROM push_subscriptions WHERE endpoint = $1", [TEST_ENDPOINT]);
    expect(after.rowCount).toBe(0);
  });

  it("sendPushToAll ne jette jamais même si un envoi échoue (endpoint factice)", async () => {
    const { saveSubscription, removeSubscription, sendPushToAll } = await import("../webPush");
    await saveSubscription({ endpoint: TEST_ENDPOINT, keys: { p256dh: "bad", auth: "bad" } }, "vitest");
    await expect(
      sendPushToAll({ title: "test", body: "test", tag: "test", url: "/alerts" }),
    ).resolves.toBeUndefined();
    await removeSubscription(TEST_ENDPOINT);
  });
});
