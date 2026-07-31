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
import { getDisciplineReport } from "../lib/discipline";
import { recordPracticeEvent } from "../lib/practiceValidation";

const router = Router();

// Score de discipline — trades clôturés vs plan de risque (stop, risque %, taille, R réalisé)
router.get("/performance/discipline", async (_req, res) => {
  try {
    const report = await getDisciplineReport();
    return res.json(report);
  } catch (err) {
    return res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

router.get("/performance", async (req, res) => {
  try {
    // Exercice pratique du parcours (leçon espérance mathématique) : consulter
    // ses statistiques réelles compte comme pratique — enregistré en tâche de fond.
    recordPracticeEvent("performance").catch((err) => req.log.warn({ err }, "practice event performance failed"));
    const report = await getPerformanceReport();
    return res.json(report);
  } catch (err) {
    return res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

export default router;
