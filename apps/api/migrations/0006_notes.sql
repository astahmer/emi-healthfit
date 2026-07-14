CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes (updated_at DESC);
