/**
 * Tests d'intégration (vraie DB de développement) de l'anti-doublon de
 * l'avertissement de perte journalière :
 *   1. persistance séquentielle (simule un redémarrage) — 1 seul envoi/jour
 *   2. appels concurrents — un seul réclamant envoie
 *   3. échec d'envoi — réclamation libérée, re-tentative possible
 * L'envoi réel est remplacé par un stub injecté ; les lignes d'audit créées
 * par le test sont nettoyées à la fin.
 * Exécution : pnpm run test:daily-loss-warning
 */
import assert from "node:assert/strict";
import { maybeNotifyDailyLossWarning } from "../src/workers/autoTradeWorker.ts";
import { db, auditLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const ACTION = "daily_loss.warning";

async function cleanup() {
  await db.delete(auditLogTable).where(eq(auditLogTable.action, ACTION));
}

async function countRows() {
  return (await db.select({ id: auditLogTable.id }).from(auditLogTable).where(eq(auditLogTable.action, ACTION))).length;
}

try {
  // ── 1. Persistance séquentielle (équivalent d'un redémarrage du serveur) ──
  await cleanup();
  let sends = 0;
  const okStub = async () => { sends++; return true; };

  await maybeNotifyDailyLossWarning(200, 250, okStub);
  assert.equal(sends, 1, "premier appel → envoi");
  assert.equal(await countRows(), 1, "réclamation persistée");

  await maybeNotifyDailyLossWarning(210, 250, okStub); // « après redémarrage »
  assert.equal(sends, 1, "second appel le même jour → aucun ré-envoi (persisté en DB)");
  console.log("OK  persistance séquentielle : 1 seul envoi par jour, survit au redémarrage");

  // ── 2. Appels concurrents → un seul envoi ──
  await cleanup();
  sends = 0;
  // Stub lent pour élargir la fenêtre de course.
  const slowStub = async () => { await new Promise(r => setTimeout(r, 150)); sends++; return true; };
  await Promise.all([
    maybeNotifyDailyLossWarning(200, 250, slowStub),
    maybeNotifyDailyLossWarning(200, 250, slowStub),
    maybeNotifyDailyLossWarning(200, 250, slowStub),
  ]);
  assert.equal(sends, 1, "3 cycles concurrents → un seul envoi (verrou consultatif)");
  assert.equal(await countRows(), 1, "une seule ligne d'audit");
  console.log("OK  concurrence : 3 cycles simultanés → 1 seul envoi");

  // ── 3. Échec d'envoi → réclamation libérée, re-tentative possible ──
  await cleanup();
  sends = 0;
  const failStub = async () => false; // tous les canaux ont échoué
  await maybeNotifyDailyLossWarning(200, 250, failStub);
  assert.equal(await countRows(), 0, "échec total → réclamation supprimée (re-tentative permise)");

  await maybeNotifyDailyLossWarning(200, 250, okStub);
  assert.equal(sends, 1, "cycle suivant → nouvel essai réussi");
  assert.equal(await countRows(), 1, "réclamation re-persistée après succès");
  console.log("OK  échec d'envoi : réclamation libérée puis re-tentative réussie");

  console.log("\n3 scénarios d'intégration passés.");
} finally {
  await cleanup();
  process.exit(0);
}
