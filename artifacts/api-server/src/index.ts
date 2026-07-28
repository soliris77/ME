import app from "./app";
import { logger } from "./lib/logger";
import { startAlertWorker } from "./workers/alertWorker";
import { db, brokerConnectionsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { persistConsumerKeyIfNeeded } from "./lib/snaptrade";
import { persistExternalCredsIfNeeded } from "./lib/persistCreds";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/** Auto-initialise la connexion SnapTrade si les clés sont présentes mais qu'aucune
 *  ligne n'existe encore en base.
 *
 *  Pour les clés personnelles SnapTrade (non-partenaires) :
 *    - SNAPTRADE_CLIENT_ID + SNAPTRADE_CONSUMER_KEY  → authentification API
 *    - SNAPTRADE_USER_ID + SNAPTRADE_USER_SECRET     → credentials utilisateur personnel
 *
 *  L'utilisateur ne reste qu'à ouvrir le portail OAuth pour lier Wealthsimple.
 */
async function autoSetupBrokerIfNeeded() {
  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  const userId = process.env.SNAPTRADE_USER_ID;
  const userSecret = process.env.SNAPTRADE_USER_SECRET;

  logger.info(
    { hasClientId: !!clientId, hasConsumerKey: !!consumerKey, hasUserId: !!userId, hasUserSecret: !!userSecret },
    "broker: vérification des credentials SnapTrade au démarrage"
  );

  if (!clientId || !consumerKey) {
    logger.warn("broker: SNAPTRADE_CLIENT_ID ou SNAPTRADE_CONSUMER_KEY manquant — mode courtier désactivé");
    return;
  }

  if (!userId || !userSecret) {
    logger.warn("broker: SNAPTRADE_USER_ID ou SNAPTRADE_USER_SECRET manquant — auto-setup ignoré (configure-les via /courtier)");
    return;
  }

  try {
    const rows = await db
      .select()
      .from(brokerConnectionsTable)
      .orderBy(desc(brokerConnectionsTable.id))
      .limit(1);

    if (rows.length > 0) {
      logger.info({ status: rows[0].status }, "broker: connexion existante trouvée — pas besoin d'auto-setup");
      return;
    }

    // Aucune ligne → on insère directement les credentials personnels (pas d'appel registerUser)
    await db.insert(brokerConnectionsTable).values({
      snaptradeUserId: userId,
      snaptradeUserSecret: userSecret,
      status: "pending",
    });

    logger.info({ userId }, "broker: auto-setup réussi — statut 'pending'. L'utilisateur doit maintenant lier son compte Wealthsimple via le portail OAuth (/courtier → Étape 2).");
  } catch (err) {
    logger.error({ err }, "broker: auto-setup échoué — la configuration manuelle via /courtier reste possible");
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

  // Persiste le consumerKey SnapTrade en base dès que possible (survit aux
  // suppressions de secrets et aux remixes sans re-saisie).
  persistConsumerKeyIfNeeded().catch((err) =>
    logger.warn({ err }, "snaptrade: persistConsumerKeyIfNeeded a échoué au démarrage")
  );

  // Persiste les credentials externes (Twilio, Gmail) en base — même pattern
  // que SnapTrade : lu depuis la DB en priorité, env var en fallback.
  persistExternalCredsIfNeeded().catch((err) =>
    logger.warn({ err }, "persistExternalCredsIfNeeded a échoué au démarrage")
  );

  // Auto-setup asynchrone — ne bloque pas le démarrage du serveur
  autoSetupBrokerIfNeeded().catch((err) =>
    logger.error({ err }, "broker: erreur inattendue dans autoSetupBrokerIfNeeded")
  );
});
