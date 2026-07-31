-- Second avis IA (AI second opinion) — opt-in par règle.
-- Idempotent (rejouable au démarrage). Rétrocompatible : opt-in false par défaut,
-- colonnes de logs nullables (null = aucun avis IA rendu, comportement inchangé).
ALTER TABLE auto_trade_rules ADD COLUMN IF NOT EXISTS ai_review boolean NOT NULL DEFAULT false;

ALTER TABLE auto_trade_logs ADD COLUMN IF NOT EXISTS ai_verdict text;
ALTER TABLE auto_trade_logs ADD COLUMN IF NOT EXISTS ai_reason text;
