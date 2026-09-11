import { pgTable, serial, text, numeric, date, uniqueIndex, timestamp } from "drizzle-orm/pg-core";

export const dailyEquitySnapshotsTable = pgTable("daily_equity_snapshots", {
  id: serial("id").primaryKey(),
  accountIdentity: text("account_identity").notNull(),
  utcDay: date("utc_day").notNull(),
  dayStartEquity: numeric("day_start_equity", { precision: 20, scale: 8 }).notNull(),
  baseCurrency: text("base_currency").notNull().default("USD"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("daily_equity_identity_day_idx").on(table.accountIdentity, table.utcDay)]);

export type DailyEquitySnapshot = typeof dailyEquitySnapshotsTable.$inferSelect;