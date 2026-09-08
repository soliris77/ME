/**
 * Client Whop — deux chemins d'authentification, dans cet ordre.
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. WHOP_API_KEY dans l'environnement. C'est le chemin normal partout ailleurs
 *    que sur Replit : machine locale, VPS, conteneur, instance dédiée à un client.
 * 2. Le connecteur Replit, quand l'application tourne sur Replit et que la clé
 *    n'a pas été posée en variable d'environnement.
 *
 * Pourquoi ce changement : la version précédente ne connaissait QUE le chemin
 * Replit — elle lisait la clé sur `REPLIT_CONNECTORS_HOSTNAME` et levait une
 * erreur si ces variables n'existaient pas. Hors de Replit, toute vérification
 * d'abonnement échouait donc silencieusement : `requirePremium` rattrape
 * l'erreur et laisse passer (pour ne jamais bloquer un abonné sur une panne),
 * si bien que le mur de paiement n'aurait jamais fermé quoi que ce soit sur une
 * instance auto-hébergée. Le problème ne se serait vu qu'en constatant, des
 * semaines plus tard, que personne n'a jamais été bloqué.
 *
 * La clé est un secret : elle vient de l'environnement, jamais du dépôt.
 */
import Whop from '@whop/sdk';

let clientPromise: Promise<Whop> | null = null;

/** Chemin 1 — clé fournie directement par l'environnement. */
function apiKeyFromEnv(): string | null {
  const key = process.env.WHOP_API_KEY?.trim();
  return key ? key : null;
}

/** Chemin 2 — clé récupérée auprès du connecteur Replit. */
async function apiKeyFromReplitConnector(): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Aucune clé Whop disponible. Posez WHOP_API_KEY dans l'environnement " +
      "(instance auto-hébergée), ou connectez l'intégration Whop depuis " +
      "l'onglet Integrations si l'application tourne sur Replit."
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=whop`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!resp.ok) {
    throw new Error(`Récupération des identifiants Whop impossible : ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  const settings = data.items?.[0]?.settings;

  if (!settings?.api_key) {
    throw new Error(
      "Intégration Whop non connectée ou sans identifiants. " +
      "Connectez Whop depuis l'onglet Integrations, ou posez WHOP_API_KEY."
    );
  }

  return settings.api_key as string;
}

async function initWhopClient(): Promise<Whop> {
  const apiKey = apiKeyFromEnv() ?? (await apiKeyFromReplitConnector());
  return new Whop({ apiKey });
}

export function getWhopClient(): Promise<Whop> {
  if (!clientPromise) {
    clientPromise = initWhopClient().catch((err) => {
      // On oublie la promesse en échec : la tentative suivante réessaiera
      // plutôt que de resservir éternellement la même erreur.
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

/**
 * Whop est-il configuré ? Utilisé au démarrage pour prévenir tout de suite
 * plutôt que de laisser découvrir le problème au premier client qui paie.
 */
export function isWhopConfigured(): boolean {
  return (
    apiKeyFromEnv() !== null ||
    Boolean(process.env.REPLIT_CONNECTORS_HOSTNAME &&
      (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL))
  );
}
