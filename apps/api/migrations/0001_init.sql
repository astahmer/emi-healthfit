CREATE TABLE IF NOT EXISTS daily_activity (
  date TEXT PRIMARY KEY,
  active_kcal REAL,
  steps INTEGER,
  distance_km REAL,
  exercise_min INTEGER,
  flights_climbed INTEGER
);

CREATE TABLE IF NOT EXISTS health_workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  start_raw TEXT,
  duration_sec INTEGER,
  active_kcal REAL,
  avg_hr REAL,
  max_hr REAL,
  min_hr REAL,
  distance_km REAL,
  source TEXT,
  raw_json TEXT,
  UNIQUE(date, type, start_raw)
);

CREATE TABLE IF NOT EXISTS hevy_sessions (
  session_id TEXT PRIMARY KEY,
  title TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_sec INTEGER,
  total_volume_kg REAL
);

CREATE TABLE IF NOT EXISTS hevy_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES hevy_sessions(session_id),
  exercise_title TEXT NOT NULL,
  set_index INTEGER NOT NULL,
  set_type TEXT,
  weight_kg REAL,
  reps INTEGER,
  rpe REAL,
  distance_km REAL,
  duration_seconds REAL,
  exercise_notes TEXT,
  UNIQUE(session_id, exercise_title, set_index)
);

CREATE TABLE IF NOT EXISTS sleep_sessions (
  date TEXT,
  start TEXT,
  end TEXT,
  in_bed_min INTEGER,
  asleep_min INTEGER,
  awake_min INTEGER,
  source TEXT,
  UNIQUE(date, start)
);

CREATE TABLE IF NOT EXISTS body_metrics (
  date TEXT PRIMARY KEY,
  weight_kg REAL,
  body_fat_pct REAL,
  lean_mass_kg REAL,
  source TEXT
);

CREATE TABLE IF NOT EXISTS sync_cursors (
  source TEXT PRIMARY KEY,
  last_sync TEXT
);
