import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { ServerDatabase } from "@emi/core/server/database";
import {
  HealthFit,
  type HealthfitDatabaseSchema,
} from "@emi/flavor-healthfit";
import { narrowQueryDatabaseClient, type QueryDatabaseClient } from "../../platform/db/client.ts";
import { SecureCompare } from "../auth/secure-compare.ts";

const DiscordCommandEnvironment = Schema.Struct({
  DISCORD_INTERNAL_ASK_SECRET: Schema.String.check(Schema.isMinLength(16)),
});

const DiscordCommandBody = Schema.Union([
  Schema.Struct({
    operation: Schema.Literal("get-linked-user-id"),
    discordUserId: Schema.String.check(Schema.isMinLength(1)),
  }),
  Schema.Struct({
    operation: Schema.Literal("consume-link-code"),
    discordUserId: Schema.String.check(Schema.isMinLength(1)),
    code: Schema.String.check(Schema.isMinLength(1)),
  }),
  Schema.Struct({
    operation: Schema.Literal("unlink-discord-user"),
    discordUserId: Schema.String.check(Schema.isMinLength(1)),
  }),
  Schema.Struct({
    operation: Schema.Literal("summary"),
    userId: Schema.String.check(Schema.isMinLength(1)),
  }),
  Schema.Struct({
    operation: Schema.Literal("last-workout"),
    userId: Schema.String.check(Schema.isMinLength(1)),
  }),
  Schema.Struct({
    operation: Schema.Literal("recovery"),
    userId: Schema.String.check(Schema.isMinLength(1)),
  }),
]);

const { buildContext: buildChatContext } = HealthFit.chat;
const { getDataSummary, getWorkoutHistory } = HealthFit.data;

const formatSummary = Effect.fn("http.discord.formatSummary")(function* (
  db: ServerDatabase.QueryDatabaseClient<HealthfitDatabaseSchema>,
  userId: string,
) {
  const summary = yield* getDataSummary(db, userId);
  const workouts = yield* getWorkoutHistory(db, userId, 3);
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
  for (const workout of workouts) {
    lines.push(
      `- ${workout.title ?? "Workout"} (${workout.start_time.slice(0, 10)}) · ${workout.set_count} sets`,
    );
  }
  return lines.join("\n");
});

const formatLastWorkout = Effect.fn("http.discord.formatLastWorkout")(function* (
  db: ServerDatabase.QueryDatabaseClient<HealthfitDatabaseSchema>,
  userId: string,
) {
  const workouts = yield* getWorkoutHistory(db, userId, 1);
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
});

export const handleDiscordCommand = Effect.fn("http.discord.command")(function* ({
  db,
  environment,
  request,
}: {
  db: QueryDatabaseClient;
  environment: Record<string, unknown>;
  request: HttpServerRequest;
}) {
  const configuration = yield* Schema.decodeUnknownEffect(DiscordCommandEnvironment)(environment);
  const secret = request.headers["x-discord-internal-secret"];
  if (
    typeof secret !== "string" ||
    !SecureCompare.equals(secret, configuration.DISCORD_INTERNAL_ASK_SECRET)
  ) {
    return yield* HttpServerResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rawBody = yield* request.text;
  const body = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(DiscordCommandBody))(
    rawBody,
  ).pipe(Effect.mapError((error) => new Error(`Invalid Discord command body: ${String(error)}`)));
  const discordDb = narrowQueryDatabaseClient<ServerDatabase.DiscordDatabaseSchema>(db);
  const healthfitDb = narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db);

  switch (body.operation) {
    case "get-linked-user-id":
      return yield* HttpServerResponse.json({
        userId: yield* ServerDatabase.discordLinks.getLinkedUserId(discordDb, body.discordUserId),
      });
    case "consume-link-code":
      return yield* HttpServerResponse.json({
        result: yield* ServerDatabase.discordLinks.consumeLinkCode(discordDb, {
          code: body.code,
          discordUserId: body.discordUserId,
        }),
      });
    case "unlink-discord-user":
      return yield* HttpServerResponse.json({
        removed: yield* ServerDatabase.discordLinks.unlinkAccountByDiscordUserId(
          discordDb,
          body.discordUserId,
        ),
      });
    case "summary":
      return yield* HttpServerResponse.json({
        content: yield* formatSummary(healthfitDb, body.userId),
      });
    case "last-workout":
      return yield* HttpServerResponse.json({
        content: yield* formatLastWorkout(healthfitDb, body.userId),
      });
    case "recovery": {
      const context = yield* buildChatContext(healthfitDb, body.userId);
      return yield* HttpServerResponse.json({
        content: `Recovery: ${context.recoveryLabel}\n${context.recoveryExplanation}`,
      });
    }
  }
});
