-- Live trading is deliberately an expiring, account-scoped arm rather than a
-- durable toggle.  IF NOT EXISTS keeps this safe for older deployments which
-- may already have the legacy trading_mode column.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS trading_mode text NOT NULL DEFAULT 'paper';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS live_arm_account_id text;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS live_arm_max_order_value text;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS live_arm_daily_loss_cap text;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS live_arm_expires_at timestamp;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS live_arm_armed_at timestamp;