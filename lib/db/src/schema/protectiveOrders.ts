import { pgTable, bigserial, text, numeric, timestamp, bigint, integer, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const protectiveOrdersTable = pgTable("protective_orders", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  accountId: text("account_id").notNull(),
  positionSymbol: text("position_symbol").notNull(),
  parentOrderId: text("parent_order_id").notNull(),
  kind: text("kind").notNull(),
  triggerPrice: numeric("trigger_price", { precision: 24, scale: 10 }).notNull(),
  quantity: numeric("quantity", { precision: 24, scale: 10 }).notNull(),
  brokerOrderId: text("broker_order_id"),
  status: text("status").default("pending").notNull(),
  failureCount: integer("failure_count").default(0).notNull(),
  emergencyCloseIssued: boolean("emergency_close_issued").default(false).notNull(),
  siblingId: bigint("sibling_id", { mode: "number" }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("protective_orders_parent_kind_idx").on(table.accountId, table.parentOrderId, table.kind),
  index("protective_orders_open_idx").on(table.accountId, table.status),
]);

export const insertProtectiveOrderSchema = createInsertSchema(protectiveOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProtectiveOrder = z.infer<typeof insertProtectiveOrderSchema>;
export type ProtectiveOrder = typeof protectiveOrdersTable.$inferSelect;