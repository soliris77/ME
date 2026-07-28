import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Une seule ligne — paramètres de risque modifiables depuis l'écran Paramètres.
// Au premier démarrage (table vide), l'app se rabat sur les variables
// d'environnement (MAX_ORDER_VALUE, MAX_PORTFOLIO_EXPOSURE) puis crée cette
// ligne — voir api-server/src/lib/settings.ts. Toute modification passe par
// PUT /api/settings et génère systématiquement une entrée dans audit_log.
export const appSettingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  // Texte plutôt que numeric — convention du projet pour les montants (voir orders.quantity)
  // afin d'éviter toute surprise d'arrondi flottant ; converti en nombre à l'usage.
  maxOrderValue: text("max_order_value").notNull(),
  maxPortfolioExposure: text("max_portfolio_exposure").notNull(),
  // Fraction (0–1) de maxOrderValue au-delà de laquelle la confirmation
  // renforcée (délai obligatoire) s'applique dans TradeModal.
  largeOrderFrictionPct: text("large_order_friction_pct").notNull(),
  // Hash bcrypt du mot de passe d'accès, stocké en base pour survivre
  // aux remixes / transferts de projet sans avoir à re-saisir le secret.
  // Si null → pas encore configuré (premier lancement) ou géré par AUTH_PASSWORD.
  passwordHash: text("password_hash"),
  // Consumer key SnapTrade — persisté en base au premier démarrage avec le secret
  // Replit, puis lu depuis la DB en priorité. Survit aux suppressions de secrets
  // et aux remixes sans nécessiter de re-saisie.
  snaptradeConsumerKey: text("snaptrade_consumer_key"),
  // Credentials externes — persistés depuis les secrets Replit au premier
  // démarrage puis lus depuis la DB en priorité. Survivent aux remixes et
  // suppressions de secrets sans re-saisie.
  twilioAccountSid:   text("twilio_account_sid"),
  twilioAuthToken:    text("twilio_auth_token"),
  twilioFromNumber:   text("twilio_from_number"),
  gmailUser:          text("gmail_user"),
  gmailAppPassword:   text("gmail_app_password"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type AppSettings = typeof appSettingsTable.$inferSelect;

// --- Préférences de notification ---
// Une seule ligne — mono-utilisateur, comme app_settings. Remplace l'ancienne
// variable d'environnement ALERT_NOTIFY_EMAIL par une vraie configuration :
// coordonnées (email, téléphone) + canal choisi par type d'événement critique.
// Le SMS coûte par message (Twilio) contrairement à l'email — c'est pourquoi
// chaque type d'événement a son propre canal plutôt qu'un interrupteur global.
// Valeurs possibles pour chaque colonne "*_channel" : "email" | "sms" | "both" | "none".
export const notificationPreferencesTable = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  email: text("email"),
  phone: text("phone"), // E.164, ex. +15145551234
  killSwitchChannel: text("kill_switch_channel").default("email").notNull(),
  largeOrderChannel: text("large_order_channel").default("email").notNull(),
  thresholdChangeChannel: text("threshold_change_channel").default("email").notNull(),
  priceAlertChannel: text("price_alert_channel").default("email").notNull(),
  patternAlertChannel: text("pattern_alert_channel").default("email").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferencesTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;
export type NotificationPreferences = typeof notificationPreferencesTable.$inferSelect;
export type NotificationChannel = "email" | "sms" | "both" | "none";
export const NOTIFICATION_EVENT_TYPES = [
  "killSwitch",
  "largeOrder",
  "thresholdChange",
  "priceAlert",
  "patternAlert",
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

// --- Journal d'audit ---
// Trace toute action sensible : changement de seuils, activation/désactivation
// du kill-switch, connexion/déconnexion courtier. Lecture seule depuis l'UI —
// c'est un journal d'événements, jamais modifié ni purgé par l'application.
export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(), // ex. "settings.update", "kill_switch.enable"
  summary: text("summary").notNull(), // description humaine en français, prête à afficher
  details: jsonb("details").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogTable.$inferSelect;
