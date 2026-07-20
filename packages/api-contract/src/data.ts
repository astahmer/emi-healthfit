import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { Content, Deleted, Identifier, StandardErrors } from "./common.ts";

const NullableNumber = Schema.NullOr(Schema.Number);

export const OpenAiClientConfig = Schema.Struct({
  apiKey: Content,
  baseUrl: Schema.optional(Schema.String),
  model: Schema.String,
});

export class SuggestionsApi extends HttpApiGroup.make("suggestions")
  .add(
    HttpApiEndpoint.post("generate", "/suggestions", {
      payload: Schema.Struct({
        threadId: Schema.optional(Schema.String),
        messageId: Schema.optional(Schema.String),
        lastAssistantText: Content,
        lastUserText: Schema.optional(Schema.String),
        config: OpenAiClientConfig,
      }),
      success: Schema.Struct({ suggestions: Schema.Array(Schema.String) }),
      error: StandardErrors,
    }),
  )
  .prefix("/api") {}

export class MemoriesExtraApi extends HttpApiGroup.make("memoryExtraction")
  .add(
    HttpApiEndpoint.post("extract", "/memories/extract", {
      payload: Schema.Struct({
        text: Content,
        threadId: Schema.optional(Schema.String),
        messageId: Schema.optional(Schema.String),
        source: Schema.optional(Schema.Literals(["auto", "manual"])),
        config: OpenAiClientConfig,
      }),
      success: Schema.Struct({ ids: Schema.Array(Schema.String), count: Schema.Number }),
      error: StandardErrors,
    }),
  )
  .prefix("/api") {}

const ActivityDay = Schema.Struct({
  date: Schema.String,
  steps: NullableNumber,
  active_kcal: NullableNumber,
  exercise_min: NullableNumber,
});
const SleepDay = Schema.Struct({
  date: Schema.String,
  asleep_min: NullableNumber,
  in_bed_min: NullableNumber,
});
const TrainingDay = Schema.Struct({
  date: Schema.String,
  workouts: Schema.Number,
  volume_kg: NullableNumber,
  duration_sec: NullableNumber,
});
const BodyDay = Schema.Struct({
  date: Schema.String,
  weight_kg: NullableNumber,
  body_fat_pct: NullableNumber,
  lean_mass_kg: NullableNumber,
});

export class AnalyticsApi extends HttpApiGroup.make("analytics")
  .add(
    HttpApiEndpoint.get("overview", "/analytics/overview", {
      query: {
        days: Schema.optional(
          Schema.NumberFromString.check(
            Schema.isInt(),
            Schema.isBetween({ minimum: 7, maximum: 365 }),
          ),
        ),
      },
      success: Schema.Struct({
        days: Schema.Number,
        activity: Schema.Array(ActivityDay),
        sleep: Schema.Array(SleepDay),
        body: Schema.Array(BodyDay),
        training: Schema.Array(TrainingDay),
        exercises: Schema.Array(
          Schema.Struct({
            exercise_title: Schema.String,
            sets: Schema.Number,
            volume_kg: Schema.Number,
          }),
        ),
        highlights: Schema.Struct({
          averageSteps: NullableNumber,
          averageSleepMinutes: NullableNumber,
          workouts: Schema.Number,
          trainingVolumeKg: Schema.Number,
          weightChangeKg: NullableNumber,
        }),
      }),
      error: StandardErrors,
    }),
  )
  .prefix("/api") {}

const ExportRange = Schema.Struct({
  first: Schema.NullOr(Schema.String),
  last: Schema.NullOr(Schema.String),
});

export class DataApi extends HttpApiGroup.make("data")
  .add(
    HttpApiEndpoint.get("exportSummary", "/export/ingested-data/summary", {
      success: Schema.Struct({
        summary: Schema.Struct({
          totalRecords: Schema.Number,
          healthRange: ExportRange,
          hevyRange: ExportRange,
        }),
      }),
      error: StandardErrors,
    }),
  )
  .prefix("/api") {}

export class PrivacyApi extends HttpApiGroup.make("privacy")
  .add(
    HttpApiEndpoint.get("read", "/privacy", {
      success: Schema.Struct({ rawUploadRetentionDays: Schema.Number }),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.patch("update", "/privacy", {
      payload: Schema.Struct({
        rawUploadRetentionDays: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3650 })),
      }),
      success: Schema.Struct({
        rawUploadRetentionDays: Schema.Number,
        deletedRawUploads: Schema.Number,
      }),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.delete("removeSource", "/privacy/data/:source", {
      params: { source: Schema.Literals(["health", "hevy"]) },
      success: Schema.Struct({
        source: Schema.Literals(["health", "hevy"]),
        deletedRawUploads: Schema.Number,
      }),
      error: StandardErrors,
    }),
  )
  .prefix("/api") {}

const WorkoutSet = Schema.Struct({
  set_index: Schema.Number,
  set_type: Schema.NullOr(Schema.String),
  weight_kg: NullableNumber,
  reps: NullableNumber,
  rpe: NullableNumber,
  distance_km: NullableNumber,
  duration_seconds: NullableNumber,
  exercise_notes: Schema.NullOr(Schema.String),
});

const Workout = Schema.Struct({
  session_id: Identifier,
  title: Schema.NullOr(Schema.String),
  start_time: Schema.String,
  end_time: Schema.NullOr(Schema.String),
  duration_sec: NullableNumber,
  total_volume_kg: NullableNumber,
  sets: Schema.Number,
  exercises: Schema.Number,
  exerciseDetails: Schema.Array(
    Schema.Struct({ exercise_title: Schema.String, sets: Schema.Array(WorkoutSet) }),
  ),
});

export class WorkoutsApi extends HttpApiGroup.make("workouts")
  .add(
    HttpApiEndpoint.get("list", "/workouts", {
      success: Schema.Struct({ workouts: Schema.Array(Workout) }),
      error: StandardErrors,
    }),
  )
  .prefix("/api") {}

const NullableString = Schema.NullOr(Schema.String);

const HevySyncSummary = Schema.Struct({
  mode: Schema.Literals(["initial", "incremental", "skipped_fresh", "skipped_busy"]),
  imported: Schema.Number,
  updated: Schema.Number,
  deleted: Schema.Number,
  ambiguousLegacy: Schema.Number,
  startedAt: Schema.String,
  completedAt: Schema.String,
  lastErrorCode: NullableString,
});

export class HevyIntegrationApi extends HttpApiGroup.make("hevy")
  .add(
    HttpApiEndpoint.get("status", "/integrations/hevy", {
      success: Schema.Struct({
        connected: Schema.Boolean,
        status: Schema.String,
        providerUserId: NullableString,
        lastCheckedAt: NullableString,
        lastSuccessAt: NullableString,
        lastDataChangeAt: NullableString,
        lastErrorCode: NullableString,
        lastErrorAt: NullableString,
        fresh: Schema.Boolean,
      }),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.put("connect", "/integrations/hevy", {
      payload: Schema.Struct({ apiKey: Content }),
      success: Schema.Struct({
        status: Schema.Struct({
          connected: Schema.Boolean,
          status: Schema.String,
          providerUserId: NullableString,
          lastCheckedAt: NullableString,
          lastSuccessAt: NullableString,
          lastDataChangeAt: NullableString,
          lastErrorCode: NullableString,
          lastErrorAt: NullableString,
          fresh: Schema.Boolean,
        }),
        sync: HevySyncSummary,
        providerUserName: NullableString,
      }),
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("sync", "/integrations/hevy/sync", {
      success: HevySyncSummary,
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.delete("disconnect", "/integrations/hevy", {
      success: Deleted,
      error: StandardErrors,
    }),
  )
  .add(
    HttpApiEndpoint.delete("removeData", "/integrations/hevy/data", {
      success: Schema.Struct({
        deletedRawUploads: Schema.Number,
      }),
      error: StandardErrors,
    }),
  )
  .prefix("/api") {}
