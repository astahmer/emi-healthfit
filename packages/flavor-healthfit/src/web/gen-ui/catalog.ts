import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

const workoutTableSchema = z.object({
  workouts: z.array(
    z.object({
      session_id: z.string(),
      title: z.string().nullable(),
      start_time: z.string(),
      total_volume_kg: z.number().nullable(),
      exercise_count: z.number(),
      set_count: z.number(),
    }),
  ),
});

const exerciseProgressSchema = z.object({
  exercise_title: z.string(),
  weeks: z.number(),
  workouts: z.array(
    z.object({
      session_id: z.string(),
      title: z.string().nullable(),
      start_time: z.string(),
      max_weight_kg: z.number().nullable(),
      max_volume_kg: z.number().nullable(),
      total_volume_kg: z.number().nullable(),
      total_reps: z.number().nullable(),
      sets: z.number(),
      estimated_1rm_kg: z.number().nullable().optional(),
    }),
  ),
  personalRecord: z.object({
    weight_kg: z.number().nullable(),
    reps: z.number().nullable(),
    volume_kg: z.number().nullable(),
    estimated_1rm_kg: z.number().nullable().optional(),
  }),
});

const recoveryCardSchema = z.object({
  today: z.string().optional(),
  label: z.string().optional(),
  explanation: z.string().optional(),
  lastWorkout: z.string().nullable().optional(),
  sleepAverageHours: z.number().nullable().optional(),
  recentWorkoutCount: z.number().optional(),
  recentVolume: z.number().nullable().optional(),
});

const sleepTrendSchema = z.object({
  days: z.number(),
  avg_in_bed_min: z.number().nullable(),
  avg_asleep_min: z.number().nullable(),
  avg_awake_min: z.number().nullable(),
  avg_sleep_hours: z.number().nullable(),
  nights: z.array(
    z.object({
      date: z.string(),
      in_bed_min: z.number().nullable(),
      asleep_min: z.number().nullable(),
      awake_min: z.number().nullable(),
    }),
  ),
});

const workoutStreakSchema = z.object({
  current_streak: z.number(),
  longest_streak: z.number(),
  last_workout_date: z.string().nullable(),
});

const trainingLoadSchema = z.object({
  weeks: z.array(
    z.object({
      week_start: z.string(),
      workouts: z.number(),
      sets: z.number(),
      volume_kg: z.number(),
      duration_sec: z.number(),
    }),
  ),
  total_volume_kg: z.number(),
  current_week_volume_kg: z.number(),
  previous_week_volume_kg: z.number().nullable(),
  volume_change_pct: z.number().nullable(),
});

const recoveryTimelineSchema = z.object({
  days: z.array(
    z.object({
      date: z.string(),
      asleep_min: z.number().nullable(),
      workouts: z.number(),
      volume_kg: z.number(),
    }),
  ),
  average_sleep_hours: z.number().nullable(),
});

const goalProgressSchema = z.object({
  period_days: z.number(),
  average_steps: z.number().nullable(),
  step_goal: z.number().nullable(),
  workouts: z.number(),
  workouts_goal: z.number().nullable(),
  latest_weight_kg: z.number().nullable(),
  target_weight_kg: z.number().nullable(),
  weight_remaining_kg: z.number().nullable(),
});

const nextWorkoutSchema = z.object({
  suggested_title: z.string(),
  readiness: z.enum(["ready", "recover", "unknown"]),
  reason: z.string(),
  last_workout_date: z.string().nullable(),
  last_workout_title: z.string().nullable(),
  days_since_last_workout: z.number().nullable(),
  recent_workout_count: z.number(),
  sleep_average_hours: z.number().nullable(),
});

const metricCardSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  trend: z.enum(["up", "down", "flat"]).optional(),
});

const setListSchema = z.object({
  sets: z.array(
    z.object({
      id: z.string(),
      exercise: z.string(),
      weightKg: z.number().nullable(),
      reps: z.number().nullable(),
      rpe: z.number().nullable(),
      setType: z.string().nullable(),
    }),
  ),
});

export const catalog = defineCatalog(schema, {
  actions: {},
  components: {
    WorkoutTable: {
      props: workoutTableSchema,
      description: "A table of recent workouts with date, title, volume, exercises, and sets.",
    },
    ExerciseProgress: {
      props: exerciseProgressSchema,
      description:
        "A progress view for one exercise: weekly workouts, max weight, volume, sets, reps, and PR.",
    },
    RecoveryCard: {
      props: recoveryCardSchema,
      description:
        "A card showing recovery status with sleep average, last workout, recent volume, and explanation.",
    },
    SleepTrend: {
      props: sleepTrendSchema,
      description: "A nightly sleep chart with average duration and awake-time details.",
    },
    WorkoutStreak: {
      props: workoutStreakSchema,
      description: "A card showing current and longest consecutive workout-day streaks.",
    },
    TrainingLoad: {
      props: trainingLoadSchema,
      description:
        "A weekly strength-training volume chart with workouts, sets, and week-over-week change.",
    },
    RecoveryTimeline: {
      props: recoveryTimelineSchema,
      description: "A daily sleep and strength-workout timeline for recovery context.",
    },
    GoalProgress: {
      props: goalProgressSchema,
      description: "Goal cards for supplied step, workout-frequency, and body-weight targets.",
    },
    NextWorkout: {
      props: nextWorkoutSchema,
      description:
        "A next-workout focus with readiness, rationale, recent activity, and sleep context.",
    },
    MetricCard: {
      props: metricCardSchema,
      description: "A small card displaying a single metric value with an optional trend.",
    },
    SetList: {
      props: setListSchema,
      description: "A list of sets for one or more exercises with weight, reps, RPE, and set type.",
    },
  },
});
