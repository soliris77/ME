-- Contrats perpétuels à levier : réglages, décisions, ordres, positions.
-- La double serrure est dans les défauts : enabled=false, mode='shadow'.

CREATE TABLE IF NOT EXISTS "perps_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "venue" text DEFAULT 'hyperliquid' NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "mode" text DEFAULT 'shadow' NOT NULL,
  "risk_fraction" numeric(10,6) DEFAULT '0.005' NOT NULL,
  "max_leverage" numeric(10,2) DEFAULT '3' NOT NULL,
  "max_total_leverage" numeric(10,2) DEFAULT '3' NOT NULL,
  "max_open_positions" integer DEFAULT 3 NOT NULL,
  "max_trades_per_day" integer DEFAULT 6 NOT NULL,
  "max_daily_cost_fraction" numeric(10,6) DEFAULT '0.02' NOT NULL,
  "daily_loss_limit_fraction" numeric(10,6) DEFAULT '0.03' NOT NULL,
  "liquidation_buffer" numeric(10,2) DEFAULT '2.5' NOT NULL,
  "min_sample_size" integer DEFAULT 100 NOT NULL,
  "min_shadow_decisions" integer DEFAULT 200 NOT NULL,
  "assumed_slippage_per_side" numeric(10,6) DEFAULT '0.0002' NOT NULL,
  "assumed_funding_per_trade" numeric(10,6) DEFAULT '0.0005' NOT NULL,
  "armed_at" timestamp,
  "disarmed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "perps_settings_venue_idx"
  ON "perps_settings" ("venue");

INSERT INTO "perps_settings" ("venue") VALUES ('hyperliquid')
  ON CONFLICT ("venue") DO NOTHING;

CREATE TABLE IF NOT EXISTS "perps_decisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "venue" text NOT NULL,
  "symbol" text NOT NULL,
  "side" text NOT NULL,
  "mode" text NOT NULL,
  "allowed" boolean NOT NULL,
  "executed" boolean DEFAULT false NOT NULL,
  "refusals" text,
  "holds" text,
  "reasons" text,
  "entry_price" numeric(30,12),
  "stop_price" numeric(30,12),
  "size" numeric(30,12),
  "notional_usd" numeric(30,12),
  "leverage_to_set" integer,
  "effective_leverage" numeric(18,6),
  "liquidation_price" numeric(30,12),
  "risk_usd" numeric(30,12),
  "estimated_round_trip_usd" numeric(30,12),
  "round_trip_fraction" numeric(18,12),
  "measured_gross_edge" numeric(18,12),
  "sample_size" integer,
  "equity_usd" numeric(30,12),
  "realized_gross_edge" numeric(18,12),
  "realized_at" timestamp,
  "order_id" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "perps_decisions_created_idx"
  ON "perps_decisions" ("created_at");
CREATE INDEX IF NOT EXISTS "perps_decisions_symbol_idx"
  ON "perps_decisions" ("symbol");

CREATE TABLE IF NOT EXISTS "perps_orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "venue" text NOT NULL,
  "client_order_id" text NOT NULL,
  "venue_order_id" text,
  "decision_id" integer,
  "symbol" text NOT NULL,
  "side" text NOT NULL,
  "type" text NOT NULL,
  "size" numeric(30,12) NOT NULL,
  "leverage" integer NOT NULL,
  "limit_price" numeric(30,12),
  "stop_loss_price" numeric(30,12),
  "take_profit_price" numeric(30,12),
  "reduce_only" boolean DEFAULT false NOT NULL,
  "status" text NOT NULL,
  "filled_size" numeric(30,12) DEFAULT '0' NOT NULL,
  "average_price" numeric(30,12),
  "error" text,
  "raw" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "perps_orders_client_order_id_idx"
  ON "perps_orders" ("client_order_id");
CREATE INDEX IF NOT EXISTS "perps_orders_symbol_idx"
  ON "perps_orders" ("symbol");

CREATE TABLE IF NOT EXISTS "perps_positions" (
  "id" serial PRIMARY KEY NOT NULL,
  "venue" text NOT NULL,
  "symbol" text NOT NULL,
  "side" text NOT NULL,
  "size" numeric(30,12) NOT NULL,
  "entry_price" numeric(30,12) NOT NULL,
  "mark_price" numeric(30,12),
  "notional_usd" numeric(30,12) NOT NULL,
  "margin_usd" numeric(30,12),
  "leverage" numeric(18,6),
  "liquidation_price" numeric(30,12),
  "unrealized_pnl_usd" numeric(30,12),
  "stop_price" numeric(30,12),
  "decision_id" integer,
  "opened_at" timestamp DEFAULT now() NOT NULL,
  "closed_at" timestamp,
  "realized_pnl_usd" numeric(30,12),
  "fees_paid_usd" numeric(30,12),
  "synced_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "perps_positions_venue_symbol_idx"
  ON "perps_positions" ("venue", "symbol");
