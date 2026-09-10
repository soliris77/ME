CREATE TABLE IF NOT EXISTS worker_lock (
  id integer PRIMARY KEY,
  owner_token text,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_lock_singleton CHECK (id = 1)
);
INSERT INTO worker_lock (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS worker_health (
  id integer PRIMARY KEY,
  last_cycle_executed_at timestamptz,
  latest_candle_at timestamptz,
  kill_switch_active boolean NOT NULL DEFAULT false,
  pending_protective_order_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_health_singleton CHECK (id = 1)
);
INSERT INTO worker_health (id) VALUES (1) ON CONFLICT (id) DO NOTHING;