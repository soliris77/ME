import { pgTable, serial, text, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const marketLimitsTable = pgTable("market_limits", {
  id: serial("id").primaryKey(),
  accountIdentity: text("account_identity").notNull(),
  symbol: text("symbol").notNull(),
  minQuantity: numeric("min_quantity", { precision: 30, scale: 12 }).notNull(),
  quantityStep: numeric("quantity_step", { precision: 30, scale: 12 }).notNull(),
  priceStep: numeric("price_step", { precision: 30, scale: 12 }).notNull(),
  minNotional: numeric("min_notional", { precision: 30, scale: 12 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("market_limits_account_symbol_idx").on(table.accountIdentity, table.symbol)]);