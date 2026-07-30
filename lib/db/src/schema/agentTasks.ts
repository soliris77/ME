import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Suivi de la progression des tâches des agents IA.
 * ─────────────────────────────────────────────────────────────────────────────
 * Quand un agent est en train de travailler sur une tâche et atteint la limite
 * d'utilisation, il enregistre ici son état d'avancement.
 * Lors d'un remix, le nouvel agent peut lire ce tableau pour reprendre là où
 * l'ancien s'est arrêté.
 *
 * status : 'in_progress' | 'paused' | 'completed' | 'cancelled'
 * stepsCompleted : JSON stringifié — tableau de chaînes décrivant ce qui a été fait
 * nextSteps      : JSON stringifié — tableau de chaînes décrivant ce qui reste à faire
 * checkpointNotes: texte libre — contexte technique important pour reprendre la tâche
 */
export const agentTasksTable = pgTable("agent_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("in_progress"),
  stepsCompleted: text("steps_completed").notNull().default("[]"),
  nextSteps: text("next_steps").notNull().default("[]"),
  checkpointNotes: text("checkpoint_notes").notNull().default(""),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  pausedAt: timestamp("paused_at"),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAgentTaskSchema = createInsertSchema(agentTasksTable).omit({
  id: true,
  startedAt: true,
  updatedAt: true,
});
export type InsertAgentTask = z.infer<typeof insertAgentTaskSchema>;
export type AgentTask = typeof agentTasksTable.$inferSelect;
