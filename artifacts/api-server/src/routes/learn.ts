/**
 * /api/learn-progress — progression de la section "Apprendre à trader".
 * Protégé par requireAuth (monté dans routes/index.ts).
 */
import { Router } from "express";
import { getAllLearnProgress, markLearnProgress } from "../lib/learnProgress";
import {
  getPracticeStatuses,
  recordPracticeEvent,
  CLIENT_PRACTICE_TOOLS,
  type ClientPracticeTool,
} from "../lib/practiceValidation";

const router = Router();

// ── Validation des exercices pratiques (badge « Exercice fait ») ────────────

router.get("/learn-practice", async (req, res) => {
  try {
    const statuses = await getPracticeStatuses();
    return res.json(statuses);
  } catch (err) {
    req.log.error({ err }, "Failed to get practice statuses");
    return res.status(500).json({ error: "Failed to get practice statuses" });
  }
});

router.post("/learn-practice/events", async (req, res) => {
  const { tool } = req.body as { tool?: string };
  if (!tool || !(CLIENT_PRACTICE_TOOLS as readonly string[]).includes(tool)) {
    return res.status(400).json({ error: `tool doit être l'un de : ${CLIENT_PRACTICE_TOOLS.join(", ")}` });
  }
  try {
    await recordPracticeEvent(tool as ClientPracticeTool);
    return res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to record practice event");
    return res.status(500).json({ error: "Failed to record practice event" });
  }
});

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
