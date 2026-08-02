import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ChatExtensions } from "@emi/core/extensions";

const HealthFitTool = Schema.Struct({
  name: Schema.String,
});

export const healthFitExtension = ChatExtensions.define({
  id: "healthfit",
  namespace: "healthfit.chat",
  parts: {},
  tools: {
    get_recovery: HealthFitTool,
    get_recovery_timeline: HealthFitTool,
    get_workout_history: HealthFitTool,
    get_exercise_progress: HealthFitTool,
    get_workout_streak: HealthFitTool,
    get_training_load: HealthFitTool,
    get_sleep_trend: HealthFitTool,
    get_goal_progress: HealthFitTool,
    get_next_workout: HealthFitTool,
  },
}).pipe(Effect.withSpan("healthfit.extension"));
