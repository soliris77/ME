/**
 * Routes Daily Summary
 * POST /api/daily-summary/run  — force un envoi immédiat du bilan SMS (debug/test)
 */
import { Router } from "express";
import { logger } from "../lib/logger";
import { sendDailySummary } from "../workers/dailySummaryWorker";

const router = Router();

// POST /api/daily-summary/run
router.post("/daily-summary/run", async (_req, res) => {
  try {
    void sendDailySummary().catch((err) => logger.error({ err }, "daily-summary: forced run failed"));
    res.json({ ok: true, message: "Bilan SMS lancé en arrière-plan" });
  } catch (err) {
    logger.error({ err }, "daily-summary: POST run error");
    res.status(500).json({ error: "Erreur lors du lancement du bilan" });
  }
});

export default router;
