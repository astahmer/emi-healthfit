import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HealthFit, type DataSummary, type HealthfitDatabaseSchema } from "@emi/flavor-healthfit";
import { HttpServerRequest, toWeb as requestToWeb } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { Cloudflare as CoreCloudflare } from "@emi/core/cloudflare";
import { TtlCache } from "../cache.ts";
import { narrowQueryDatabaseClient, type QueryDatabaseClient } from "../../platform/db/client.ts";
import { decodeJsonOption } from "../../core/lib/json-codec.ts";

const { buildContext: buildChatContext } = HealthFit.chat;
const {
  getAnalyticsOverview,
  getDataSummary,
  getIngestedDataExport,
  getIngestedDataExportSummary,
  getRawUploadRetentionDays,
  getWorkouts,
} = HealthFit.data;
const {
  deleteIngestedSource,
  importIngestedData,
  ingestedDataExportSchema,
  parseHealthExport,
  parseHevyCsv,
  previewIngestedDataImport,
  updateRawUploadRetentionDays,
  updateSyncCursor,
} = HealthFit.ingest;
const {
  insertHealthWorkouts,
  upsertBodyMetrics,
  upsertDailyActivity,
  upsertHevySessions,
  upsertHevySets,
  upsertSleepSessions,
} = HealthFit.storage;
const { ensureFresh: ensureHevyFresh } = HealthFit.hevy;

type ReadWriteBucketClient = Effect.Success<ReturnType<typeof Cloudflare.R2.ReadWriteBucket>>;

class IngestFileError extends Schema.TaggedErrorClass<IngestFileError>()("IngestFileError", {
  phase: Schema.Literals(["form", "health", "hevy"]),
  message: Schema.String,
}) {}

const toHealthfitDb = (db: QueryDatabaseClient) =>
  narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db);

const deleteRawUploads = Effect.fn("privacy.deleteRawUploads")(function* ({
  bucket,
  prefix,
  olderThan,
}: {
  bucket: ReadWriteBucketClient;
  prefix?: string;
  olderThan?: Date;
}) {
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const page = yield* bucket.list({ prefix, cursor });
    const keys = page.objects
      .filter((object) => olderThan === undefined || object.uploaded < olderThan)
      .map((object) => object.key);
    if (keys.length > 0) {
      yield* bucket.delete(keys);
      deleted += keys.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);
  return deleted;
});

const applyRawUploadRetention = Effect.fn("privacy.applyRetention")(function* ({
  db,
  bucket,
  userId,
}: {
  db: QueryDatabaseClient;
  bucket: ReadWriteBucketClient;
  userId: string;
}) {
  const days = yield* getRawUploadRetentionDays({ db: toHealthfitDb(db), userId });
  return yield* deleteRawUploads({
    bucket,
    prefix: `${userId}/`,
    olderThan: new Date(Date.now() - days * 86_400_000),
  });
});

export const handleIngest = (
  db: QueryDatabaseClient,
  bucket: ReadWriteBucketClient,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const user = yield* CoreCloudflare.user.CurrentUser;
    const healthfitDb = toHealthfitDb(db);
    const nativeRequest = yield* requestToWeb(request);
    const formData = yield* Effect.tryPromise({
      try: () => nativeRequest.formData(),
      catch: (error) =>
        new IngestFileError({
          phase: "form",
          message: `Failed to read form data: ${error}`,
        }),
    });

    const healthEntry = formData.get("health_export");
    const hevyEntry = formData.get("hevy_export");
    const healthFile = healthEntry instanceof File ? healthEntry : null;
    const hevyFile = hevyEntry instanceof File ? hevyEntry : null;

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
        catch: (error) =>
          new IngestFileError({
            phase: "health",
            message: `Failed to read health file: ${error}`,
          }),
      });

      yield* bucket.put(`${user.id}/health/${timestamp}_${healthFile.name}`, healthText, {
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

      yield* upsertDailyActivity(healthfitDb, user.id, parsed.daily);
      yield* insertHealthWorkouts(healthfitDb, user.id, parsed.workouts);
      yield* upsertSleepSessions(healthfitDb, user.id, parsed.sleep);
      yield* upsertBodyMetrics(healthfitDb, user.id, parsed.body);
      yield* updateSyncCursor(healthfitDb, user.id, "apple_health", timestamp);
    }

    if (hevyFile !== null) {
      const hevyText = yield* Effect.tryPromise({
        try: () => hevyFile.text(),
        catch: (error) =>
          new IngestFileError({
            phase: "hevy",
            message: `Failed to read hevy file: ${error}`,
          }),
      });

      yield* bucket.put(`${user.id}/hevy/${timestamp}_${hevyFile.name}`, hevyText, {
        httpMetadata: { contentType: hevyFile.type || "text/csv" },
      });

      const parsed = yield* parseHevyCsv(hevyText);

      hevySummary = {
        sessions: parsed.sessions.length,
        sets: parsed.sets.length,
      };

      yield* upsertHevySessions(healthfitDb, user.id, parsed.sessions);
      yield* upsertHevySets(healthfitDb, user.id, parsed.sets);
      yield* updateSyncCursor(healthfitDb, user.id, "hevy", timestamp);
    }

    yield* applyRawUploadRetention({ db, bucket, userId: user.id });

    return yield* HttpServerResponse.json({
      health: healthSummary,
      hevy: hevySummary,
    });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: String(error) }, { status: 500 })),
  );

export const handleRecovery = (db: QueryDatabaseClient, environment: Record<string, unknown>) =>
  Effect.gen(function* () {
    const user = yield* CoreCloudflare.user.CurrentUser;
    yield* ensureHevyFresh({
      db: toHealthfitDb(db),
      userId: user.id,
      environment,
    });
    const ctx = yield* buildChatContext(toHealthfitDb(db), user.id);
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
    Effect.catch((error) =>
      HttpServerResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    ),
  );

const summaryCache = new TtlCache<DataSummary>();
const SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000;

export const handleSummary = (db: QueryDatabaseClient, environment: Record<string, unknown>) =>
  Effect.gen(function* () {
    const user = yield* CoreCloudflare.user.CurrentUser;
    const cached = summaryCache.get(user.id);
    if (cached !== undefined) {
      return yield* HttpServerResponse.json(cached);
    }

    yield* ensureHevyFresh({
      db: toHealthfitDb(db),
      userId: user.id,
      environment,
    });
    const summary = yield* getDataSummary(toHealthfitDb(db), user.id);
    summaryCache.set(user.id, summary, SUMMARY_CACHE_TTL_MS);
    return yield* HttpServerResponse.json(summary);
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleAnalyticsOverview = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const user = yield* CoreCloudflare.user.CurrentUser;
    const requestedDays = Number(new URL(request.url, "http://localhost").searchParams.get("days"));
    const days =
      Number.isInteger(requestedDays) && requestedDays >= 7 && requestedDays <= 365
        ? requestedDays
        : 90;
    const overview = yield* getAnalyticsOverview({
      db: toHealthfitDb(db),
      userId: user.id,
      days,
    });
    return yield* HttpServerResponse.json(overview);
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleIngestedDataExport = (db: QueryDatabaseClient) =>
  Effect.gen(function* () {
    const user = yield* CoreCloudflare.user.CurrentUser;
    const data = yield* getIngestedDataExport({
      db: toHealthfitDb(db),
      userId: user.id,
    });
    return yield* HttpServerResponse.json(data);
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleIngestedDataExportSummary = (db: QueryDatabaseClient) =>
  Effect.gen(function* () {
    const user = yield* CoreCloudflare.user.CurrentUser;
    const summary = yield* getIngestedDataExportSummary({
      db: toHealthfitDb(db),
      userId: user.id,
    });
    return yield* HttpServerResponse.json({ summary });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleIngestedDataImport = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const user = yield* CoreCloudflare.user.CurrentUser;
    const raw = decodeJsonOption(yield* request.text);
    if (Option.isNone(raw)) {
      return yield* HttpServerResponse.json({ error: "Invalid HealthFit export" }, { status: 400 });
    }
    const parsed = Schema.decodeUnknownOption(ingestedDataExportSchema)(raw.value);
    if (Option.isNone(parsed)) {
      return yield* HttpServerResponse.json({ error: "Invalid HealthFit export" }, { status: 400 });
    }
    const preview = yield* previewIngestedDataImport({
      db: toHealthfitDb(db),
      userId: user.id,
      data: parsed.value,
    });
    const apply = new URL(request.url, "http://localhost").searchParams.get("apply") === "true";
    if (apply) {
      yield* importIngestedData({ db: toHealthfitDb(db), userId: user.id, data: parsed.value });
      summaryCache.clear();
    }
    return yield* HttpServerResponse.json({ preview, applied: apply });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handlePrivacyRead = (db: QueryDatabaseClient) =>
  Effect.gen(function* () {
    const user = yield* CoreCloudflare.user.CurrentUser;
    const rawUploadRetentionDays = yield* getRawUploadRetentionDays({
      db: toHealthfitDb(db),
      userId: user.id,
    });
    return yield* HttpServerResponse.json({ rawUploadRetentionDays });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handlePrivacyUpdate = (
  db: QueryDatabaseClient,
  bucket: ReadWriteBucketClient,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const user = yield* CoreCloudflare.user.CurrentUser;
    const raw = decodeJsonOption(yield* request.text);
    if (Option.isNone(raw)) {
      return yield* HttpServerResponse.json(
        { error: "Retention must be between 0 and 3650 days" },
        { status: 400 },
      );
    }
    const parsed = Schema.decodeUnknownOption(
      Schema.Struct({
        rawUploadRetentionDays: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3650 })),
      }),
    )(raw.value);
    if (Option.isNone(parsed)) {
      return yield* HttpServerResponse.json(
        { error: "Retention must be between 0 and 3650 days" },
        { status: 400 },
      );
    }
    yield* updateRawUploadRetentionDays({
      db: toHealthfitDb(db),
      userId: user.id,
      days: parsed.value.rawUploadRetentionDays,
    });
    const deletedRawUploads = yield* applyRawUploadRetention({ db, bucket, userId: user.id });
    return yield* HttpServerResponse.json({
      rawUploadRetentionDays: parsed.value.rawUploadRetentionDays,
      deletedRawUploads,
    });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleSourceDelete = (
  db: QueryDatabaseClient,
  bucket: ReadWriteBucketClient,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const user = yield* CoreCloudflare.user.CurrentUser;
    const source = new URL(request.url).pathname.match(/\/api\/privacy\/data\/(health|hevy)$/)?.[1];
    if (source !== "health" && source !== "hevy") {
      return yield* HttpServerResponse.json({ error: "Unknown data source" }, { status: 400 });
    }
    yield* deleteIngestedSource({ db: toHealthfitDb(db), userId: user.id, source });
    const deletedRawUploads = yield* deleteRawUploads({ bucket, prefix: `${user.id}/${source}/` });
    return yield* HttpServerResponse.json({ source, deletedRawUploads });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

export const handleWorkouts = (db: QueryDatabaseClient) =>
  Effect.gen(function* () {
    const user = yield* CoreCloudflare.user.CurrentUser;
    const workouts = yield* getWorkouts(toHealthfitDb(db), user.id);
    return yield* HttpServerResponse.json({ workouts });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );
