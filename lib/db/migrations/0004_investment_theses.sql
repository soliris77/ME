-- Thèse d'investissement par titre : raison d'achat, prix cible, seuil d'invalidation.
CREATE TABLE IF NOT EXISTS investment_theses (
  id serial PRIMARY KEY,
  symbol text NOT NULL UNIQUE,
  reason text NOT NULL,
  target_price numeric,
  invalidation_price numeric,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);
