-- Historique des notifications envoyées (centre de notifications in-app).
-- Idempotent : peut être rejoué sans danger sur une base déjà migrée.

CREATE TABLE IF NOT EXISTS notifications (
  id serial PRIMARY KEY,
  alert_id integer,
  symbol text NOT NULL,
  name text,
  alert_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  channels text NOT NULL DEFAULT 'push',
  sent_at timestamp DEFAULT now() NOT NULL,
  read_at timestamp
);

CREATE INDEX IF NOT EXISTS notifications_sent_at_idx ON notifications (sent_at DESC);
