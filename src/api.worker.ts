import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { buildChatContext, renderContextPrompt } from "./chat/context.ts";
import { handleChat } from "./chat/handler.ts";
import { parseHealthExport } from "./ingest/health.ts";
import { parseHevyCsv } from "./ingest/hevy.ts";
import {
  insertHealthWorkouts,
  upsertBodyMetrics,
  upsertDailyActivity,
  upsertHevySessions,
  upsertHevySets,
  upsertSleepSessions,
} from "./db/operations.ts";

const DB = Cloudflare.D1.Database("GymData");
const ExportsBucket = Cloudflare.R2.Bucket("Exports");
const AiGateway = Cloudflare.AI.Gateway("AiGateway");

export default class Api extends Cloudflare.Worker<Api>()(
  "Api",
  {
    main: import.meta.url,
    observability: {
      enabled: true,
    },
  },
  Effect.gen(function* () {
    const db = yield* Cloudflare.D1.QueryDatabase(DB);
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(ExportsBucket);
    const aiGateway = yield* Cloudflare.AI.QueryGateway(AiGateway);
    const env = yield* Cloudflare.CloudflareEnvironment;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const url = new URL(request.url, "http://localhost");

        if (url.pathname === "/ingest" && request.method === "POST") {
          return yield* handleIngest(db, bucket, request);
        }

        if (url.pathname === "/chat" && request.method === "POST") {
          return yield* handleChatRoute(db, aiGateway, env, request);
        }

        if (url.pathname === "/api/recovery" && request.method === "GET") {
          return yield* handleRecovery(db);
        }

        return HttpServerResponse.text("Not Found", { status: 404 });
      }),
    };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Cloudflare.D1.QueryDatabaseBinding,
        Cloudflare.R2.ReadWriteBucketBinding,
        Cloudflare.AI.QueryGatewayBinding,
      ),
    ),
  ),
) {}

const handleIngest = (
  db: ReturnType<typeof Cloudflare.D1.QueryDatabase> extends Effect.Effect<infer T> ? T : never,
  bucket: ReturnType<typeof Cloudflare.R2.ReadWriteBucket> extends Effect.Effect<infer T> ? T : never,
  request: typeof HttpServerRequest.Service,
): Effect.Effect<typeof HttpServerResponse.HttpServerResponse> =>
  Effect.gen(function* () {
    const formData = yield* Effect.tryPromise({
      try: () => request.formData(),
      catch: (error) => new Error(`Failed to read form data: ${error}`),
    });

    const healthFile = formData.get("health_export") as File | null;
    const hevyFile = formData.get("hevy_export") as File | null;

    if (healthFile === null && hevyFile === null) {
      return yield* HttpServerResponse.json(
        { error: "Expected health_export and/or hevy_export files" },
        { status: 400 },
      );
    }

    const timestamp = new Date().toISOString();
    let healthSummary = { daily: 0, workouts: 0, sleep: 0, body: 0 };
    let hevySummary = { sessions: 0, sets: 0 };

    if (healthFile !== null) {
      const healthText = yield* Effect.tryPromise({
        try: () => healthFile.text(),
        catch: (error) => new Error(`Failed to read health file: ${error}`),
      });

      yield* bucket.put(`health/${timestamp}_${healthFile.name}`, healthText, {
        httpMetadata: { contentType: healthFile.type || "application/json" },
      });

      const startYear = Number(healthFile.name.match(/(\d{4})/)?.[0] ?? new Date().getFullYear());
      const parsed = yield* parseHealthExport(healthText, startYear);

      healthSummary = {
        daily: parsed.daily.length,
        workouts: parsed.workouts.length,
        sleep: parsed.sleep.length,
        body: parsed.body.length,
      };

      yield* upsertDailyActivity(db, parsed.daily);
      yield* insertHealthWorkouts(db, parsed.workouts);
      yield* upsertSleepSessions(db, parsed.sleep);
      yield* upsertBodyMetrics(db, parsed.body);
    }

    if (hevyFile !== null) {
      const hevyText = yield* Effect.tryPromise({
        try: () => hevyFile.text(),
        catch: (error) => new Error(`Failed to read hevy file: ${error}`),
      });

      yield* bucket.put(`hevy/${timestamp}_${hevyFile.name}`, hevyText, {
        httpMetadata: { contentType: hevyFile.type || "text/csv" },
      });

      const parsed = yield* parseHevyCsv(hevyText);

      hevySummary = {
        sessions: parsed.sessions.length,
        sets: parsed.sets.length,
      };

      yield* upsertHevySessions(db, parsed.sessions);
      yield* upsertHevySets(db, parsed.sets);
    }

    return yield* HttpServerResponse.json({
      health: healthSummary,
      hevy: hevySummary,
    });
  }).pipe(
    Effect.catchAll((error) =>
      HttpServerResponse.json({ error: error.message }, { status: 500 }),
    ),
  );

const handleChatRoute = (
  db: ReturnType<typeof Cloudflare.D1.QueryDatabase> extends Effect.Effect<infer T> ? T : never,
  aiGateway: ReturnType<typeof Cloudflare.AI.QueryGateway> extends Effect.Effect<infer T> ? T : never,
  env: Record<string, unknown>,
  request: typeof HttpServerRequest.Service,
): Effect.Effect<typeof HttpServerResponse.HttpServerResponse> =>
  Effect.gen(function* () {
    const text = yield* Effect.tryPromise({
      try: () => request.text(),
      catch: (error) => new Error(`Failed to read request body: ${error}`),
    });

    const body = JSON.parse(text || "{}") as { message?: string };
    const message = body.message?.trim();

    if (message === undefined || message === "") {
      return yield* HttpServerResponse.json(
        { error: "message is required" },
        { status: 400 },
      );
    }

    const result = yield* handleChat(db, aiGateway, env, { message });
    return yield* HttpServerResponse.json(result);
  }).pipe(
    Effect.catchAll((error) =>
      HttpServerResponse.json({ error: error.message }, { status: 500 }),
    ),
  );

const handleRecovery = (
  db: ReturnType<typeof Cloudflare.D1.QueryDatabase> extends Effect.Effect<infer T> ? T : never,
): Effect.Effect<typeof HttpServerResponse.HttpServerResponse> =>
  Effect.gen(function* () {
    const ctx = yield* buildChatContext(db);
    return yield* HttpServerResponse.json({
      today: ctx.today,
      label: ctx.recoveryLabel,
      explanation: ctx.recoveryExplanation,
      lastWorkout: ctx.lastWorkout.lastSessionSummary,
      sleepAverageHours: ctx.sleep.sevenDayAverage !== null ? ctx.sleep.sevenDayAverage / 60 : null,
      recentWorkoutCount: ctx.recentWorkoutCount,
      recentVolume: ctx.lastWorkout.recentVolume,
    });
  }).pipe(
    Effect.catchAll((error) =>
      HttpServerResponse.json({ error: error.message }, { status: 500 }),
    ),
  );
