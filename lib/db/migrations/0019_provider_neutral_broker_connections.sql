DO $$
BEGIN
  IF to_regclass('broker_connections') IS NOT NULL THEN
    ALTER TABLE broker_connections ALTER COLUMN snaptrade_user_id DROP NOT NULL;
    ALTER TABLE broker_connections ALTER COLUMN snaptrade_user_secret DROP NOT NULL;
    ALTER TABLE broker_connections ADD COLUMN IF NOT EXISTS exchange_id text;
    ALTER TABLE broker_connections ADD COLUMN IF NOT EXISTS secret_prefix text;
  END IF;
END $$;