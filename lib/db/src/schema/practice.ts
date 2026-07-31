import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Événements de pratique du parcours guidé « Apprendre à trader ».
// Certains outils ne laissent aucune trace en base (calculateur de position,
// page corrélation) ou sont des agrégations en lecture seule (débriefing,
// performance). On enregistre donc un événement horodaté à chaque usage réel :
// - côté serveur pour les routes GET consultées (debrief, performance),
// - via POST /api/learn-practice/events pour les outils purement client
//   (calculator, calculator-rr, correlation).
// La validation des exercices (GET /api/learn-practice) combine ces événements
// avec les vraies données (alertes, ordres stop, règles auto-trader…).
export const practiceEventsTable = pgTable("practice_events", {
  id: serial("id").primaryKey(),
  tool: text("tool").notNull(), // "calculator" | "calculator-rr" | "correlation" | "debrief" | "performance"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PracticeEvent = typeof practiceEventsTable.$inferSelect;
