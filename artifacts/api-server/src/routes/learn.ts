/**
 * /api/learn-progress — progression de la section "Apprendre à trader".
 * Protégé par requireAuth (monté dans routes/index.ts).
 */
import { Router } from "express";
import { getAllLearnProgress, markLearnProgress } from "../lib/learnProgress";

const router = Router();

router.get("/learn-progress", async (req, res) => {
  try {
    const progress = await getAllLearnProgress();
    return res.json(progress);
  } catch (err) {
    req.log.error({ err }, "Failed to get learn progress");
    return res.status(500).json({ error: "Failed to get learn progress" });
  }
});

router.put("/learn-progress/:sectionId", async (req, res) => {
  const { sectionId } = req.params;
  const { completed, quizScore, quizTotal } = req.body as { completed?: boolean; quizScore?: number; quizTotal?: number };
  if (typeof completed !== "boolean") {
    return res.status(400).json({ error: "completed (boolean) is required" });
  }
  try {
    const updated = await markLearnProgress(sectionId, { completed, quizScore, quizTotal });
    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update learn progress");
    return res.status(500).json({ error: "Failed to update learn progress" });
  }
});

export default router;
