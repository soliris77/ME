-- GMX v2 : deuxième plateforme, et le réglage qui la rend jugeable.
--
-- `assumed_fixed_cost_usd` est le frais payé par côté en DOLLARS, quelle que
-- soit la taille de l'ordre. Nul sur un carnet centralisé ; sur GMX c'est le
-- gaz que le keeper facture. C'est le seul coût qui ne se dilue pas, donc le
-- seul qui puisse rendre une petite position absurde : 0,50 $ sur 40 $ de
-- notionnel, c'est 1,25 % par côté.
--
-- La ligne GMX naît fermée des deux côtés, comme celle d'Hyperliquid, et
-- avec une cadence plus basse : à ce coût, six trades par jour se paieraient
-- déjà cher.

ALTER TABLE "perps_settings"
  ADD COLUMN IF NOT EXISTS "assumed_fixed_cost_usd" numeric(12,4) DEFAULT '0' NOT NULL;

INSERT INTO "perps_settings" (
  "venue",
  "assumed_fixed_cost_usd",
  "max_trades_per_day",
  "max_leverage",
  "max_total_leverage"
) VALUES (
  'gmx',
  -- Ordre de grandeur sur Arbitrum. À remplacer par la mesure réelle dès
  -- qu'un compte est branché : le registre sait la prendre sans rien envoyer.
  '0.5',
  2,
  '3',
  '3'
) ON CONFLICT ("venue") DO NOTHING;

-- Une détection doit pouvoir être jugée une fois PAR PLATEFORME.
--
-- L'index unique posé en 0026 portait sur la seule détection : il garantissait
-- qu'on ne la juge pas deux fois, ce qui était juste tant qu'il n'y avait
-- qu'une plateforme. Avec deux, il interdirait exactement ce qu'on veut —
-- juger la même occasion sur les deux barèmes pour pouvoir les comparer.
-- La garantie reste la même, elle porte simplement sur le couple.
DROP INDEX IF EXISTS "perps_decisions_scanner_hit_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "perps_decisions_venue_scanner_hit_idx"
  ON "perps_decisions" ("venue", "scanner_hit_id")
  WHERE "scanner_hit_id" IS NOT NULL;
