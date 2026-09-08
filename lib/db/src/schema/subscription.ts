import { pgTable, serial, text, timestamp, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * État d'abonnement, tel que Whop le connaît.
 * ──────────────────────────────────────────────────────────────────────────
 * Cette table est la SEULE source de vérité côté application : le frontend ne
 * décide jamais s'il est premium, il le demande au serveur, qui le tient de
 * Whop. Auparavant l'unique vérification (`/api/whop/verify`) recevait
 * l'identifiant d'adhésion depuis le client — n'importe qui pouvait donc
 * revendiquer un abonnement. Rien ici ne vient du navigateur.
 *
 * `subject_id` prépare le passage multi-utilisateurs : aujourd'hui l'app est
 * mono-utilisateur (un seul mot de passe partagé, cf. app_settings), donc une
 * seule ligne existe, celle du propriétaire de l'instance. Le jour où une
 * table d'utilisateurs apparaît, `subject_id` référencera l'utilisateur et
 * tout le reste — middleware, hook, mur de paiement — continue de fonctionner
 * sans changement.
 */
export const subscriptionTable = pgTable(
  "subscription",
  {
    id: serial("id").primaryKey(),
    // "owner" tant que l'app est mono-utilisateur ; l'id d'utilisateur ensuite.
    subjectId: text("subject_id").notNull().default("owner"),
    membershipId: text("membership_id"),
    planId: text("plan_id"),
    productId: text("product_id"),
    // Statut brut renvoyé par Whop : active, trialing, past_due, canceled, expired…
    status: text("status").notNull().default("none"),
    // Verdict calculé côté serveur : l'accès premium est-il ouvert, oui ou non.
    active: boolean("active").notNull().default(false),
    // Fin de la période payée en cours — sert à afficher « renouvellement le … »
    // et à laisser l'accès ouvert jusqu'au bout après une annulation.
    currentPeriodEnd: timestamp("current_period_end"),
    // Horodatage de la dernière interrogation de Whop, pour ne pas marteler
    // leur API à chaque requête (cf. SUBSCRIPTION_TTL_MS).
    lastCheckedAt: timestamp("last_checked_at"),
    // Dernière erreur de synchronisation, affichée dans les réglages plutôt
    // que perdue dans les journaux.
    lastError: text("last_error"),
    // Charge utile brute, utile pour diagnostiquer sans rappeler Whop.
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    subjectUnique: uniqueIndex("subscription_subject_id_unique").on(t.subjectId),
  }),
);

export const insertSubscriptionSchema = createInsertSchema(subscriptionTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionTable.$inferSelect;

/** Statuts Whop qui ouvrent l'accès premium. */
export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "completed"] as const;

/** Statuts qui méritent un avertissement dans l'interface sans couper l'accès. */
export const WARNING_SUBSCRIPTION_STATUSES = ["past_due", "unpaid"] as const;
