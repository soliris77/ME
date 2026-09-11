-- Lot 9 (suite) : reglages d'alerte du scanner.
-- Les colonnes manquantes du lot 9 : anti-repetition, plafond horaire, seuil
-- d'enregistrement, plafond de paires par cycle, exclusions manuelles.
-- Tout garde un defaut prudent ; rien ici n'active quoi que ce soit.

ALTER TABLE scanner_settings
  ADD COLUMN IF NOT EXISTS record_score_threshold INTEGER NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS alert_cooldown_minutes INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS max_alerts_per_hour INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_symbols_per_cycle INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS excluded_symbols TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS timeframe TEXT NOT NULL DEFAULT '15m',
  ADD COLUMN IF NOT EXISTS last_scan_at TIMESTAMPTZ;

-- Lecture chaude du worker : derniere alerte par paire, et comptage horaire.
CREATE INDEX IF NOT EXISTS scanner_hits_symbol_outcome_idx
  ON scanner_hits (symbol, outcome, detected_at DESC);

-- Lecture chaude de l'evaluateur d'horizons : detections encore a mesurer.
CREATE INDEX IF NOT EXISTS scanner_hits_pending_outcomes_idx
  ON scanner_hits (detected_at)
  WHERE outcome IN ('observed','alerted','entered');
