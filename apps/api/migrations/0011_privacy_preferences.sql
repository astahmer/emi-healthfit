CREATE TABLE IF NOT EXISTS privacy_preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  raw_upload_retention_days INTEGER NOT NULL DEFAULT 30 CHECK (raw_upload_retention_days BETWEEN 0 AND 3650),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO privacy_preferences (id, raw_upload_retention_days) VALUES (1, 30);
