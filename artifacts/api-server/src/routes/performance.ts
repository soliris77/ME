/**
 * /api/performance — agrège l'historique des ordres remplis en métriques de
 * performance (taux de réussite, risque/récompense, drawdown), séparément
 * pour paper et live, plus une vue combinée. Lecture seule, aucun état
 * modifiable ici — le calcul se fait à la volée à partir de la table orders
 * (voir lib/performance.ts pour la méthode d'appariement FIFO).
 * Protégé par requireAuth (monté dans routes/index.ts).
 */
import { Router } from "express";
import { getPerformanceReport } from "../lib/performance";

const router = Router();

router.get("/performance", async (_req, res) => {
  try {
    const report = await getPerformanceReport();
    return res.json(report);
  } catch (err) {
    return res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

export default router;
