-- Listes de la Watchlist persistées (ordre des onglets + listes vides créées
-- à l'avance depuis la barre d'onglets).
-- Idempotent : peut être rejoué sans danger sur une base déjà migrée.

CREATE TABLE IF NOT EXISTS watchlist_lists (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  position integer NOT NULL DEFAULT 0
);
