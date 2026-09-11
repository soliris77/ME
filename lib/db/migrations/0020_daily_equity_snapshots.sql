CREATE TABLE IF NOT EXISTS daily_equity_snapshots (
  id serial PRIMARY KEY,
  account_identity text NOT NULL,
  utc_day date NOT NULL,
  day_start_equity numeric(20,8) NOT NULL,
  base_currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_equity_identity_day_unique UNIQUE (account_identity, utc_day)
);