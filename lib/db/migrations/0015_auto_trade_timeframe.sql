ALTER TABLE auto_trade_rules
  ADD COLUMN IF NOT EXISTS timeframe TEXT NOT NULL DEFAULT '1m';

ALTER TABLE auto_trade_rules
  DROP CONSTRAINT IF EXISTS auto_trade_rules_timeframe_check;

ALTER TABLE auto_trade_rules
  ADD CONSTRAINT auto_trade_rules_timeframe_check
  CHECK (timeframe IN ('1m', '5m', '15m', '1h', '4h', '1d'));