import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Suivi de progression de la section "Apprendre à trader". App mono-utilisateur
// (voir single-password auth) — pas de userId : une ligne par section (identifiée
// par son slug d'onglet : "bases", "chandeliers", "strategies", "risques",
// "glossaire"). Stocké côté serveur plutôt qu'en localStorage pour survivre au
// changement d'appareil/navigateur, comme le reste des données utilisateur.
export const learnProgressTable = pgTable("learn_progress", {
  id: serial("id").primaryKey(),
  sectionId: text("section_id").notNull().unique(),
  completed: boolean("completed").default(false).notNull(),
  // Score du quiz de fin de section (nb de bonnes réponses), null si la
  // section n'a pas de quiz (ex: glossaire) ou n'a pas encore été tentée.
  quizScore: integer("quiz_score"),
  quizTotal: integer("quiz_total"),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLearnProgressSchema = createInsertSchema(learnProgressTable).omit({ id: true, updatedAt: true });
export type InsertLearnProgress = z.infer<typeof insertLearnProgressSchema>;
export type LearnProgress = typeof learnProgressTable.$inferSelect;
