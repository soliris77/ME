-- Capital de référence utilisé en mode fantôme, tant qu'aucun compte
-- Hyperliquid n'est configuré. Il ne sert qu'à dimensionner des décisions
-- qui ne partent pas : sans lui, le journal fantôme ne contiendrait que des
-- refus « capital insuffisant » et ne mesurerait rien.

ALTER TABLE "perps_settings"
  ADD COLUMN IF NOT EXISTS "shadow_equity_usd" numeric(30,12) DEFAULT '1000' NOT NULL;
