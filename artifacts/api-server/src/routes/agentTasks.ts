/**
 * Routes pour la gestion des tâches d'agents IA.
 * ─────────────────────────────────────────────────────────────────────────────
 * GET    /api/agent-tasks          → liste toutes les tâches
 * GET    /api/agent-tasks/:id      → détail d'une tâche
 * POST   /api/agent-tasks          → créer une nouvelle tâche
 * PATCH  /api/agent-tasks/:id      → mettre à jour (progression, statut, notes)
 * DELETE /api/agent-tasks/:id      → supprimer une tâche
 */
import { Router } from "express";
import {
  getAllAgentTasks,
  getAgentTaskById,
  createAgentTask,
  updateAgentTask,
  deleteAgentTask,
} from "../lib/agentTasks";

const router = Router();

// GET /api/agent-tasks
router.get("/agent-tasks", async (_req, res) => {
  try {
    const tasks = await getAllAgentTasks();
    return res.json(tasks);
  } catch (err) {
    console.error("[agent-tasks] GET /agent-tasks error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/agent-tasks/:id
router.get("/agent-tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "ID invalide" });

  try {
    const task = await getAgentTaskById(id);
    if (!task) return res.status(404).json({ error: "Tâche introuvable" });
    return res.json(task);
  } catch (err) {
    console.error("[agent-tasks] GET /agent-tasks/:id error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/agent-tasks
router.post("/agent-tasks", async (req, res) => {
  const { title, description, stepsCompleted, nextSteps, checkpointNotes } = req.body ?? {};

  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title requis" });
  }
  if (!description || typeof description !== "string" || !description.trim()) {
    return res.status(400).json({ error: "description requise" });
  }

  try {
    const task = await createAgentTask({
      title: title.trim(),
      description: description.trim(),
      stepsCompleted: Array.isArray(stepsCompleted) ? stepsCompleted : [],
      nextSteps: Array.isArray(nextSteps) ? nextSteps : [],
      checkpointNotes: typeof checkpointNotes === "string" ? checkpointNotes : "",
    });
    return res.status(201).json(task);
  } catch (err) {
    console.error("[agent-tasks] POST /agent-tasks error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/agent-tasks/:id
router.patch("/agent-tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "ID invalide" });

  const { title, description, status, stepsCompleted, nextSteps, checkpointNotes } = req.body ?? {};

  const validStatuses = ["in_progress", "paused", "completed", "cancelled"];
  if (status !== undefined && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status invalide. Valeurs acceptées : ${validStatuses.join(", ")}` });
  }

  try {
    const task = await updateAgentTask(id, {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(Array.isArray(stepsCompleted) && { stepsCompleted }),
      ...(Array.isArray(nextSteps) && { nextSteps }),
      ...(checkpointNotes !== undefined && { checkpointNotes }),
    });
    if (!task) return res.status(404).json({ error: "Tâche introuvable" });
    return res.json(task);
  } catch (err) {
    console.error("[agent-tasks] PATCH /agent-tasks/:id error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/agent-tasks/:id
router.delete("/agent-tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "ID invalide" });

  try {
    const deleted = await deleteAgentTask(id);
    if (!deleted) return res.status(404).json({ error: "Tâche introuvable" });
    return res.json({ success: true });
  } catch (err) {
    console.error("[agent-tasks] DELETE /agent-tasks/:id error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
