import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Abonnements Web Push (un par navigateur/appareil). Permet au serveur
// d'envoyer des notifications même quand le navigateur est complètement
// fermé (Chrome/Edge desktop, Android). L'endpoint est unique : un
// ré-abonnement du même navigateur remplace la ligne existante (upsert).
export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  // Clés fournies par le navigateur (PushSubscription.getKey) — nécessaires
  // pour chiffrer le contenu de chaque notification.
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PushSubscriptionRow = typeof pushSubscriptionsTable.$inferSelect;
