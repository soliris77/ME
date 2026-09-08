/**
 * Authentification — application mono-utilisateur
 * ─────────────────────────────────────────────────────────────────────────
 * Priorité de configuration du mot de passe (ordre décroissant) :
 *   1. Hash stocké dans app_settings.password_hash (base de données)
 *      → survit aux remixes / fork sans re-saisie de secret.
 *   2. Variable d'environnement AUTH_PASSWORD (secret Replit)
 *      → interopérabilité avec l'ancien comportement.
 *   3. Aucun des deux → mode « premier lancement » : l'API retourne
 *      { needsSetup: true } et le frontend affiche la page de configuration.
 *
 * Session : cookie signé, httpOnly, secure (en production), stocké côté
 * serveur dans Postgres via connect-pg-simple.
 */
import { randomBytes } from "crypto";
import type { RequestHandler } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { pool, db, appSettingsTable } from "@workspace/db";
import { logger } from "./logger";

const PgSession = connectPgSimple(session);

// ─── Résolution du hash — DB d'abord, variable d'env ensuite ──────────────
// Cache en mémoire : null = non encore résolu, "" = premier lancement (pas configuré)
let _resolvedHash: string | null | undefined = undefined; // undefined = cache vide

async function resolvePasswordHash(): Promise<string | null> {
  if (_resolvedHash !== undefined) return _resolvedHash;

  // 1) Chercher dans la base de données
  try {
    const [row] = await db.select({ h: appSettingsTable.passwordHash }).from(appSettingsTable).limit(1);
    if (row?.h) {
      _resolvedHash = row.h;
      return _resolvedHash;
    }
  } catch (err) {
    logger.warn({ err }, "auth: impossible de lire password_hash depuis DB");
  }

  // 2) Variable d'environnement
  const plain = process.env.AUTH_PASSWORD;
  if (plain) {
    _resolvedHash = await bcrypt.hash(plain, 12);
    return _resolvedHash;
  }

  // 3) Rien — premier lancement
  _resolvedHash = null;
  return null;
}

/** Invalide le cache (à appeler après setPassword). */
export function invalidatePasswordCache(): void {
  _resolvedHash = undefined;
}

/** true → pas de mot de passe configuré (ni DB, ni env). */
export async function needsSetup(): Promise<boolean> {
  return (await resolvePasswordHash()) === null;
}

export async function verifyPassword(candidate: string): Promise<boolean> {
  const hash = await resolvePasswordHash();
  if (!hash) return false; // pas configuré → refus silencieux
  return bcrypt.compare(candidate, hash);
}

/**
 * Définit un nouveau mot de passe. Stocke le hash dans la base de données
 * (crée la ligne app_settings si elle n'existe pas encore).
 * Ne fonctionne que si aucun mot de passe n'est encore configuré.
 */
export async function setPassword(plain: string): Promise<void> {
  const hash = await bcrypt.hash(plain, 12);

  const [existing] = await db.select({ id: appSettingsTable.id }).from(appSettingsTable).limit(1);
  if (existing) {
    await db.update(appSettingsTable)
      .set({ passwordHash: hash })
      .where(eq(appSettingsTable.id, existing.id));
  } else {
    await db.insert(appSettingsTable).values({
      maxOrderValue: String(process.env.MAX_ORDER_VALUE ?? 5000),
      maxPortfolioExposure: String(process.env.MAX_PORTFOLIO_EXPOSURE ?? 25000),
      largeOrderFrictionPct: "0.5",
      passwordHash: hash,
    });
  }

  invalidatePasswordCache();
}

// ─── Session middleware ────────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === "production";

/**
 * Résolution du SESSION_SECRET.
 * En production : obligatoire (throw si absent).
 * En développement : génère un secret éphémère aléatoire si absent, avec
 * un avertissement clair. Cela permet à l'application de démarrer normalement
 * après un remix/fork sans secrets configurés. Les sessions ne survivront
 * pas aux redémarrages du serveur dans ce mode.
 */
function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (isProduction) {
    throw new Error("SESSION_SECRET doit être défini en production.");
  }
  // Développement : fallback éphémère — l'app démarre mais les sessions
  // sont perdues à chaque redémarrage. Configurer SESSION_SECRET pour
  // des sessions persistantes.
  const fallback = randomBytes(32).toString("hex");
  logger.warn(
    "SESSION_SECRET non défini — utilisation d'un secret éphémère. " +
    "Configurer la variable d'environnement SESSION_SECRET pour des sessions persistantes."
  );
  return fallback;
}

export const sessionMiddleware: RequestHandler = session({
  store: new PgSession({
    pool,
    tableName: "session",
    createTableIfMissing: true,
  }),
  name: "soliris.sid",
  secret: resolveSessionSecret(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 2, // 2 jours
  },
});

declare module "express-session" {
  interface SessionData {
    authenticated?: boolean;
    founder?: boolean;
  }
}

// ─── Limitation des tentatives de connexion ────────────────────────────────
// Bloque après 5 échecs pour une même IP pendant 15 minutes — protège contre
// le brute-force sur un mot de passe unique.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Trop de tentatives de connexion. Réessayez dans quelques minutes." },
  handler: (req, res, _next, options) => {
    logger.warn({ ip: req.ip }, "auth: login rate limit exceeded");
    res.status(options.statusCode).json(options.message);
  },
});

// ─── Middleware de protection ──────────────────────────────────────────────
// Toute route API qui touche aux données ou au courtier passe par ici.
// Une requête non authentifiée reçoit un 401 JSON — jamais un simple masquage
// visuel côté frontend.
export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.session?.authenticated) return next();
  return res.status(401).json({ error: "Authentification requise." });
};
