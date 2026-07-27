import { pgTable, serial, text, timestamp, jsonb, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Une seule ligne pour l'instant — l'app est mono-utilisateur. Contient les
// identifiants générés par SnapTrade pour enregistrer notre unique "utilisateur"
// auprès d'eux, ainsi que la liste brute des comptes/positions renvoyée par
// leur API (mise en cache pour éviter d'interroger SnapTrade à chaque requête).
export const brokerConnectionsTable = pgTable("broker_connections", {
  id: serial("id").primaryKey(),
  provider: text("provider").default("snaptrade").notNull(),
  snaptradeUserId: text("snaptrade_user_id").notNull(),
  snaptradeUserSecret: text("snaptrade_user_secret").notNull(),
  status: text("status").default("pending").notNull(), // pending | connected | error
  lastSyncedAt: timestamp("last_synced_at"),
  accounts: jsonb("accounts").$type<Record<string, unknown>[]>().default([]),
  // Kill-switch : bloque tout nouvel ordre live jusqu'à réactivation manuelle.
  // Persisté en base pour survivre aux redémarrages du serveur.
  tradingHalted: boolean("trading_halted").default(false).notNull(),
  haltedAt: timestamp("halted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBrokerConnectionSchema = createInsertSchema(brokerConnectionsTable).omit({ id: true, createdAt: true });
export type InsertBrokerConnection = z.infer<typeof insertBrokerConnectionSchema>;
export type BrokerConnection = typeof brokerConnectionsTable.$inferSelect;

// --- Ordres soumis par le moteur de trading automatisé ---
// signalId est l'identifiant unique d'idempotence : un même signal ne doit
// jamais générer deux ordres, même en cas de retry réseau ou de redémarrage.
export const ordersTable = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    signalId: text("signal_id").notNull(), // identifiant unique du signal source (idempotence)
    symbol: text("symbol").notNull(),
    side: text("side").notNull(), // "buy" | "sell"
    quantity: text("quantity").notNull(), // texte pour éviter les soucis d'arrondi (converti en nombre au besoin)
    orderType: text("order_type").default("market").notNull(),
    mode: text("mode").notNull(), // "paper" | "live" — copie figée de TRADING_MODE au moment de l'ordre
    status: text("status").default("pending").notNull(), // pending | submitted | filled | partially_filled | rejected | error
    expectedPrice: text("expected_price"),
    fillPrice: text("fill_price"),
    filledQuantity: text("filled_quantity"),
    snaptradeOrderId: text("snaptrade_order_id"),
    brokerAccountId: text("broker_account_id"),
    errorMessage: text("error_message"),
    submittedAt: timestamp("submitted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("orders_signal_id_idx").on(table.signalId)],
);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;

// --- Signaux rejetés par les garde-fous de risque (jamais envoyés au courtier) ---
export const rejectedSignalsTable = pgTable("rejected_signals", {
  id: serial("id").primaryKey(),
  signalId: text("signal_id").notNull(),
  symbol: text("symbol").notNull(),
  reason: text("reason").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRejectedSignalSchema = createInsertSchema(rejectedSignalsTable).omit({ id: true, createdAt: true });
export type InsertRejectedSignal = z.infer<typeof insertRejectedSignalSchema>;
export type RejectedSignal = typeof rejectedSignalsTable.$inferSelect;
