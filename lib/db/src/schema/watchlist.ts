import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
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

// Métadonnées des listes personnalisées : ordre d'affichage persisté.
// Les listes "implicites" (présentes seulement via watchlist.list_name) sont
// fusionnées à la volée côté API ; cette table permet aussi de conserver une
// liste vide (après suppression du dernier actif, ou créée à l'avance).
export const watchlistListsTable = pgTable("watchlist_lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  position: integer("position").notNull().default(0),
});

export type WatchlistList = typeof watchlistListsTable.$inferSelect;

export const insertWatchlistSchema = createInsertSchema(watchlistTable).omit({ id: true, addedAt: true });
export type InsertWatchlistItem = z.infer<typeof insertWatchlistSchema>;
export type WatchlistItem = typeof watchlistTable.$inferSelect;
