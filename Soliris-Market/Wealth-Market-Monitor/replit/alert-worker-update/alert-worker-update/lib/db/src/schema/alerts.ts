import { pgTable, serial, text, timestamp, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  name: text("name"),
  condition: text("condition").notNull(), // "above" | "below"
  targetPrice: numeric("target_price", { precision: 18, scale: 6 }).notNull(),
  active: boolean("active").default(true).notNull(),
  triggeredAt: timestamp("triggered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Optional per-alert destination. Falls back to ALERT_NOTIFY_EMAIL env var
  // when null — see lib/emailClient.ts.
  notifyEmail: text("notify_email"),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true, active: true, triggeredAt: true, createdAt: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
