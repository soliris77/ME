CREATE TABLE IF NOT EXISTS "market_limits" (
  "id" serial PRIMARY KEY,
  "account_identity" text NOT NULL,
  "symbol" text NOT NULL,
  "min_quantity" numeric(30,12) NOT NULL,
  "quantity_step" numeric(30,12) NOT NULL,
  "price_step" numeric(30,12) NOT NULL,
  "min_notional" numeric(30,12),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "market_limits_account_symbol_idx"
  ON "market_limits" ("account_identity", "symbol");