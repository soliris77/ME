/**
 * Origines de confiance — CORS et protection CSRF.
 * ─────────────────────────────────────────────────────────────────────────
 * Le frontend appelle l'API en chemin relatif (/api/…), donc en même origine :
 * en pratique aucune requête légitime n'est cross-origin. La configuration par
 * défaut est donc fermée, et s'ouvre uniquement via ALLOWED_ORIGINS.
 *
 *   ALLOWED_ORIGINS — liste séparée par des virgules
 *                     ex. https://soliris.app,https://app.soliris.app
 *
 * En développement, les origines locales usuelles (Vite, aperçu) sont
 * autorisées d'office pour ne pas gêner le travail au quotidien.
 *
 * Deux protections distinctes, volontairement séparées :
 *
 *   CORS         — décide quelle page a le droit de LIRE une réponse.
 *   verifyOrigin — décide quelle page a le droit de DÉCLENCHER une écriture.
 *
 * La seconde est celle qui compte contre le CSRF : un formulaire hostile peut
 * envoyer un POST sans lire la réponse, et CORS seul ne l'arrête pas. Le
 * cookie est en SameSite=Lax, ce qui couvre déjà l'essentiel — cette
 * vérification est la seconde ligne, pour que la sécurité ne repose pas sur
 * un unique attribut de cookie.
 */
import type { CorsOptions } from "cors";
import type { RequestHandler } from "express";
import { logger } from "./logger";

/**
 * Origines locales acceptées d'office en développement.
 *
 * 23051 est le port du serveur Vite de CE projet (voir `vite.config.ts`, où
 * il est la valeur par défaut). Il manquait ici, et c'est ce qui rendait la
 * connexion impossible en local : le navigateur envoie
 * `Origin: http://localhost:23051`, le proxy Vite réécrit l'hôte en
 * `localhost:8080`, les deux ne correspondent plus, et verifyOrigin rejetait
 * chaque écriture — à commencer par le POST de connexion. La page s'affichait
 * parfaitement, mais on ne pouvait pas entrer.
 *
 * 5173 reste listé pour quiconque lance Vite sur son port par défaut.
 */
const DEV_ORIGINS = [
  "http://localhost:23051",
  "http://127.0.0.1:23051",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
];

function replitDevelopmentOrigins(): string[] {
  if (process.env.NODE_ENV === "production") return [];

  const domains = [
    process.env.REPLIT_DEV_DOMAIN,
    ...(process.env.REPLIT_DOMAINS ?? "").split(","),
  ]
    .map((domain) => domain?.trim())
    .filter((domain): domain is string => Boolean(domain));

  return domains.map((domain) =>
    domain.startsWith("http://") || domain.startsWith("https://")
      ? domain.replace(/\/$/, "")
      : `https://${domain.replace(/\/$/, "")}`,
  );
}

/** Origines autorisées, résolues une fois au démarrage. */
export function allowedOrigins(): string[] {
  const configured = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

  if (process.env.NODE_ENV === "production") return configured;
  return [...new Set([...configured, ...DEV_ORIGINS, ...replitDevelopmentOrigins()])];
}

/**
 * Politique CORS. Une requête sans en-tête Origin (même origine, appel
 * serveur à serveur, sonde de santé) passe : il n'y a rien à protéger.
 */
export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const list = allowedOrigins();
    if (list.includes(origin.replace(/\/$/, ""))) return callback(null, true);
    logger.warn({ origin }, "cors: origine refusée");
    return callback(null, false);
  },
  credentials: true,
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Refuse les écritures déclenchées depuis une page tierce.
 *
 * - Méthode sans effet de bord → laissé passer.
 * - Aucun en-tête Origin ni Referer → ce n'est pas un navigateur, laissé
 *   passer (curl, tests, appels internes).
 * - Origine identique à l'hôte de la requête, ou explicitement autorisée →
 *   laissé passer.
 * - Tout le reste → 403, et on le journalise : c'est le signal d'une
 *   tentative, pas un incident silencieux.
 */
export const verifyOrigin: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const raw = req.get("origin") ?? req.get("referer");
  if (!raw) return next();

  let origin: string;
  try {
    const url = new URL(raw);
    origin = `${url.protocol}//${url.host}`;
  } catch {
    logger.warn({ raw, path: req.path }, "csrf: en-tête Origin illisible");
    return res.status(403).json({ error: "Origine de la requête invalide." });
  }

  const host = req.get("host");
  const proto = req.protocol;
  if (host && origin === `${proto}://${host}`) return next();
  if (allowedOrigins().includes(origin)) return next();

  logger.warn({ origin, path: req.path, method: req.method }, "csrf: écriture refusée depuis une origine tierce");
  return res.status(403).json({
    error: "Requête refusée : elle ne provient pas de l'application.",
  });
};
