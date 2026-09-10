import { pgTable, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";

/** The single durable lease used to fence auto-trader processes. */
export const workerLockTable = pgTable("worker_lock", {
  id: integer("id").primaryKey(),
  ownerToken: text("owner_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Singleton operational telemetry (deliberately contains no credentials). */
export const workerHealthTable = pgTable("worker_health", {
  id: integer("id").primaryKey(),
  lastCycleExecutedAt: timestamp("last_cycle_executed_at", { withTimezone: true }),
  latestCandleAt: timestamp("latest_candle_at", { withTimezone: true }),
  killSwitchActive: boolean("kill_switch_active").default(false).notNull(),
  pendingProtectiveOrderCount: integer("pending_protective_order_count").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});