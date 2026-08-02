import {
  BrainIcon,
  ChartNoAxesCombinedIcon,
  DumbbellIcon,
  MessageSquareIcon,
  NotebookPenIcon,
  SettingsIcon,
  UploadIcon,
} from "lucide-react";
import type { CoreWebContributions } from "@emi/core-migration/web";
import {
  ExerciseProgressToolRenderer,
  GoalProgressToolRenderer,
  NextWorkoutToolRenderer,
  RecoveryToolRenderer,
  RecoveryTimelineToolRenderer,
  SleepTrendToolRenderer,
  TrainingLoadToolRenderer,
  WorkoutStreakToolRenderer,
  WorkoutHistoryToolRenderer,
} from "./components/tool-renderers.tsx";
import { SummaryPanel } from "./web/summary-panel.tsx";
import { UploadPanel } from "./web/upload-panel.tsx";
import { WorkoutsPanel } from "./web/workouts-panel.tsx";

const healthFitNav: NonNullable<CoreWebContributions["nav"]> = [
  {
    id: "chat",
    label: "Chat",
    href: "/chat",
    order: 0,
    icon: MessageSquareIcon,
    description: "Ask your coach",
  },
  {
    id: "upload",
    label: "Upload",
    href: "/upload",
    order: 1,
    icon: UploadIcon,
    description: "Import health data",
  },
  {
    id: "workouts",
    label: "Workouts",
    href: "/workouts",
    order: 2,
    icon: DumbbellIcon,
    description: "Browse sessions",
  },
  {
    id: "summary",
    label: "Trends",
    href: "/summary",
    order: 3,
    icon: ChartNoAxesCombinedIcon,
    description: "Health analytics",
  },
  {
    id: "notes",
    label: "Notes",
    href: "/notes",
    order: 4,
    icon: NotebookPenIcon,
    description: "Gym journal",
  },
  {
    id: "memory",
    label: "Memory",
    href: "/memory",
    order: 5,
    icon: BrainIcon,
    description: "Saved snippets",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    order: 7,
    icon: SettingsIcon,
    description: "Preferences",
  },
];

const healthFitToolRenderers: NonNullable<CoreWebContributions["toolRenderers"]> = [
  { toolName: "get_workout_history", component: WorkoutHistoryToolRenderer },
  { toolName: "get_exercise_progress", component: ExerciseProgressToolRenderer },
  { toolName: "get_recovery", component: RecoveryToolRenderer },
  { toolName: "get_sleep_trend", component: SleepTrendToolRenderer },
  { toolName: "get_workout_streak", component: WorkoutStreakToolRenderer },
  { toolName: "get_training_load", component: TrainingLoadToolRenderer },
  { toolName: "get_recovery_timeline", component: RecoveryTimelineToolRenderer },
  { toolName: "get_goal_progress", component: GoalProgressToolRenderer },
  { toolName: "get_next_workout", component: NextWorkoutToolRenderer },
];

const healthFitPages: NonNullable<CoreWebContributions["pages"]> = [
  { id: "upload", path: "/upload", component: UploadPanel },
  { id: "workouts", path: "/workouts", component: WorkoutsPanel },
  { id: "summary", path: "/summary", component: SummaryPanel },
];

export const healthFitWebContributions: CoreWebContributions = {
  nav: healthFitNav,
  pages: healthFitPages,
  toolRenderers: healthFitToolRenderers,
};
