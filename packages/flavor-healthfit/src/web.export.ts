import {
  ExerciseProgressToolRenderer,
  ExerciseProgressView,
  GoalProgressCard,
  GoalProgressToolRenderer,
  NextWorkoutCard,
  NextWorkoutToolRenderer,
  RecoveryCard,
  RecoveryTimelineToolRenderer,
  RecoveryTimelineView,
  RecoveryToolRenderer,
  SleepTrendToolRenderer,
  SleepTrendView,
  TrainingLoadView,
  TrainingLoadToolRenderer,
  WorkoutHistoryTable,
  WorkoutHistoryToolRenderer,
  WorkoutStreakCard,
  WorkoutStreakToolRenderer,
} from "./components/tool-renderers.tsx";
import type {
  DataSummary,
  ExerciseProgressSet,
  WorkoutHistoryItem,
  WorkoutSession,
  WorkoutSet,
} from "./db/fitness.ts";
import { healthFitWebContributions } from "./contributions.tsx";
import { runApi } from "./web/api-client.ts";
import { healthFitQueryKeys } from "./web/query-keys.ts";
import { formatUploadResult } from "./web/upload-format.ts";
import { uploadMachine } from "./web/upload-machine.ts";
import type { UploadContext, UploadEvent, UploadResult } from "./web/upload-machine.ts";
import { SummaryPanel } from "./web/summary-panel.tsx";
import { UploadPanel } from "./web/upload-panel.tsx";
import { WorkoutsPanel } from "./web/workouts-panel.tsx";
import { buildWorkoutSearchOptions, workoutMatchesSearch } from "./web/workout-search.ts";
import {
  formatWorkoutDate,
  formatWorkoutDuration,
  formatWorkoutSet,
} from "./web/workout-formatters.ts";
import type { WorkoutExercise } from "./web/workouts-panel.tsx";
import { catalog } from "./web/gen-ui/catalog.ts";
import { GenUIRenderer } from "./web/gen-ui/registry.tsx";

export {
  buildWorkoutSearchOptions,
  catalog,
  ExerciseProgressToolRenderer,
  ExerciseProgressView,
  formatUploadResult,
  formatWorkoutDate,
  formatWorkoutDuration,
  formatWorkoutSet,
  GenUIRenderer,
  GoalProgressCard,
  GoalProgressToolRenderer,
  healthFitQueryKeys,
  healthFitWebContributions,
  NextWorkoutCard,
  NextWorkoutToolRenderer,
  RecoveryCard,
  RecoveryTimelineToolRenderer,
  RecoveryTimelineView,
  RecoveryToolRenderer,
  runApi,
  SleepTrendToolRenderer,
  SleepTrendView,
  SummaryPanel,
  TrainingLoadView,
  TrainingLoadToolRenderer,
  UploadPanel,
  uploadMachine,
  WorkoutHistoryTable,
  WorkoutHistoryToolRenderer,
  WorkoutStreakCard,
  WorkoutStreakToolRenderer,
  workoutMatchesSearch,
  WorkoutsPanel,
};

export type {
  DataSummary,
  ExerciseProgressSet,
  UploadContext,
  UploadEvent,
  UploadResult,
  WorkoutExercise,
  WorkoutHistoryItem,
  WorkoutSession,
  WorkoutSet,
};
