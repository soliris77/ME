/**
 * Envoie un signal signé au webhook, pour vérifier le lot 8 de bout en bout
 * sans dépendre d'une plateforme tierce.
 *
 *   pnpm signals:smoke
 *
 * Variables lues (toutes optionnelles sauf le secret) :
 *   SIGNAL_SOURCE_ID    identifiant de la source          (défaut: test-local)
 *   SIGNAL_SECRET_ENV   nom de la variable du secret      (défaut: SIGNAL_SECRET_TEST_LOCAL)
 *   SIGNAL_BASE_URL     racine du serveur                 (défaut: http://localhost:8080)
 *   SIGNAL_SYMBOL       paire                             (défaut: BTC-USD)
 *   SIGNAL_ACTION       action                            (défaut: buy)
 *   SIGNAL_SKEW_SECONDS décalage d'horodatage, pour tester le rejet d'un rejeu
 *
 * Le secret n'est jamais affiché, et le script ne le lit que depuis
 * l'environnement — jamais depuis un argument de ligne de commande, qui
 * resterait dans l'historique du shell.
 */
import { randomUUID } from "node:crypto";
import { computeSignature } from "@workspace/signals";

const sourceId = process.env.SIGNAL_SOURCE_ID ?? "test-local";
const secretEnv = process.env.SIGNAL_SECRET_ENV ?? "SIGNAL_SECRET_TEST_LOCAL";
const baseUrl = (process.env.SIGNAL_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const symbol = process.env.SIGNAL_SYMBOL ?? "BTC-USD";
const action = process.env.SIGNAL_ACTION ?? "buy";
const skew = Number(process.env.SIGNAL_SKEW_SECONDS ?? 0);

async function main(): Promise<void> {
  const secret = process.env[secretEnv];
  if (!secret) {
    console.error(`Secret absent : définissez ${secretEnv} dans l'environnement.`);
    process.exit(1);
  }

  const timestamp = String(Math.floor(Date.now() / 1000) + (Number.isFinite(skew) ? skew : 0));
  const body = JSON.stringify({
    id: randomUUID(),
    symbol,
    action,
    emitted_at: timestamp,
  });

  // Exactement les octets envoyés : re-sérialiser ici casserait la signature,
  // comme cela la casserait côté serveur.
  const signature = computeSignature(secret, timestamp, body);
  const url = `${baseUrl}/webhooks/signals/${encodeURIComponent(sourceId)}`;

  console.log(`POST ${url}`);
  console.log(`  symbole ${symbol}, action ${action}, horodatage ${timestamp}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-soliris-signature": `sha256=${signature}`,
      "x-soliris-timestamp": timestamp,
    },
    body,
  });

  const text = await response.text();
  console.log(`  -> ${response.status} ${text}`);

  if (response.status === 202) {
    console.log("Signal accepté. Le worker calculera la confluence au prochain cycle,");
    console.log("puis mesurera le résultat à 1 h, 4 h et 24 h.");
  }
  process.exit(response.ok ? 0 : 1);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
