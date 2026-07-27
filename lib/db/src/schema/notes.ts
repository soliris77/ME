import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chartNotesTable = pgTable("chart_notes", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  /** ISO 8601 date string of the candle this note is attached to */
  candleDate: text("candle_date").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChartNoteSchema = createInsertSchema(chartNotesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertChartNote = z.infer<typeof insertChartNoteSchema>;
export type ChartNote = typeof chartNotesTable.$inferSelect;
