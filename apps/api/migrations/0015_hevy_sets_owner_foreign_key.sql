PRAGMA foreign_keys = OFF;

CREATE TABLE hevy_sets_owner_fk (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  exercise_title TEXT NOT NULL,
  set_index INTEGER NOT NULL,
  set_type TEXT,
  weight_kg REAL,
  reps INTEGER,
  rpe REAL,
  distance_km REAL,
  duration_seconds REAL,
  exercise_notes TEXT,
  FOREIGN KEY (user_id, session_id) REFERENCES hevy_sessions(user_id, session_id)
);

INSERT INTO hevy_sets_owner_fk
SELECT id, user_id, session_id, exercise_title, set_index, set_type, weight_kg, reps, rpe,
  distance_km, duration_seconds, exercise_notes
FROM hevy_sets;

DROP TABLE hevy_sets;
ALTER TABLE hevy_sets_owner_fk RENAME TO hevy_sets;

CREATE UNIQUE INDEX IF NOT EXISTS hevy_sets_user_id_session_id_exercise_title_set_index_unique
  ON hevy_sets(user_id, session_id, exercise_title, set_index);

CREATE TRIGGER hevy_sets_owner_insert BEFORE INSERT ON hevy_sets
WHEN NEW.user_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'hevy_sets.user_id is required');
END;

PRAGMA foreign_keys = ON;
