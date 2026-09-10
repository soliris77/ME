import { pgTable, text, numeric, integer, boolean, timestamp, bigserial, jsonb, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const riskSettingsTable = pgTable("risk_settings", {
  accountId: text("account_id").primaryKey(),
  mode: text("mode").notNull().default("dry_run"),
  maxPositionPct: numeric("max_position_pct", { precision: 6, scale: 3 }).notNull().default("5.000"),
  maxDailyLossPct: numeric("max_daily_loss_pct", { precision: 6, scale: 3 }).notNull().default("3.000"),
  maxOrdersPerHour: integer("max_orders_per_hour").notNull().default(10),
  killSwitchActive: boolean("kill_switch_active").notNull().default(false),
  killSwitchReason: text("kill_switch_reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("risk_settings_mode_check", sql`${table.mode} in ('dry_run', 'live')`),
  check("risk_settings_position_pct_check", sql`${table.maxPositionPct} > 0 and ${table.maxPositionPct} <= 100`),
  check("risk_settings_daily_loss_pct_check", sql`${table.maxDailyLossPct} >= 0 and ${table.maxDailyLossPct} <= 100`),
  check("risk_settings_hourly_orders_check", sql`${table.maxOrdersPerHour} >= 0`),
]);

export const orderAuditLogTable = pgTable("order_audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  accountId: text("account_id").notNull(),
  clientOrderId: text("client_order_id").notNull(),
  mode: text("mode").notNull(),
  decision: text("decision").notNull(),
  reason: text("reason"),
  request: jsonb("request").$type<Record<string, unknown>>().notNull(),
  result: jsonb("result").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("order_audit_log_account_time_idx").on(table.accountId, table.createdAt),
  index("order_audit_log_client_order_idx").on(table.accountId, table.clientOrderId, table.createdAt),
  check("order_audit_log_mode_check", sql`${table.mode} in ('dry_run', 'live')`),
  check("order_audit_log_decision_check", sql`${table.decision} in ('allowed', 'blocked', 'adjusted')`),
]);

export type RiskSettings = typeof riskSettingsTable.$inferSelect;
export type OrderAuditLog = typeof orderAuditLogTable.$inferSelect;