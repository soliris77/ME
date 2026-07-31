import { pgTable, serial, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Thèse d'investissement par titre : pourquoi j'ai acheté, où je veux aller
// (prix cible) et surtout ce qui invaliderait la thèse (seuil d'invalidation).
// Discipline de base : on ne garde pas une position dont la thèse est invalidée.
export const investmentThesesTable = pgTable("investment_theses", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  reason: text("reason").notNull(),
  // numeric → string côté TS pour éviter les erreurs de flottants.
  targetPrice: numeric("target_price"),
  invalidationPrice: numeric("invalidation_price"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertThesisSchema = createInsertSchema(investmentThesesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertThesis = z.infer<typeof insertThesisSchema>;
export type InvestmentThesis = typeof investmentThesesTable.$inferSelect;
