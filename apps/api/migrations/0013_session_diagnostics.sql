PRAGMA foreign_keys = OFF;

CREATE TABLE chat_generations_diagnostics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'streaming', 'completed', 'failed', 'timed_out', 'cancelled')),
  error TEXT,
  finish_reason TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO chat_generations_diagnostics (
  id, user_id, conversation_id, request_id, trace_id, status, error, started_at,
  finished_at, created_at, updated_at
)
SELECT
  id, user_id, conversation_id, id, id,
  CASE WHEN status = 'running' THEN 'streaming' ELSE status END,
  error, created_at, CASE WHEN status = 'running' THEN NULL ELSE updated_at END,
  created_at, updated_at
FROM chat_generations;

CREATE TABLE chat_generation_chunks_diagnostics (
  user_id TEXT NOT NULL,
  generation_id TEXT NOT NULL REFERENCES chat_generations_diagnostics(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  chunk TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, generation_id, sequence)
);

INSERT INTO chat_generation_chunks_diagnostics
SELECT user_id, generation_id, sequence, chunk, created_at
FROM chat_generation_chunks;

DROP TABLE chat_generation_chunks;
DROP TABLE chat_generations;
ALTER TABLE chat_generations_diagnostics RENAME TO chat_generations;
ALTER TABLE chat_generation_chunks_diagnostics RENAME TO chat_generation_chunks;

CREATE INDEX idx_chat_generations_conversation_status
  ON chat_generations(conversation_id, status, created_at);
CREATE INDEX idx_chat_generations_retention
  ON chat_generations(status, updated_at);
CREATE INDEX idx_chat_generations_user_conversation_status
  ON chat_generations(user_id, conversation_id, status, created_at DESC);
CREATE UNIQUE INDEX idx_chat_generations_one_active
  ON chat_generations(conversation_id)
  WHERE status IN ('pending', 'streaming');
CREATE INDEX idx_chat_generation_chunks_generation
  ON chat_generation_chunks(generation_id, sequence);

CREATE TABLE chat_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  generation_id TEXT NOT NULL REFERENCES chat_generations(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  type TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_chat_events_generation_created
  ON chat_events(generation_id, created_at);
CREATE INDEX idx_chat_events_retention ON chat_events(created_at);

PRAGMA foreign_keys = ON;
