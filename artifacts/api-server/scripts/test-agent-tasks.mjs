/**
 * Script de test — vérifie que le système de continuité des tâches fonctionne :
 * 1. Lit les tâches en pause dans la DB
 * 2. Écrit in-progress.md dans .agents/memory/
 * 3. Met à jour MEMORY.md avec l'alerte ⚠️
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const WORKSPACE_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const MEMORY_DIR = resolve(WORKSPACE_ROOT, ".agents/memory");
const IN_PROGRESS_FILE = resolve(MEMORY_DIR, "in-progress.md");
const MEMORY_INDEX_FILE = resolve(MEMORY_DIR, "MEMORY.md");

console.log("📂 WORKSPACE_ROOT:", WORKSPACE_ROOT);
console.log("📂 MEMORY_DIR:", MEMORY_DIR);
console.log("📂 Fichier cible:", IN_PROGRESS_FILE);
console.log("");

if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });

// 1. Lire les tâches actives depuis la DB
const { rows } = await pool.query(
  "SELECT * FROM agent_tasks WHERE status IN ('in_progress','paused') ORDER BY started_at DESC"
);

const tasks = rows.map((row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  status: row.status,
  stepsCompleted: JSON.parse(row.steps_completed || "[]"),
  nextSteps: JSON.parse(row.next_steps || "[]"),
  checkpointNotes: row.checkpoint_notes || "",
  pausedAt: row.paused_at ? row.paused_at.toISOString() : null,
  updatedAt: row.updated_at.toISOString(),
}));

console.log(`✅ ${tasks.length} tâche(s) active(s) trouvée(s) en DB`);
tasks.forEach((t) => console.log(`   #${t.id} "${t.title}" [${t.status}]`));
console.log("");

// 2. Écrire in-progress.md
if (tasks.length > 0) {
  const lines = [
    "---",
    "name: In-progress agent task",
    "description: TÂCHE EN COURS — reprendre immédiatement avant tout autre travail",
    "---",
    "",
    "# ⚠️ TÂCHE EN COURS — À REPRENDRE EN PRIORITÉ",
    "",
    "> **Pour tout nouvel agent démarrant dans ce projet :**",
    "> Lis ce fichier AVANT de commencer quoi que ce soit.",
    "> Une tâche a été interrompue (limite d'utilisation atteinte) et doit être reprise.",
    "> Appelle `GET /api/agent-tasks` pour les détails complets depuis la base de données.",
    "",
  ];

  for (const task of tasks) {
    const label = task.status === "paused" ? "⏸️ EN PAUSE" : "▶️ EN COURS";
    lines.push(`## ${label} — ${task.title} (ID: ${task.id})`);
    lines.push("");
    lines.push("**Instructions d'origine :**");
    lines.push(task.description);
    lines.push("");
    if (task.stepsCompleted.length > 0) {
      lines.push("**✅ Étapes déjà complétées :**");
      task.stepsCompleted.forEach((s) => lines.push("- " + s));
      lines.push("");
    }
    if (task.nextSteps.length > 0) {
      lines.push("**➡️ PROCHAINES ÉTAPES (reprendre ici) :**");
      task.nextSteps.forEach((s) => lines.push("- " + s));
      lines.push("");
    }
    if (task.checkpointNotes.trim()) {
      lines.push("**📝 Notes techniques de reprise :**");
      lines.push("```");
      lines.push(task.checkpointNotes);
      lines.push("```");
      lines.push("");
    }
    lines.push(`*Mis en pause le : ${task.pausedAt ?? task.updatedAt}*`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  writeFileSync(IN_PROGRESS_FILE, lines.join("\n"), "utf8");
  console.log("✅ in-progress.md écrit avec succès");

  // 3. Mettre à jour MEMORY.md
  const S = "<!-- AGENT_TASK_ALERT_START -->";
  const E = "<!-- AGENT_TASK_ALERT_END -->";
  let mem = existsSync(MEMORY_INDEX_FILE) ? readFileSync(MEMORY_INDEX_FILE, "utf8") : "";
  mem = mem.replace(new RegExp(`${S}[\\s\\S]*?${E}\n?`, "g"), "");
  const alert =
    `${S}\n` +
    `## ⚠️ TÂCHE EN COURS — LIRE EN PREMIER\n` +
    `- [in-progress.md](in-progress.md) — **TÂCHE INTERROMPUE À REPRENDRE** : "${tasks[0].title}" · Statut: ${tasks[0].status} · ${tasks[0].nextSteps.length} prochaines étapes documentées\n` +
    `${E}\n`;
  writeFileSync(MEMORY_INDEX_FILE, alert + mem, "utf8");
  console.log("✅ MEMORY.md mis à jour avec l'alerte ⚠️");
} else {
  writeFileSync(
    IN_PROGRESS_FILE,
    "---\nname: In-progress agent task\ndescription: Aucune tâche en cours\n---\n\n# Aucune tâche en cours\n\nToutes les tâches sont terminées.\n",
    "utf8"
  );
  console.log("ℹ️  Aucune tâche active — in-progress.md réinitialisé");
}

// 4. Afficher le contenu des fichiers générés
console.log("\n─── Contenu de in-progress.md ────────────────────────");
console.log(readFileSync(IN_PROGRESS_FILE, "utf8"));

console.log("─── Contenu de MEMORY.md ──────────────────────────────");
console.log(readFileSync(MEMORY_INDEX_FILE, "utf8"));

await pool.end();
console.log("\n✅ Test complet réussi !");
