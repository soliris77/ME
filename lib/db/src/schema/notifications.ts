import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * Historique des notifications envoyées — une ligne par déclenchement
 * d'alerte (prix, pattern ou signal), écrite par l'alertWorker au moment de
 * l'envoi. Sert au centre de notifications in-app : liste chronologique avec
 * heure exacte + badge « non lu » (read_at IS NULL) jusqu'à consultation.
 * Indépendante de la table alerts : supprimer une alerte ne fait pas
 * disparaître l'historique.
 */
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  alertId: integer("alert_id"), // pas de FK : l'historique survit à la suppression de l'alerte
  symbol: text("symbol").notNull(),
  name: text("name"),
  alertType: text("alert_type").notNull(), // "price" | "pattern" | "signal"
  title: text("title").notNull(),
  body: text("body").notNull(),
  channels: text("channels").default("push").notNull(), // ex: "push,email,sms"
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  readAt: timestamp("read_at"), // null = non lu
});

export type NotificationRecord = typeof notificationsTable.$inferSelect;
