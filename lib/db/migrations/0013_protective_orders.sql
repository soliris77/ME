CREATE TABLE IF NOT EXISTS protective_orders (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  position_symbol TEXT NOT NULL,
  parent_order_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('stop_loss', 'take_profit')),
  trigger_price NUMERIC(24,10) NOT NULL,
  quantity NUMERIC(24,10) NOT NULL,
  broker_order_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','placed','filled','cancelled','failed')),
  failure_count INTEGER NOT NULL DEFAULT 0,
  emergency_close_issued BOOLEAN NOT NULL DEFAULT FALSE,
  sibling_id BIGINT REFERENCES protective_orders(id),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS protective_orders_parent_kind_idx
  ON protective_orders (account_id, parent_order_id, kind);
CREATE INDEX IF NOT EXISTS protective_orders_open_idx
  ON protective_orders (account_id, status)
  WHERE status IN ('pending', 'placed');