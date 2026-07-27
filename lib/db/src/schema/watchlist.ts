import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const watchlistTable = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  note: text("note"),
  // Regroupement libre en listes personnalisées (ex: "Techno", "Dividendes",
  // "Spéculatif"). "Général" par défaut pour ne rien casser des entrées
  // existantes créées avant l'ajout de cette fonctionnalité.
  listName: text("list_name").default("Général").notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export const insertWatchlistSchema = createInsertSchema(watchlistTable).omit({ id: true, addedAt: true });
export type InsertWatchlistItem = z.infer<typeof insertWatchlistSchema>;
export type WatchlistItem = typeof watchlistTable.$inferSelect;
