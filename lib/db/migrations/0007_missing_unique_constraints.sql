-- Contraintes uniques que `drizzle-kit push` n'a jamais appliquées au démarrage
-- (prompts sans TTY, erreurs avalées) alors que le code les suppose :
-- watchlist_lists.name, investment_theses.symbol, spotify_connections.spotify_user_id.
-- Comme ces contraintes ont manqué, des doublons ont pu apparaître : chaque
-- table est dédoublonnée AVANT l'ajout de la contrainte, avec une politique
-- explicite de conservation (jamais d'échec de DDL qui bloquerait le démarrage).
-- Noms conformes à la convention drizzle (`<table>_<col>_unique`). Idempotent ;
-- sans effet sur un environnement neuf (baseline 0000 les crée déjà).
DO $$
BEGIN
  IF to_regclass('public.watchlist_lists') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'u' AND conrelid = 'public.watchlist_lists'::regclass
  ) THEN
    -- Doublons = même nom de liste ; on garde la plus ancienne (id le plus bas),
    -- qui porte la position d'origine dans l'ordre des listes.
    DELETE FROM watchlist_lists a
      USING watchlist_lists b
      WHERE a.name = b.name AND a.id > b.id;
    ALTER TABLE watchlist_lists
      ADD CONSTRAINT watchlist_lists_name_unique UNIQUE (name);
  END IF;

  IF to_regclass('public.investment_theses') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'u' AND conrelid = 'public.investment_theses'::regclass
  ) THEN
    -- On garde la thèse la plus récemment mise à jour (updated_at max,
    -- départage par id max) : c'est l'état le plus frais de l'analyse.
    DELETE FROM investment_theses t
      WHERE EXISTS (
        SELECT 1 FROM investment_theses n
        WHERE n.symbol = t.symbol
          AND (n.updated_at > t.updated_at
               OR (n.updated_at = t.updated_at AND n.id > t.id))
      );
    ALTER TABLE investment_theses
      ADD CONSTRAINT investment_theses_symbol_unique UNIQUE (symbol);
  END IF;

  IF to_regclass('public.spotify_connections') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'u' AND conrelid = 'public.spotify_connections'::regclass
  ) THEN
    -- On garde la connexion la plus récente (connected_at max, départage par
    -- id max) : son refresh token est le plus susceptible d'être encore valide.
    DELETE FROM spotify_connections t
      WHERE EXISTS (
        SELECT 1 FROM spotify_connections n
        WHERE n.spotify_user_id = t.spotify_user_id
          AND (n.connected_at > t.connected_at
               OR (n.connected_at = t.connected_at AND n.id > t.id))
      );
    ALTER TABLE spotify_connections
      ADD CONSTRAINT spotify_connections_spotify_user_id_unique UNIQUE (spotify_user_id);
  END IF;
END $$;
