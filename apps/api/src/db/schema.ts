export interface DailyActivityRow {
  date: string;
  active_kcal: number | null;
  steps: number | null;
  distance_km: number | null;
  exercise_min: number | null;
  flights_climbed: number | null;
}

export interface HealthWorkoutRow {
  id?: number;
  date: string;
  type: string;
  start_raw: string | null;
  duration_sec: number | null;
  active_kcal: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  min_hr: number | null;
  distance_km: number | null;
  source: string | null;
  raw_json: string;
}

export interface HevySessionRow {
  session_id: string;
  title: string | null;
  start_time: string;
  end_time: string | null;
  duration_sec: number | null;
  total_volume_kg: number | null;
}

export interface HevySetRow {
  id?: number;
  session_id: string;
  exercise_title: string;
  set_index: number;
  set_type: string | null;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  distance_km: number | null;
  duration_seconds: number | null;
  exercise_notes: string | null;
}

export interface SleepSessionRow {
  date: string;
  start: string;
  end: string;
  in_bed_min: number | null;
  asleep_min: number | null;
  awake_min: number | null;
  source: string | null;
}

export interface BodyMetricRow {
  date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  source: string | null;
}

export interface SuggestionsRow {
  id: string;
  suggestions: string;
  created_at: string;
}

export interface MemoryRow {
  id: string;
  content: string;
  source: string | null;
  thread_id: string | null;
  created_at: string;
}
