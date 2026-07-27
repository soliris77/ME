import { Router } from "express";
import rateLimit from "express-rate-limit";
import { logger } from "../lib/logger";

const router = Router();

// Public (pas de session requise — un crash peut survenir avant login) mais
// limité en débit pour éviter qu'un bug en boucle ne sature les logs, ou
// qu'un tiers l'utilise pour du spam.
const clientErrorLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

interface ClientErrorPayload {
  message?: string;
  stack?: string;
  source?: string; // ex: "window.error", "unhandledrejection", "react-boundary"
  pageName?: string;
  url?: string;
}

// Point de centralisation des erreurs client (point 18 du cahier des charges) :
// les erreurs sont déjà capturées et affichées à l'écran côté client
// (main.tsx + PageErrorBoundary), mais nulle part consultable après coup.
// Ce endpoint les journalise via pino, déjà consultable via les logs du
// workflow et les logs de déploiement — pas besoin d'une UI dédiée séparée.
router.post("/client-errors", clientErrorLimiter, (req, res) => {
  const { message, stack, source, pageName, url } = (req.body ?? {}) as ClientErrorPayload;
  logger.error(
    { message, stack, source, pageName, url, ua: req.headers["user-agent"] },
    "client-error: unhandled error reported from browser"
  );
  return res.status(204).send();
});

export default router;
