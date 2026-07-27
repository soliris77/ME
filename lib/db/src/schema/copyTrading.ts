/**
 * Copy Trading — schéma Drizzle
 *
 * Adapté pour l'architecture mono-utilisateur de Soliris Market :
 * - Pas de FK userId (pas de table users — session unique)
 * - Table MT nommée `mt_connections` pour éviter le conflit avec
 *   `broker_connections` déjà utilisé par l'intégration SnapTrade.
 */
import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Connexion compte MetaTrader (via MetaApi.cloud) ──────────────────────────
// Une seule ligne attendue (mono-utilisateur).
// Les identifiants sont stockés chiffrés (AES-256-GCM) — jamais en clair.
export const mtConnectionsTable = pgTable("mt_connections", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull().default("metatrader"), // "metatrader"
  // Identifiants de connexion au compte MT (chiffrés AES-256-GCM)
  encryptedLogin: text("encrypted_login").notNull(),          // numéro de compte MT
  encryptedInvestorPassword: text("encrypted_investor_password").notNull(), // mdp investisseur (lecture seule)
  brokerServer: text("broker_server").notNull(),              // ex. "Exness-Real3"
  // accountId retourné par l'API de provisioning MetaApi
  metaApiAccountId: text("meta_api_account_id"),
  isActive: boolean("is_active").default(true).notNull(),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
  lastSyncAt: timestamp("last_sync_at"),
});

export const insertMtConnectionSchema = createInsertSchema(mtConnectionsTable).omit({
  id: true,
  connectedAt: true,
});
export type InsertMtConnection = z.infer<typeof insertMtConnectionSchema>;
export type MtConnection = typeof mtConnectionsTable.$inferSelect;

// ─── Traders suivis ────────────────────────────────────────────────────────────
// Un "trader suivi" est une stratégie CopyFactory publiée par un leader externe.
// L'utilisateur choisit le mode notification ou exécution automatique.
export const followedTradersTable = pgTable(
  "followed_traders",
  {
    id: serial("id").primaryKey(),
    mtConnectionId: serial("mt_connection_id")
      .notNull()
      .references(() => mtConnectionsTable.id),
    // Identifiant de la stratégie CopyFactory (côté MetaApi)
    externalStrategyId: text("external_strategy_id").notNull(),
    traderDisplayName: text("trader_display_name"),
    // false = notification seulement (valeur par défaut imposée)
    // true = exécution automatique via CopyFactory (opt-in explicite)
    autoExecute: boolean("auto_execute").default(false).notNull(),
    // Règles de risque (toutes optionnelles — null = pas de limite)
    maxAmountPerTrade: numeric("max_amount_per_trade"),
    maxPercentOfCapital: numeric("max_percent_of_capital"),
    stopLossGlobalPercent: numeric("stop_loss_global_percent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("followed_traders_strategy_idx").on(table.externalStrategyId),
  ],
);

export const insertFollowedTraderSchema = createInsertSchema(followedTradersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertFollowedTrader = z.infer<typeof insertFollowedTraderSchema>;
export type FollowedTrader = typeof followedTradersTable.$inferSelect;

// ─── Trades copiés / notifiés ──────────────────────────────────────────────────
// Historique des trades détectés chez un trader suivi, avec leur statut dans
// le cycle de vie : notifié → validé/exécuté ou rejeté.
export const copiedTradesTable = pgTable("copied_trades", {
  id: serial("id").primaryKey(),
  followedTraderId: serial("followed_trader_id")
    .notNull()
    .references(() => followedTradersTable.id),
  // Identifiant unique du trade côté MetaApi (idempotence)
  externalTradeId: text("external_trade_id").notNull(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(), // "buy" | "sell"
  originalAmount: numeric("original_amount"),
  copiedAmount: numeric("copied_amount"),
  // pending → notified → executed | rejected | failed
  status: text("status").notNull().default("pending"),
  openedAt: timestamp("opened_at"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCopiedTradeSchema = createInsertSchema(copiedTradesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCopiedTrade = z.infer<typeof insertCopiedTradeSchema>;
export type CopiedTrade = typeof copiedTradesTable.$inferSelect;
