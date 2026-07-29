import { pgTable, serial, text, timestamp, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  name: text("name"),
  // "price" | "pattern" | "signal". Pour "signal" : on réutilise patternSignal
  // ("haussier" = notifie seulement sur ACHAT/FORT ACHAT, "baissier" = seulement
  // VENTE/FORTE VENTE, null = les deux) et minStrength ("moyen" = ACHAT+/VENTE+,
  // "fort" = seulement FORT ACHAT/FORTE VENTE) — mêmes colonnes que les alertes
  // de pattern, sémantique adaptée.
  alertType: text("alert_type").default("price").notNull(),
  condition: text("condition"), // "above" | "below" — utilisé seulement pour alertType = "price"
  targetPrice: numeric("target_price", { precision: 18, scale: 6 }), // utilisé seulement pour alertType = "price"
  // --- Champs spécifiques aux alertes de pattern/signal ---
  patternSignal: text("pattern_signal"), // "haussier" | "baissier" | null (= les deux)
  minStrength: text("min_strength"), // "faible" | "moyen" | "fort" | null (= n'importe laquelle)
  active: boolean("active").default(true).notNull(),
  triggeredAt: timestamp("triggered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Optional per-alert destination. Falls back to the global notification
  // preferences (email/téléphone) when null — voir lib/notificationPrefs.ts.
  notifyEmail: text("notify_email"),
  // Numéro de téléphone (E.164) pour le SMS — même logique de fallback que
  // notifyEmail : si vide, on utilise le téléphone des préférences globales.
  notifyPhone: text("notify_phone"),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true, active: true, triggeredAt: true, createdAt: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
