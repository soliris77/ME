-- subscription : état d'abonnement Whop, vérifié et stocké côté serveur.
--
-- Jusqu'ici rien ne persistait l'abonnement. La seule vérification existante
-- (/api/whop/verify) recevait l'identifiant d'adhésion depuis le client :
-- n'importe qui pouvait donc se déclarer abonné. Et comme aucune route ne
-- l'appelait, être abonné n'ouvrait rien et ne pas l'être ne fermait rien.
--
-- subject_id vaut "owner" tant que l'application est mono-utilisateur ; il
-- accueillera l'identifiant d'utilisateur lors du passage multi-comptes.
--
-- Idempotent : peut être rejoué sans danger sur une base déjà migrée.

CREATE TABLE IF NOT EXISTS subscription (
  id                 serial PRIMARY KEY,
  subject_id         text NOT NULL DEFAULT 'owner',
  membership_id      text,
  plan_id            text,
  product_id         text,
  status             text NOT NULL DEFAULT 'none',
  active             boolean NOT NULL DEFAULT false,
  current_period_end timestamp,
  last_checked_at    timestamp,
  last_error         text,
  raw                jsonb,
  updated_at         timestamp NOT NULL DEFAULT now()
);

-- Dédoublonnage défensif avant l'index unique : si une base a reçu plusieurs
-- lignes pour le même sujet (rejeu partiel, insertion concurrente), on ne
-- garde que la plus récente.
DELETE FROM subscription a
  USING subscription b
 WHERE a.subject_id = b.subject_id
   AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_subject_id_unique
  ON subscription (subject_id);

-- Ligne du propriétaire, créée vide : l'application n'a jamais à gérer
-- l'absence de ligne, seulement un abonnement inactif.
INSERT INTO subscription (subject_id, status, active)
  VALUES ('owner', 'none', false)
  ON CONFLICT (subject_id) DO NOTHING;
