-- Lots 8 et 9 : sources de signaux externes + scanner d'opportunites.
-- Tout demarre DESACTIVE. Rien ici ne peut declencher un ordre par defaut.

-- ── Lot 8 : sources de signaux externes ──────────────────────────────────
CREATE TABLE IF NOT EXISTS signal_sources (
  id                     TEXT PRIMARY KEY,
  label                  TEXT NOT NULL,
  kind                   TEXT NOT NULL CHECK (kind IN ('pull','push')),
  mode                   TEXT NOT NULL DEFAULT 'shadow'
                         CHECK (mode IN ('shadow','active','disabled')),
  confluence_policy      TEXT NOT NULL DEFAULT 'require_confirmation'
                         CHECK (confluence_policy IN ('require_confirmation','advisory','veto_only')),
  max_signal_age_seconds INTEGER NOT NULL DEFAULT 60,
  webhook_secret_env     TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS external_signals (
  id                BIGSERIAL PRIMARY KEY,
  source_id         TEXT NOT NULL REFERENCES signal_sources(id),
  source_signal_id  TEXT NOT NULL,
  symbol            TEXT NOT NULL,
  action            TEXT NOT NULL,
  emitted_at        TIMESTAMPTZ,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reference_price   NUMERIC(24,10),
  own_direction     TEXT,
  own_confidence    NUMERIC(5,4),
  confluence_result TEXT NOT NULL,
  reason            TEXT,
  client_order_id   TEXT,
  UNIQUE (source_id, source_signal_id)
);

CREATE INDEX IF NOT EXISTS external_signals_source_time_idx
  ON external_signals (source_id, received_at DESC);

CREATE TABLE IF NOT EXISTS signal_outcomes (
  external_signal_id BIGINT  NOT NULL REFERENCES external_signals(id),
  horizon_minutes    INTEGER NOT NULL,
  price_at_signal    NUMERIC(24,10) NOT NULL,
  price_at_horizon   NUMERIC(24,10),
  return_pct         NUMERIC(10,4),
  evaluated_at       TIMESTAMPTZ,
  PRIMARY KEY (external_signal_id, horizon_minutes)
);

-- ── Lot 9 : scanner d'opportunites ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS scanner_settings (
  id                    SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled               BOOLEAN NOT NULL DEFAULT false,
  quote_currency        TEXT    NOT NULL DEFAULT 'USD',
  min_quote_volume_24h  NUMERIC(20,2) NOT NULL DEFAULT 500000,
  max_spread_pct        NUMERIC(6,3)  NOT NULL DEFAULT 0.5,
  alert_score_threshold INTEGER NOT NULL DEFAULT 70,
  scan_interval_minutes INTEGER NOT NULL DEFAULT 15,
  mode                  TEXT    NOT NULL DEFAULT 'shadow'
                        CHECK (mode IN ('shadow','armed','disabled')),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scanner_hits (
  id               BIGSERIAL PRIMARY KEY,
  symbol           TEXT NOT NULL,
  detected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  score            INTEGER NOT NULL,
  roc_pct          NUMERIC(10,4) NOT NULL,
  volume_ratio     NUMERIC(10,4) NOT NULL,
  atr_multiple     NUMERIC(10,4) NOT NULL,
  extension_atr    NUMERIC(10,4) NOT NULL,
  quote_volume_24h NUMERIC(20,2) NOT NULL,
  spread_pct       NUMERIC(6,3)  NOT NULL,
  price_at_hit     NUMERIC(24,10) NOT NULL,
  reasons          TEXT[] NOT NULL DEFAULT '{}',
  outcome          TEXT NOT NULL DEFAULT 'observed'
                   CHECK (outcome IN ('observed','alerted','entered','rejected')),
  rejection_reason TEXT,
  client_order_id  TEXT,
  UNIQUE (symbol, detected_at)
);

CREATE INDEX IF NOT EXISTS scanner_hits_recent_idx ON scanner_hits (detected_at DESC);

CREATE TABLE IF NOT EXISTS opportunity_envelope (
  id                 SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_amount       NUMERIC(18,2) NOT NULL DEFAULT 0,
  per_trade_amount   NUMERIC(18,2) NOT NULL DEFAULT 0,
  max_concurrent     INTEGER NOT NULL DEFAULT 3,
  daily_loss_cap_pct NUMERIC(6,2) NOT NULL DEFAULT 5.0,
  trailing_stop_pct  NUMERIC(6,2) NOT NULL DEFAULT 8.0,
  hard_stop_pct      NUMERIC(6,2) NOT NULL DEFAULT 12.0,
  consumed_today     NUMERIC(18,2) NOT NULL DEFAULT 0,
  consumed_reset_at  TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scanner_outcomes (
  scanner_hit_id    BIGINT  NOT NULL REFERENCES scanner_hits(id),
  horizon_minutes   INTEGER NOT NULL,
  price_at_horizon  NUMERIC(24,10),
  return_pct        NUMERIC(10,4),
  max_favorable_pct NUMERIC(10,4),
  max_adverse_pct   NUMERIC(10,4),
  evaluated_at      TIMESTAMPTZ,
  PRIMARY KEY (scanner_hit_id, horizon_minutes)
);

-- Lignes de reglages uniques, creees desactivees.
INSERT INTO scanner_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
INSERT INTO opportunity_envelope (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
