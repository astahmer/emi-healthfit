import * as Effect from "effect/Effect";
import {
  buildChatContext,
  getDataSummary,
  getWorkoutHistory,
  type HealthfitDatabaseSchema,
} from "@emi/flavor-healthfit";
import {
  consumeDiscordLinkCode,
  getLinkedUserIdForDiscord,
  unlinkDiscordAccountByDiscordUserId,
  type DiscordDatabaseSchema,
  type QueryDatabaseClient,
} from "@emi/core/server";
import type { HealthfitCommandServices } from "./limits.ts";

export const makeHealthfitCommandServices = (options: {
  discordDb: QueryDatabaseClient<DiscordDatabaseSchema>;
  fitnessDb: QueryDatabaseClient<HealthfitDatabaseSchema>;
}): HealthfitCommandServices => ({
  getLinkedUserId: (discordUserId) => getLinkedUserIdForDiscord(options.discordDb, discordUserId),
  consumeLinkCode: ({ code, discordUserId }) =>
    consumeDiscordLinkCode(options.discordDb, { code, discordUserId }),
  unlinkDiscordUser: (discordUserId) =>
    unlinkDiscordAccountByDiscordUserId(options.discordDb, discordUserId),
  formatSummary: (userId) =>
    Effect.gen(function* () {
      const summary = yield* getDataSummary(options.fitnessDb, userId);
      const workouts = yield* getWorkoutHistory(options.fitnessDb, userId, 3);
      const lines = [
        "HealthFit summary",
        `Activity days: ${summary.dailyActivity}`,
        `Health workouts: ${summary.healthWorkouts}`,
        `Hevy sessions/sets: ${summary.hevySessions}/${summary.hevySets}`,
        `Sleep sessions: ${summary.sleepSessions}`,
        `Body metrics: ${summary.bodyMetrics}`,
        `Last Apple Health sync: ${summary.lastHealthSync ?? "never"}`,
        `Last Hevy sync: ${summary.lastHevySync ?? "never"}`,
      ];
      if (workouts.length > 0) {
        lines.push("Recent workouts:");
        for (const workout of workouts) {
          lines.push(
            `- ${workout.title ?? "Workout"} (${workout.start_time.slice(0, 10)}) · ${workout.set_count} sets`,
          );
        }
      }
      return lines.join("\n");
    }),
  formatLastWorkout: (userId) =>
    Effect.gen(function* () {
      const workouts = yield* getWorkoutHistory(options.fitnessDb, userId, 1);
      const workout = workouts[0];
      if (workout === undefined) return "No Hevy workouts found for this account.";
      const volume =
        workout.total_volume_kg === null ? "n/a" : `${Math.round(workout.total_volume_kg)} kg`;
      return [
        `Last workout: ${workout.title ?? "Workout"}`,
        `Started: ${workout.start_time}`,
        `Exercises: ${workout.exercise_count}`,
        `Sets: ${workout.set_count}`,
        `Volume: ${volume}`,
      ].join("\n");
    }),
  formatRecovery: (userId) =>
    Effect.gen(function* () {
      const context = yield* buildChatContext(options.fitnessDb, userId);
      return `Recovery: ${context.recoveryLabel}\n${context.recoveryExplanation}`;
    }),
});
