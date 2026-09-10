CREATE TABLE IF NOT EXISTS risk_settings (
  account_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('dry_run', 'live')),
  max_position_pct NUMERIC(6,3) NOT NULL DEFAULT 5.0 CHECK (max_position_pct > 0 AND max_position_pct <= 100),
  max_daily_loss_pct NUMERIC(6,3) NOT NULL DEFAULT 3.0 CHECK (max_daily_loss_pct >= 0 AND max_daily_loss_pct <= 100),
  max_orders_per_hour INTEGER NOT NULL DEFAULT 10 CHECK (max_orders_per_hour >= 0),
  kill_switch_active BOOLEAN NOT NULL DEFAULT false,
  kill_switch_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_audit_log (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  client_order_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'live')),
  decision TEXT NOT NULL CHECK (decision IN ('allowed', 'blocked', 'adjusted')),
  reason TEXT,
  request JSONB NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_audit_log_account_time_idx
  ON order_audit_log (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_audit_log_client_order_idx
  ON order_audit_log (account_id, client_order_id, created_at DESC);