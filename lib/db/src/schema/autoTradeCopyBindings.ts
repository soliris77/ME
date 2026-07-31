/**
 * Liaisons copy-trading → auto-trader (opt-in explicite)
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque ligne associe une règle d'auto-trading (`auto_trade_rules`) à un trader
 * suivi (`followed_traders`). Quand le sync copy-trading détecte un nouveau trade
 * chez ce trader, un signal normalisé est émis et — si une liaison ACTIVE existe
 * pour un symbole correspondant à la règle — l'auto-trader soumet un ordre via le
 * même pipeline de risque que les signaux techniques.
 *
 * C'est une source de signal OPTIONNELLE : sans liaison, l'auto-trader et le
 * copy-trading fonctionnent exactement comme avant.
 */
import { pgTable, serial, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { autoTradeRulesTable } from "./autoTrader";
import { followedTradersTable } from "./copyTrading";

export const autoTradeCopyBindingsTable = pgTable(
  "auto_trade_copy_bindings",
  {
    id: serial("id").primaryKey(),
    ruleId: integer("rule_id")
      .notNull()
      .references(() => autoTradeRulesTable.id, { onDelete: "cascade" }),
    followedTraderId: integer("followed_trader_id")
      .notNull()
      .references(() => followedTradersTable.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("auto_trade_copy_bindings_rule_trader_unique").on(
      table.ruleId,
      table.followedTraderId,
    ),
  ],
);

export const insertAutoTradeCopyBindingSchema = createInsertSchema(autoTradeCopyBindingsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAutoTradeCopyBinding = z.infer<typeof insertAutoTradeCopyBindingSchema>;
export type AutoTradeCopyBinding = typeof autoTradeCopyBindingsTable.$inferSelect;
