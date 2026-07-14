CREATE TABLE chat_generations (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE chat_generation_chunks (
  generation_id TEXT NOT NULL REFERENCES chat_generations(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  chunk TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (generation_id, sequence)
);

CREATE INDEX idx_chat_generations_conversation_status
  ON chat_generations(conversation_id, status, created_at DESC);

CREATE UNIQUE INDEX idx_chat_generations_one_running
  ON chat_generations(conversation_id)
  WHERE status = 'running';

CREATE INDEX idx_chat_generation_chunks_generation
  ON chat_generation_chunks(generation_id, sequence);
