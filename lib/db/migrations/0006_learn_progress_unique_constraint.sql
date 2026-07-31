-- Aligne la contrainte unique de learn_progress sur la convention drizzle
-- (`learn_progress_section_id_unique`). L'ancienne contrainte posée à la main
-- s'appelait `learn_progress_section_id_key` : drizzle-kit push voyait un diff
-- et affichait un prompt interactif (« truncate learn_progress ? ») qui échouait
-- sans TTY au démarrage. Idempotent ; sans effet sur un environnement neuf où
-- la table n'existe pas encore (elle sera créée avec le bon nom par push).
DO $$
BEGIN
  IF to_regclass('public.learn_progress') IS NULL THEN
    RETURN;
  END IF;

  -- Dédoublonnage défensif avant de garantir l'unicité (garde la plus ancienne ligne).
  DELETE FROM learn_progress a
    USING learn_progress b
    WHERE a.section_id = b.section_id AND a.id > b.id;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'learn_progress_section_id_key'
      AND conrelid = 'public.learn_progress'::regclass
  ) THEN
    ALTER TABLE learn_progress
      RENAME CONSTRAINT learn_progress_section_id_key TO learn_progress_section_id_unique;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'learn_progress_section_id_unique'
      AND conrelid = 'public.learn_progress'::regclass
  ) THEN
    ALTER TABLE learn_progress
      ADD CONSTRAINT learn_progress_section_id_unique UNIQUE (section_id);
  END IF;
END $$;
