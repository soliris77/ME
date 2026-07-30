/**
 * Gestion de la persistance des tâches d'agents IA.
 * ─────────────────────────────────────────────────────────────────────────────
 * Permet à un agent de sauvegarder son état d'avancement avant d'atteindre une
 * limite d'utilisation, afin qu'un agent suivant (dans un remix) puisse reprendre
 * exactement là où le précédent s'est arrêté.
 */
import { db, agentTasksTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

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
  return toOut(row);
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
  return row ? toOut(row) : null;
}

export async function deleteAgentTask(id: number): Promise<boolean> {
  const result = await db
    .delete(agentTasksTable)
    .where(eq(agentTasksTable.id, id))
    .returning();
  return result.length > 0;
}
