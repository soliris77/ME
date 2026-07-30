/**
 * /api/auth/* — connexion à un seul mot de passe
 */
import { Router } from "express";
import { verifyPassword, loginRateLimiter, needsSetup, setPassword } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

// ─── GET /api/auth/needs-setup ─────────────────────────────────────────────
// Indique si aucun mot de passe n'a encore été configuré (premier lancement
// après un remix ou une installation fraîche). Le frontend redirige vers /setup.
router.get("/auth/needs-setup", async (_req, res) => {
  try {
    const setup = await needsSetup();
    return res.json({ needsSetup: setup });
  } catch (err) {
    logger.error({ err }, "auth: needs-setup check failed");
    return res.status(500).json({ error: "Impossible de vérifier la configuration." });
  }
});

// ─── POST /api/auth/setup ──────────────────────────────────────────────────
// Définit le mot de passe initial. Accessible UNIQUEMENT quand aucun mot de
// passe n'est encore en place — refusé dès qu'un hash existe en base ou en env.
router.post("/auth/setup", loginRateLimiter, async (req, res) => {
  const { password } = req.body as { password?: string };

  if (!password || typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères." });
  }

  const setup = await needsSetup();
  if (!setup) {
    return res.status(403).json({ error: "Un mot de passe est déjà configuré." });
  }

  try {
    await setPassword(password);
    logger.info("auth: initial password configured via setup");
    // Ouvrir la session directement après la configuration
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Erreur de session." });
      req.session.authenticated = true;
      req.session.save(() => res.json({ authenticated: true }));
    });
  } catch (err) {
    logger.error({ err }, "auth: setup failed");
    return res.status(500).json({ error: "Erreur lors de la configuration du mot de passe." });
  }
});

// ─── POST /api/auth/login ──────────────────────────────────────────────────
router.post("/auth/login", loginRateLimiter, async (req, res) => {
  const { password } = req.body as { password?: string };

  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "Mot de passe requis." });
  }

  let ok = false;
  try {
    ok = await verifyPassword(password);
  } catch (err) {
    logger.error({ err }, "auth: password verification failed");
    return res.status(500).json({ error: "Authentification indisponible." });
  }

  if (!ok) {
    logger.warn({ ip: req.ip }, "auth: failed login attempt");
    return res.status(401).json({ error: "Mot de passe incorrect." });
  }

  req.session.regenerate((err) => {
    if (err) {
      logger.error({ err }, "auth: session regenerate failed");
      return res.status(500).json({ error: "Erreur de session." });
    }
    req.session.authenticated = true;
    req.session.save((saveErr) => {
      if (saveErr) {
        logger.error({ err: saveErr }, "auth: session save failed");
        return res.status(500).json({ error: "Erreur de session." });
      }
      logger.info("auth: login success");
      return res.json({ authenticated: true });
    });
  });
});

// ─── POST /api/auth/logout ──────────────────────────────────────────────────
router.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      logger.error({ err }, "auth: logout failed");
      return res.status(500).json({ error: "Erreur lors de la déconnexion." });
    }
    res.clearCookie("soliris.sid");
    return res.json({ authenticated: false });
  });
});

// ─── POST /api/auth/change-password ───────────────────────────────────────
// Permet à un utilisateur authentifié de changer son mot de passe.
router.post("/auth/change-password", loginRateLimiter, async (req, res) => {
  if (!req.session?.authenticated) {
    return res.status(401).json({ error: "Non authentifié." });
  }

  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

  if (!currentPassword || typeof currentPassword !== "string") {
    return res.status(400).json({ error: "Mot de passe actuel requis." });
  }
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 6 caractères." });
  }

  try {
    const ok = await verifyPassword(currentPassword);
    if (!ok) {
      return res.status(401).json({ error: "Mot de passe actuel incorrect." });
    }
    await setPassword(newPassword);
    logger.info("auth: password changed");
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "auth: change-password failed");
    return res.status(500).json({ error: "Erreur lors du changement de mot de passe." });
  }
});

// ─── GET /api/auth/me ───────────────────────────────────────────────────────
// Utilisé par le frontend pour savoir si la session est active.
router.get("/auth/me", (req, res) => {
  return res.json({ authenticated: !!req.session?.authenticated });
});

export default router;
