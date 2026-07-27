/**
 * Progression de la section "Apprendre à trader" (/apprendre).
 * ─────────────────────────────────────────────────────────────────────────────
 * App mono-utilisateur : une ligne par section (identifiée par un `sectionId`
 * texte libre — "bases", "chandeliers", "strategies", "risques", "glossaire").
 * Stocké côté serveur (pas localStorage) pour suivre l'utilisateur peu importe
 * l'appareil/navigateur utilisé, comme le reste des données de l'app.
 */
import { db, learnProgressTable, type LearnProgress } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface LearnProgressOut {
  sectionId: string;
  completed: boolean;
  quizScore: number | null;
  quizTotal: number | null;
  completedAt: string | null;
  updatedAt: string;
}

function toOut(row: LearnProgress): LearnProgressOut {
  return {
    sectionId: row.sectionId,
    completed: row.completed,
    quizScore: row.quizScore ?? null,
    quizTotal: row.quizTotal ?? null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getAllLearnProgress(): Promise<LearnProgressOut[]> {
  const rows = await db.select().from(learnProgressTable);
  return rows.map(toOut);
}

export interface MarkLearnProgressInput {
  completed: boolean;
  quizScore?: number;
  quizTotal?: number;
}

export async function markLearnProgress(sectionId: string, input: MarkLearnProgressInput): Promise<LearnProgressOut> {
  const [existing] = await db.select().from(learnProgressTable).where(eq(learnProgressTable.sectionId, sectionId)).limit(1);

  const now = new Date();
  const values = {
    completed: input.completed,
    quizScore: input.quizScore ?? null,
    quizTotal: input.quizTotal ?? null,
    completedAt: input.completed ? now : null,
    updatedAt: now,
  };

  const [row] = existing
    ? await db.update(learnProgressTable).set(values).where(eq(learnProgressTable.sectionId, sectionId)).returning()
    : await db.insert(learnProgressTable).values({ sectionId, ...values }).returning();

  return toOut(row);
}
