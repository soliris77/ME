import app from "./app";
import { logger } from "./lib/logger";
import { startAlertWorker } from "./workers/alertWorker";
import { db, brokerConnectionsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { persistConsumerKeyIfNeeded, resolveCredentials } from "./lib/snaptrade";
import { persistExternalCredsIfNeeded } from "./lib/persistCreds";

const port = Number(process.env["PORT"] ?? "8080");

/**
 * Vérifie au démarrage si les clés développeur SnapTrade sont présentes (DB ou env).
 * Ne tente jamais l'auto-setup — l'utilisateur clique "Initialiser" dans l'UI.
 * Sert uniquement à loguer l'état pour le diagnostic.
 */
async function checkBrokerCredentialsAtStartup() {
  try {
    const creds = await resolveCredentials();
    const hasDevCreds = !!(creds.clientId && creds.consumerKey);
    logger.info(
      { hasClientId: !!creds.clientId, hasConsumerKey: !!creds.consumerKey },
      hasDevCreds
        ? "broker: clés développeur SnapTrade présentes (DB ou env) — prêt"
        : "broker: clés développeur SnapTrade absentes — à configurer via /courtier"
    );

    if (hasDevCreds) {
      const rows = await db
        .select()
        .from(brokerConnectionsTable)
        .orderBy(desc(brokerConnectionsTable.id))
        .limit(1);
      if (rows.length > 0) {
        logger.info({ status: rows[0].status }, "broker: connexion existante trouvée en base");
      } else {
        logger.info("broker: aucune connexion courtier — l'utilisateur doit cliquer Initialiser dans /courtier");
      }
    }
  } catch (err) {
    logger.warn({ err }, "broker: erreur lors de la vérification des credentials au démarrage");
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const alertIntervalMs = Number(process.env.ALERT_CHECK_INTERVAL_MS ?? "90000");
  startAlertWorker(Number.isFinite(alertIntervalMs) && alertIntervalMs > 0 ? alertIntervalMs : undefined);

  // Persiste les credentials depuis env vars → DB si absents en base (premier démarrage)
  persistConsumerKeyIfNeeded().catch((err) =>
    logger.warn({ err }, "snaptrade: persistConsumerKeyIfNeeded a échoué au démarrage")
  );

  persistExternalCredsIfNeeded().catch((err) =>
    logger.warn({ err }, "persistExternalCredsIfNeeded a échoué au démarrage")
  );

  checkBrokerCredentialsAtStartup().catch((err) =>
    logger.error({ err }, "broker: erreur dans checkBrokerCredentialsAtStartup")
  );
});
