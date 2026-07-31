-- Web Push : abonnements navigateurs + clés VAPID persistées.
-- Idempotent : peut être rejoué sans danger sur une base déjà migrée.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id serial PRIMARY KEY,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)
);

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS vapid_public_key text;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS vapid_private_key text;
