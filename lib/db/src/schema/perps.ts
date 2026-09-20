import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  numeric,
  integer,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// — Réglages des contrats perpétuels à levier
// Une ligne par plateforme. La double serrure vit ici : `enabled` autorise
// le worker à tourner, `mode` autorise l'envoi d'ordres. Les deux défauts
// sont fermés, et ils le restent tant que personne ne les ouvre à la main.
export const perpsSettingsTable = pgTable(
  "perps_settings",
  {
    id: serial("id").primaryKey(),
    venue: text("venue").default("hyperliquid").notNull(),

    enabled: boolean("enabled").default(false).notNull(),
    // "shadow" (calcule et journalise) | "armed" (envoie des ordres)
    mode: text("mode").default("shadow").notNull(),

    // Part du capital risquée par trade. 0.005 = 0,5 %.
    riskFraction: numeric("risk_fraction", { precision: 10, scale: 6 })
      .default("0.005")
      .notNull(),
    maxLeverage: numeric("max_leverage", { precision: 10, scale: 2 })
      .default("3")
      .notNull(),
    maxTotalLeverage: numeric("max_total_leverage", { precision: 10, scale: 2 })
      .default("3")
      .notNull(),
    maxOpenPositions: integer("max_open_positions").default(3).notNull(),
    maxTradesPerDay: integer("max_trades_per_day").default(6).notNull(),
    // Budget de frais quotidien, en fraction du capital.
    maxDailyCostFraction: numeric("max_daily_cost_fraction", { precision: 10, scale: 6 })
      .default("0.02")
      .notNull(),
    // Coupe-circuit : perte réalisée du jour au-delà de laquelle on s'arrête.
    dailyLossLimitFraction: numeric("daily_loss_limit_fraction", {
      precision: 10,
      scale: 6,
    })
      .default("0.03")
      .notNull(),
    liquidationBuffer: numeric("liquidation_buffer", { precision: 10, scale: 2 })
      .default("2.5")
      .notNull(),
    minSampleSize: integer("min_sample_size").default(100).notNull(),
    // Décisions en mode fantôme exigées avant de pouvoir armer.
    minShadowDecisions: integer("min_shadow_decisions").default(200).notNull(),

    // Hypothèses de coût. Mieux vaut les surestimer que l'inverse.
    assumedSlippagePerSide: numeric("assumed_slippage_per_side", {
      precision: 10,
      scale: 6,
    })
      .default("0.0002")
      .notNull(),
    assumedFundingPerTrade: numeric("assumed_funding_per_trade", {
      precision: 10,
      scale: 6,
    })
      .default("0.0005")
      .notNull(),

  // Frais fixe par cote, en dollars, quelle que soit la taille.
  // Nul sur une plateforme centralisee ; sur GMX, le gaz du keeper.
  assumedFixedCostUsd: numeric("assumed_fixed_cost_usd", { precision: 12, scale: 4 })
    .default("0")
    .notNull(),

    // Capital de référence en mode fantôme, tant qu'aucun compte n'est
    // branché. Il ne dimensionne que des décisions qui ne partent pas.
    shadowEquityUsd: numeric("shadow_equity_usd", { precision: 30, scale: 12 })
      .default("1000")
      .notNull(),

    armedAt: timestamp("armed_at"),
    disarmedAt: timestamp("disarmed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("perps_settings_venue_idx").on(table.venue)],
);

// — Journal des décisions
// Une ligne par occasion évaluée, armé ou non. C'est cette table qui, au
// bout de quelques centaines de lignes, dira si le bord existe vraiment.
// Sans elle, armer reviendrait à parier sur une intuition.
export const perpsDecisionsTable = pgTable(
  "perps_decisions",
  {
    id: serial("id").primaryKey(),
    venue: text("venue").notNull(),
    symbol: text("symbol").notNull(),
    side: text("side").notNull(), // "long" | "short"
    mode: text("mode").notNull(), // mode en vigueur au moment du calcul

    allowed: boolean("allowed").notNull(),
    executed: boolean("executed").default(false).notNull(),

    // Listes sérialisées en JSON — lisibles à l'œil nu dans psql.
    refusals: text("refusals"),
    holds: text("holds"),
    reasons: text("reasons"),

    entryPrice: numeric("entry_price", { precision: 30, scale: 12 }),
    stopPrice: numeric("stop_price", { precision: 30, scale: 12 }),
    size: numeric("size", { precision: 30, scale: 12 }),
    notionalUsd: numeric("notional_usd", { precision: 30, scale: 12 }),
    leverageToSet: integer("leverage_to_set"),
    effectiveLeverage: numeric("effective_leverage", { precision: 18, scale: 6 }),
    liquidationPrice: numeric("liquidation_price", { precision: 30, scale: 12 }),
    riskUsd: numeric("risk_usd", { precision: 30, scale: 12 }),
    estimatedRoundTripUsd: numeric("estimated_round_trip_usd", {
      precision: 30,
      scale: 12,
    }),
    roundTripFraction: numeric("round_trip_fraction", { precision: 18, scale: 12 }),

    measuredGrossEdge: numeric("measured_gross_edge", { precision: 18, scale: 12 }),
    sampleSize: integer("sample_size"),
    equityUsd: numeric("equity_usd", { precision: 30, scale: 12 }),

    // Rendement dirigé constaté après coup, en fraction du notionnel.
    // Rempli par le suivi ; c'est lui qui mesure le bord.
    realizedGrossEdge: numeric("realized_gross_edge", { precision: 18, scale: 12 }),
    realizedAt: timestamp("realized_at"),

    // La détection du scanner qui a provoqué cette décision.
    scannerHitId: bigint("scanner_hit_id", { mode: "number" }),
    orderId: integer("order_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("perps_decisions_created_idx").on(table.createdAt),
    index("perps_decisions_symbol_idx").on(table.symbol),
  ],
);

// — Ordres envoyés
// `client_order_id` est unique : c'est ce qui empêche de passer deux fois
// le même ordre après un redémarrage du worker.
export const perpsOrdersTable = pgTable(
  "perps_orders",
  {
    id: serial("id").primaryKey(),
    venue: text("venue").notNull(),
    clientOrderId: text("client_order_id").notNull(),
    venueOrderId: text("venue_order_id"),
    decisionId: integer("decision_id"),

    symbol: text("symbol").notNull(),
    side: text("side").notNull(),
    type: text("type").notNull(), // "market" | "limit"
    size: numeric("size", { precision: 30, scale: 12 }).notNull(),
    leverage: integer("leverage").notNull(),
    limitPrice: numeric("limit_price", { precision: 30, scale: 12 }),
    stopLossPrice: numeric("stop_loss_price", { precision: 30, scale: 12 }),
    takeProfitPrice: numeric("take_profit_price", { precision: 30, scale: 12 }),
    reduceOnly: boolean("reduce_only").default(false).notNull(),

    status: text("status").notNull(),
    filledSize: numeric("filled_size", { precision: 30, scale: 12 })
      .default("0")
      .notNull(),
    averagePrice: numeric("average_price", { precision: 30, scale: 12 }),

    error: text("error"),
    raw: text("raw"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("perps_orders_client_order_id_idx").on(table.clientOrderId),
    index("perps_orders_symbol_idx").on(table.symbol),
  ],
);

// — Positions
// Reflet local de ce que la plateforme rapporte, plus ce qu'elle ne
// rapporte pas : quand la position a été ouverte par nous, et ce qu'elle a
// fini par coûter ou rapporter.
export const perpsPositionsTable = pgTable(
  "perps_positions",
  {
    id: serial("id").primaryKey(),
    venue: text("venue").notNull(),
    symbol: text("symbol").notNull(),
    side: text("side").notNull(),

    size: numeric("size", { precision: 30, scale: 12 }).notNull(),
    entryPrice: numeric("entry_price", { precision: 30, scale: 12 }).notNull(),
    markPrice: numeric("mark_price", { precision: 30, scale: 12 }),
    notionalUsd: numeric("notional_usd", { precision: 30, scale: 12 }).notNull(),
    marginUsd: numeric("margin_usd", { precision: 30, scale: 12 }),
    leverage: numeric("leverage", { precision: 18, scale: 6 }),
    liquidationPrice: numeric("liquidation_price", { precision: 30, scale: 12 }),
    unrealizedPnlUsd: numeric("unrealized_pnl_usd", { precision: 30, scale: 12 }),

    stopPrice: numeric("stop_price", { precision: 30, scale: 12 }),
    decisionId: integer("decision_id"),

    openedAt: timestamp("opened_at").defaultNow().notNull(),
    closedAt: timestamp("closed_at"),
    realizedPnlUsd: numeric("realized_pnl_usd", { precision: 30, scale: 12 }),
    feesPaidUsd: numeric("fees_paid_usd", { precision: 30, scale: 12 }),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (table) => [index("perps_positions_venue_symbol_idx").on(table.venue, table.symbol)],
);

export const insertPerpsSettingsSchema = createInsertSchema(perpsSettingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  armedAt: true,
  disarmedAt: true,
});
export type InsertPerpsSettings = z.infer<typeof insertPerpsSettingsSchema>;
export type PerpsSettingsRow = typeof perpsSettingsTable.$inferSelect;
export type PerpsDecisionRow = typeof perpsDecisionsTable.$inferSelect;
export type PerpsOrderRow = typeof perpsOrdersTable.$inferSelect;
export type PerpsPositionRow = typeof perpsPositionsTable.$inferSelect;
