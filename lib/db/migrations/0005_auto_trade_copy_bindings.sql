-- Pont copy-trading → auto-trader : liaisons opt-in entre une règle d'auto-trading
-- et un trader suivi. Idempotent (rejouable au démarrage).
CREATE TABLE IF NOT EXISTS auto_trade_copy_bindings (
  id serial PRIMARY KEY,
  rule_id integer NOT NULL REFERENCES auto_trade_rules(id) ON DELETE CASCADE,
  followed_trader_id integer NOT NULL REFERENCES followed_traders(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

-- Contrainte unique nommée (convention drizzle : <table>_..._unique) pour éviter
-- un diff au prochain push et empêcher les doublons rule/trader.
CREATE UNIQUE INDEX IF NOT EXISTS auto_trade_copy_bindings_rule_trader_unique
  ON auto_trade_copy_bindings (rule_id, followed_trader_id);

-- Traçabilité des déclenchements copy-trading dans les logs d'auto-trade.
-- Rétrocompatible : colonnes nullables, null = signal technique (comportement inchangé).
ALTER TABLE auto_trade_logs ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE auto_trade_logs ADD COLUMN IF NOT EXISTS followed_trader_id integer;
ALTER TABLE auto_trade_logs ADD COLUMN IF NOT EXISTS external_trade_id text;

-- Idempotence forte des trades copiés : empêche un doublon (trader + trade
-- externe) même après un crash entre l'insert et l'émission vers le pont
-- auto-trader. Dé-doublonnage préalable des lignes existantes (on garde le plus
-- petit id) pour que la création de l'index unique ne puisse pas échouer.
DELETE FROM copied_trades a
USING copied_trades b
WHERE a.followed_trader_id = b.followed_trader_id
  AND a.external_trade_id = b.external_trade_id
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS copied_trades_trader_external_unique
  ON copied_trades (followed_trader_id, external_trade_id);
