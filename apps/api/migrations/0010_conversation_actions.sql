ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_conversations_status_pinned_updated
ON conversations(status, pinned DESC, updated_at DESC);
