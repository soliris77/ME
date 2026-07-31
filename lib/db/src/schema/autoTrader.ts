import { pgTable, serial, text, timestamp, boolean, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Règles d'auto-trading ─────────────────────────────────────────────────────
// Chaque règle surveille un symbole et passe automatiquement un ordre dès que
// le score de signal technique atteint le seuil configuré.
export const autoTradeRulesTable = pgTable("auto_trade_rules", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  name: text("name"),                              // libellé libre ex: "Apple — achat fort"

  enabled: boolean("enabled").default(true).notNull(),

  // Direction : "buy" | "sell" | "both"
  sideMode: text("side_mode").default("both").notNull(),

  // Score minimum pour déclencher (0-100). 60 = FORT ACHAT / FORTE VENTE
  minScore: integer("min_score").default(60).notNull(),

  // Quantité fixe par ordre (en actions)
  quantity: numeric("quantity", { precision: 18, scale: 8 }).default("1").notNull(),

  // Compte courtier à utiliser (null = compte par défaut)
  accountId: text("account_id"),

  // Stop-loss en % sous le prix d'entrée (null = désactivé)
  stopLossPct: numeric("stop_loss_pct", { precision: 6, scale: 2 }),

  // Take-profit en % au-dessus du prix d'entrée (null = désactivé)
  takeProfitPct: numeric("take_profit_pct", { precision: 6, scale: 2 }),

  // Trailing stop en % sous le plus-haut atteint depuis l'entrée (null = désactivé)
  trailingStopPct: numeric("trailing_stop_pct", { precision: 6, scale: 2 }),

  // Plus-haut atteint depuis l'ouverture de la position (pour le trailing stop)
  highWaterMark: numeric("high_water_mark", { precision: 18, scale: 6 }),

  // Mode de dimensionnement : "fixed" (quantité fixe) | "risk" (montant risqué)
  sizingMode: text("sizing_mode").default("fixed").notNull(),

  // Montant en $ risqué par trade (utilisé si sizingMode = "risk" avec stopLossPct)
  riskAmount: numeric("risk_amount", { precision: 18, scale: 2 }),

  // Exiger que le signal hebdomadaire (1wk) confirme la même direction
  confirmWeekly: boolean("confirm_weekly").default(false).notNull(),

  // Nombre max d'ordres automatiques par jour (reinitialisé à minuit UTC)
  maxTradesPerDay: integer("max_trades_per_day").default(3).notNull(),

  // Notifier même sans passer d'ordre (signal fort sans auto-trade)
  notifyOnSignal: boolean("notify_on_signal").default(true).notNull(),

  // Cooldown minimum entre deux ordres auto (en minutes)
  cooldownMinutes: integer("cooldown_minutes").default(240).notNull(),

  // Statistiques courantes
  tradesToday: integer("trades_today").default(0).notNull(),
  tradesTodayResetAt: timestamp("trades_today_reset_at"),
  lastTriggeredAt: timestamp("last_triggered_at"),
  lastSignalScore: integer("last_signal_score"),
  lastSignalVerdict: text("last_signal_verdict"),

  // Tracking de position ouverte (pour stop-loss / take-profit)
  // null = aucune position ouverte sous cette règle
  openEntryPrice: numeric("open_entry_price", { precision: 18, scale: 6 }),
  openQuantity:   numeric("open_quantity",    { precision: 18, scale: 8 }),
  openSince:      timestamp("open_since"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Logs d'exécution auto-trade ───────────────────────────────────────────────
// Historique de chaque déclenchement (ordre passé ou signal seulement notifié).
export const autoTradeLogsTable = pgTable("auto_trade_logs", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),                    // "BUY" | "SELL"
  triggerType: text("trigger_type").notNull(),     // "order" | "notification_only" | "stop_loss" | "take_profit"
  signalScore: integer("signal_score"),
  signalVerdict: text("signal_verdict"),
  price: numeric("price", { precision: 18, scale: 6 }),
  quantity: numeric("quantity", { precision: 18, scale: 8 }),
  orderId: integer("order_id"),                    // référence à orders.id si un ordre a été passé
  notificationSent: boolean("notification_sent").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAutoTradeRuleSchema = createInsertSchema(autoTradeRulesTable).omit({
  id: true, createdAt: true, updatedAt: true,
  tradesToday: true, tradesTodayResetAt: true,
  lastTriggeredAt: true, lastSignalScore: true, lastSignalVerdict: true,
});
export type InsertAutoTradeRule = z.infer<typeof insertAutoTradeRuleSchema>;
export type AutoTradeRule = typeof autoTradeRulesTable.$inferSelect;
export type AutoTradeLog = typeof autoTradeLogsTable.$inferSelect;
