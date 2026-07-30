/**
 * Gestion de la persistance des tâches d'agents IA.
 * ─────────────────────────────────────────────────────────────────────────────
 * Permet à un agent de sauvegarder son état d'avancement avant d'atteindre une
 * limite d'utilisation, afin qu'un agent suivant (dans un remix) puisse reprendre
 * exactement là où le précédent s'est arrêté.
 *
 * MÉCANISME DE GARANTIE :
 * À chaque création ou mise en pause d'une tâche, deux fichiers sont mis à jour
 * automatiquement sur le système de fichiers du workspace :
 *
 *   1. `.agents/memory/in-progress.md` — contient les détails complets de la
 *      tâche en cours (instructions, étapes faites, prochaines étapes, notes).
 *      Ce fichier est visible dans le <auto_memory> de MEMORY.md au démarrage
 *      de chaque session.
 *
 *   2. `.agents/memory/MEMORY.md` — l'index de mémoire est mis à jour pour
 *      afficher une alerte "⚠️ TÂCHE EN COURS" bien visible en haut.
 *
 * Quand la tâche est complétée ou annulée, ces entrées d'alerte sont supprimées.
 */
import { db, agentTasksTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";

export type AgentTaskStatus = "in_progress" | "paused" | "completed" | "cancelled";

export interface AgentTaskOut {
  id: number;
  title: string;
  description: string;
  status: AgentTaskStatus;
  stepsCompleted: string[];
  nextSteps: string[];
  checkpointNotes: string;
  startedAt: string;
  pausedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

function parseJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toOut(row: typeof agentTasksTable.$inferSelect): AgentTaskOut {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as AgentTaskStatus,
    stepsCompleted: parseJson(row.stepsCompleted),
    nextSteps: parseJson(row.nextSteps),
    checkpointNotes: row.checkpointNotes,
    startedAt: row.startedAt.toISOString(),
    pausedAt: row.pausedAt ? row.pausedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Chemin absolu vers la racine du workspace ────────────────────────────────
// Le serveur tourne depuis artifacts/api-server/ (process.cwd()).
// .agents/memory/ est à la racine du workspace = deux niveaux au-dessus.
const WORKSPACE_ROOT = resolve(process.cwd(), "../..");
const MEMORY_DIR = resolve(WORKSPACE_ROOT, ".agents/memory");
const IN_PROGRESS_FILE = resolve(MEMORY_DIR, "in-progress.md");
const MEMORY_INDEX_FILE = resolve(MEMORY_DIR, "MEMORY.md");

/**
 * Écrit (ou efface) le fichier in-progress.md et met à jour l'alerte dans MEMORY.md.
 * Appelé automatiquement à chaque create/update de tâche.
 */
function syncInProgressFile(tasks: AgentTaskOut[]): void {
  try {
    if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });

    const activeTasks = tasks.filter(
      (t) => t.status === "in_progress" || t.status === "paused"
    );

    // ── 1. Écrire/effacer in-progress.md ────────────────────────────────────
    if (activeTasks.length === 0) {
      // Aucune tâche active — écrire un fichier vide signalant que tout est terminé
      writeFileSync(
        IN_PROGRESS_FILE,
        `---
name: In-progress agent task
description: Tâche agent en cours (vide = aucune tâche à reprendre)
---

# Aucune tâche en cours

Toutes les tâches d'agents sont terminées. Pas besoin de reprendre quoi que ce soit.
`,
        "utf8"
      );
    } else {
      const lines: string[] = [
        `---`,
        `name: In-progress agent task`,
        `description: TÂCHE EN COURS — reprendre immédiatement avant tout autre travail`,
        `---`,
        ``,
        `# ⚠️ TÂCHE EN COURS — À REPRENDRE EN PRIORITÉ`,
        ``,
        `> **Pour tout nouvel agent démarrant dans ce projet :**`,
        `> Lis ce fichier AVANT de commencer quoi que ce soit.`,
        `> Une tâche a été interrompue (limite d'utilisation atteinte) et doit être reprise.`,
        `> Appelle \`GET /api/agent-tasks\` pour récupérer les détails complets depuis la base de données.`,
        ``,
      ];

      for (const task of activeTasks) {
        const statusLabel = task.status === "paused" ? "⏸️ EN PAUSE" : "▶️ EN COURS";
        lines.push(`## ${statusLabel} — ${task.title} (ID: ${task.id})`);
        lines.push(``);
        lines.push(`**Instructions d'origine :**`);
        lines.push(task.description);
        lines.push(``);

        if (task.stepsCompleted.length > 0) {
          lines.push(`**✅ Étapes déjà complétées :**`);
          for (const step of task.stepsCompleted) {
            lines.push(`- ${step}`);
          }
          lines.push(``);
        }

        if (task.nextSteps.length > 0) {
          lines.push(`**➡️ PROCHAINES ÉTAPES (reprendre ici) :**`);
          for (const step of task.nextSteps) {
            lines.push(`- ${step}`);
          }
          lines.push(``);
        }

        if (task.checkpointNotes.trim()) {
          lines.push(`**📝 Notes techniques de reprise :**`);
          lines.push("```");
          lines.push(task.checkpointNotes);
          lines.push("```");
          lines.push(``);
        }

        lines.push(`*Mis en pause le : ${task.pausedAt ?? task.updatedAt}*`);
        lines.push(``);
        lines.push(`---`);
        lines.push(``);
      }

      writeFileSync(IN_PROGRESS_FILE, lines.join("\n"), "utf8");
    }

    // ── 2. Mettre à jour l'alerte dans MEMORY.md ─────────────────────────────
    const ALERT_START = "<!-- AGENT_TASK_ALERT_START -->";
    const ALERT_END = "<!-- AGENT_TASK_ALERT_END -->";

    let memoryContent = existsSync(MEMORY_INDEX_FILE)
      ? readFileSync(MEMORY_INDEX_FILE, "utf8")
      : "";

    // Supprimer l'ancienne alerte si elle existe
    const alertRegex = new RegExp(
      `${ALERT_START}[\\s\\S]*?${ALERT_END}\n?`,
      "g"
    );
    memoryContent = memoryContent.replace(alertRegex, "");

    if (activeTasks.length > 0) {
      const alertBlock =
        `${ALERT_START}\n` +
        `## ⚠️ TÂCHE EN COURS — LIRE EN PREMIER\n` +
        `- [in-progress.md](in-progress.md) — **TÂCHE INTERROMPUE À REPRENDRE** : "${activeTasks[0].title}" · Statut: ${activeTasks[0].status} · ${activeTasks[0].nextSteps.length} prochaines étapes documentées\n` +
        `${ALERT_END}\n`;

      // Insérer l'alerte tout en haut du fichier
      memoryContent = alertBlock + memoryContent;
    }

    writeFileSync(MEMORY_INDEX_FILE, memoryContent, "utf8");
  } catch (err) {
    // Ne pas faire planter le serveur si l'écriture échoue
    console.error("[agent-tasks] Erreur lors de la mise à jour de in-progress.md:", err);
  }
}

// ─── Exports publics ──────────────────────────────────────────────────────────

export async function getAllAgentTasks(): Promise<AgentTaskOut[]> {
  const rows = await db
    .select()
    .from(agentTasksTable)
    .orderBy(desc(agentTasksTable.startedAt));
  return rows.map(toOut);
}

export async function getAgentTaskById(id: number): Promise<AgentTaskOut | null> {
  const [row] = await db
    .select()
    .from(agentTasksTable)
    .where(eq(agentTasksTable.id, id))
    .limit(1);
  return row ? toOut(row) : null;
}

export interface CreateAgentTaskInput {
  title: string;
  description: string;
  stepsCompleted?: string[];
  nextSteps?: string[];
  checkpointNotes?: string;
}

export async function createAgentTask(input: CreateAgentTaskInput): Promise<AgentTaskOut> {
  const [row] = await db
    .insert(agentTasksTable)
    .values({
      title: input.title,
      description: input.description,
      status: "in_progress",
      stepsCompleted: JSON.stringify(input.stepsCompleted ?? []),
      nextSteps: JSON.stringify(input.nextSteps ?? []),
      checkpointNotes: input.checkpointNotes ?? "",
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  const task = toOut(row);
  const allTasks = await getAllAgentTasks();
  syncInProgressFile(allTasks);
  return task;
}

export interface UpdateAgentTaskInput {
  title?: string;
  description?: string;
  status?: AgentTaskStatus;
  stepsCompleted?: string[];
  nextSteps?: string[];
  checkpointNotes?: string;
}

export async function updateAgentTask(
  id: number,
  input: UpdateAgentTaskInput
): Promise<AgentTaskOut | null> {
  const now = new Date();

  const updates: Partial<typeof agentTasksTable.$inferInsert> = {
    updatedAt: now,
  };
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.status !== undefined) {
    updates.status = input.status;
    if (input.status === "paused") updates.pausedAt = now;
    if (input.status === "completed") updates.completedAt = now;
  }
  if (input.stepsCompleted !== undefined)
    updates.stepsCompleted = JSON.stringify(input.stepsCompleted);
  if (input.nextSteps !== undefined)
    updates.nextSteps = JSON.stringify(input.nextSteps);
  if (input.checkpointNotes !== undefined)
    updates.checkpointNotes = input.checkpointNotes;

  const [row] = await db
    .update(agentTasksTable)
    .set(updates)
    .where(eq(agentTasksTable.id, id))
    .returning();

  if (!row) return null;

  const task = toOut(row);
  const allTasks = await getAllAgentTasks();
  syncInProgressFile(allTasks);
  return task;
}

export async function deleteAgentTask(id: number): Promise<boolean> {
  const result = await db
    .delete(agentTasksTable)
    .where(eq(agentTasksTable.id, id))
    .returning();

  if (result.length > 0) {
    const allTasks = await getAllAgentTasks();
    syncInProgressFile(allTasks);
  }
  return result.length > 0;
}
