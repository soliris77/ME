/**
 * /api/settings — paramètres de risque modifiables depuis l'écran Paramètres.
 * Protégé par requireAuth (monté dans routes/index.ts). Toute modification
 * est validée puis journalisée automatiquement dans audit_log.
 */
import { Router } from "express";
import { getRiskSettings, updateRiskSettings } from "../lib/settings";

const router = Router();

router.get("/settings", async (_req, res) => {
  const settings = await getRiskSettings();
  return res.json(settings);
});

router.put("/settings", async (req, res) => {
  try {
    const { maxOrderValue, maxPortfolioExposure, largeOrderFrictionPct, maxDailyLossAmount } = req.body as {
      maxOrderValue?: number;
      maxPortfolioExposure?: number;
      largeOrderFrictionPct?: number;
      maxDailyLossAmount?: number | null;
    };
    const updated = await updateRiskSettings({ maxOrderValue, maxPortfolioExposure, largeOrderFrictionPct, maxDailyLossAmount });
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

export default router;
