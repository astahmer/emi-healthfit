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
    }),
  ),
  personalRecord: z.object({
    weight_kg: z.number().nullable(),
    reps: z.number().nullable(),
    volume_kg: z.number().nullable(),
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

const metricCardSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  trend: z.enum(["up", "down", "flat"]).optional(),
});

const setListSchema = z.object({
  sets: z.array(
    z.object({
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
