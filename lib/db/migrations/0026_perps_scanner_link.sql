-- Relie chaque décision perps à la détection du scanner qui l'a provoquée.
-- L'index unique garantit qu'une détection ne donne jamais deux décisions,
-- même si le worker redémarre au milieu d'un cycle.

ALTER TABLE "perps_decisions"
  ADD COLUMN IF NOT EXISTS "scanner_hit_id" bigint;

CREATE UNIQUE INDEX IF NOT EXISTS "perps_decisions_scanner_hit_idx"
  ON "perps_decisions" ("scanner_hit_id")
  WHERE "scanner_hit_id" IS NOT NULL;
