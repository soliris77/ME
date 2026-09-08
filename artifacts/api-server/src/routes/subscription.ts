/**
 * /api/subscription — état d'abonnement, tel que le serveur le connaît.
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun paramètre venant du client n'influence le verdict : c'est tout l'objet
 * de ces routes. L'ancienne /api/whop/verify acceptait un identifiant
 * d'adhésion en query string, ce qui revenait à laisser le navigateur décider
 * s'il était abonné.
 *
 * Seule exception, et elle est explicite : la clé fondateur. Elle n'est pas un
 * paramètre qui influence le verdict, c'est un secret que seul le propriétaire
 * de l'instance connaît, vérifié côté serveur contre FOUNDER_CODE.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  getSubscriptionForRequest,
  refreshSubscription,
  withFounder,
} from "../lib/subscription";
import { checkFounderCode, hasFounderAccess, isFounderConfigured } from "../lib/founder";
import { logger } from "../lib/logger";

const router = Router();

/**
 * Cinq essais par quart d'heure. Le code fondateur est long, donc hors de
 * portée d'une attaque par force brute de toute façon — mais une route qui
 * accepte un secret sans limite d'essais est une invitation.
 */
const founderRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Trop de tentatives. Réessaie dans quelques minutes." },
});

// ─── GET /api/subscription ─────────────────────────────────────────────────
// Consulté au chargement de l'app et par le mur de paiement. Réponse depuis la
// base, avec rafraîchissement automatique passé cinq minutes, puis superposition
// de l'accès fondateur s'il est ouvert dans cette session.
router.get("/subscription", async (req, res) => {
  try {
    const state = await getSubscriptionForRequest(req);
    return res.json({ ...state, founderAvailable: isFounderConfigured() });
  } catch (err) {
    req.log.error({ err }, "subscription: lecture impossible");
    return res.status(500).json({ error: "État d'abonnement indisponible." });
  }
});

// ─── POST /api/subscription/refresh ────────────────────────────────────────
// Synchronisation immédiate. Appelé au retour du paiement — sans cela,
// l'abonné venant de payer attendrait l'expiration du cache avant de voir son
// accès s'ouvrir — et depuis le bouton « Actualiser » des réglages.
router.post("/subscription/refresh", async (req, res) => {
  try {
    const state = await refreshSubscription();
    return res.json({
      ...withFounder(state, hasFounderAccess(req)),
      founderAvailable: isFounderConfigured(),
    });
  } catch (err) {
    req.log.error({ err }, "subscription: synchronisation impossible");
    return res.status(502).json({ error: "Synchronisation avec Whop impossible." });
  }
});

// ─── POST /api/subscription/founder ────────────────────────────────────────
// Ouvre l'accès fondateur pour cette session. Réservé au propriétaire de
// l'instance : la route est déjà derrière requireAuth, et exige en plus le
// secret FOUNDER_CODE, qui n'existe que dans son .env.local.
router.post("/subscription/founder", founderRateLimiter, (req, res) => {
  if (!isFounderConfigured()) {
    // Pas de FOUNDER_CODE sur cette instance : la porte n'existe pas. On le dit
    // franchement — la route est derrière l'authentification, il n'y a rien à
    // dissimuler à quelqu'un qui a déjà le mot de passe du site.
    return res.status(404).json({
      error: "Aucune clé fondateur n'est configurée sur cette instance.",
      code: "founder_not_configured",
    });
  }

  const { code } = req.body as { code?: unknown };
  if (!checkFounderCode(code)) {
    logger.warn({ ip: req.ip }, "founder: clé refusée");
    return res.status(401).json({ error: "Clé fondateur incorrecte." });
  }

  req.session.founder = true;
  req.session.save((err) => {
    if (err) {
      req.log.error({ err }, "founder: session non enregistrée");
      return res.status(500).json({ error: "Erreur de session." });
    }
    logger.info({ ip: req.ip }, "founder: accès fondateur ouvert");
    return res.json({ founder: true });
  });
});

// ─── DELETE /api/subscription/founder ──────────────────────────────────────
// Referme la porte. Indispensable, et pas seulement par principe : c'est le
// seul moyen de voir le mur de paiement tel que le verra un client, sans
// toucher à la configuration ni se déconnecter.
router.delete("/subscription/founder", (req, res) => {
  req.session.founder = false;
  req.session.save((err) => {
    if (err) {
      req.log.error({ err }, "founder: session non enregistrée");
      return res.status(500).json({ error: "Erreur de session." });
    }
    logger.info("founder: accès fondateur refermé");
    return res.json({ founder: false });
  });
});

export default router;
