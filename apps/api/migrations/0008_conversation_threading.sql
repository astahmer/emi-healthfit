ALTER TABLE threads RENAME TO conversations;
ALTER TABLE messages RENAME COLUMN thread_id TO conversation_id;
ALTER TABLE messages ADD COLUMN parent_id TEXT;

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  anchor_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'regular',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS thread_messages (
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  included_at TEXT NOT NULL,
  PRIMARY KEY (thread_id, message_id)
);

DROP INDEX IF EXISTS idx_messages_thread_id;
DROP INDEX IF EXISTS idx_threads_updated_at;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_conversation_id ON threads(conversation_id);
CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_id ON thread_messages(thread_id);
