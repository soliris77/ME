CREATE TABLE IF NOT EXISTS practice_events (
  id serial PRIMARY KEY,
  tool text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_events_tool_created_at_idx
  ON practice_events (tool, created_at DESC);