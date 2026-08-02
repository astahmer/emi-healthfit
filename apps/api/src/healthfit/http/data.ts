import { HealthFitApi } from "@emi/flavor-healthfit/contract";
import { Chat } from "@emi/core/chat";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Cloudflare as CoreCloudflare } from "@emi/core/cloudflare";
import { ServerDatabase } from "@emi/core/server/database";
import { HealthFit, type HealthfitDatabaseSchema } from "@emi/flavor-healthfit";
import { narrowQueryDatabaseClient, type QueryDatabaseClient } from "../../platform/db/client.ts";
import { withInternalError } from "../../core/http/errors.ts";

type ReadWriteBucketClient = Effect.Success<ReturnType<typeof Cloudflare.R2.ReadWriteBucket>>;

const toHealthfitDb = (db: QueryDatabaseClient) =>
  narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db);

const {
  getAnalyticsOverview,
  getIngestedDataExportSummary,
  getRawUploadRetentionDays,
  getWorkouts,
} = HealthFit.data;
const { deleteIngestedSource, updateRawUploadRetentionDays } = HealthFit.ingest;
const { ensureFresh: ensureHevyFresh } = HealthFit.hevy;

export const deleteRawUploads = Effect.fn("privacy.deleteRawUploads")(function* ({
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

export const suggestionsHandlers = () =>
  HttpApiBuilder.group(HealthFitApi, "suggestions", (handlers) =>
    Effect.gen(function* () {
      const conversationDatabase = yield* ServerDatabase.conversations;
      return handlers.handle(
        "generate",
        Effect.fn("httpApi.suggestions.generate")(function* ({ payload }) {
          const user = yield* CoreCloudflare.user.CurrentUser;
          const lastAssistantText = payload.lastAssistantText.trim();
          const key = yield* ServerDatabase.conversations.hashSuggestionsKey(
            lastAssistantText,
            payload.lastUserText,
          );
          const cached = yield* conversationDatabase.getSuggestionsById({
            userId: user.id,
            id: key,
          });
          if (cached !== null) {
            return { suggestions: Chat.generation.normalizeGeneratedStrings(cached.suggestions) };
          }
          const suggestions = yield* Effect.promise(() =>
            Chat.generation.generateSuggestions({
              configuration: payload.config,
              lastAssistantText,
              lastUserText: payload.lastUserText,
            }),
          );
          yield* conversationDatabase.saveSuggestions({
            userId: user.id,
            id: key,
            suggestions,
          });
          return { suggestions };
        }, withInternalError),
      );
    }),
  );

export const analyticsHandlers = ({
  db,
  environment,
}: {
  db: QueryDatabaseClient;
  environment: Record<string, unknown>;
}) =>
  HttpApiBuilder.group(HealthFitApi, "analytics", (handlers) =>
    handlers.handle(
      "overview",
      Effect.fn("httpApi.analytics.overview")(function* ({ query }) {
        const user = yield* CoreCloudflare.user.CurrentUser;
        yield* ensureHevyFresh({
          db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
          userId: user.id,
          environment,
        });
        return yield* getAnalyticsOverview({
          db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
          userId: user.id,
          days: query.days ?? 90,
        });
      }, withInternalError),
    ),
  );

export const dataHandlers = ({ db }: { db: QueryDatabaseClient }) =>
  HttpApiBuilder.group(HealthFitApi, "data", (handlers) =>
    handlers.handle(
      "exportSummary",
      Effect.fn("httpApi.data.exportSummary")(function* () {
        const user = yield* CoreCloudflare.user.CurrentUser;
        const summary = yield* getIngestedDataExportSummary({
          db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
          userId: user.id,
        });
        return { summary };
      }, withInternalError),
    ),
  );

export const privacyHandlers = ({
  bucket,
  db,
}: {
  bucket: ReadWriteBucketClient;
  db: QueryDatabaseClient;
}) =>
  HttpApiBuilder.group(HealthFitApi, "privacy", (handlers) =>
    handlers
      .handle(
        "read",
        Effect.fn("httpApi.privacy.read")(function* () {
          const user = yield* CoreCloudflare.user.CurrentUser;
          const rawUploadRetentionDays = yield* getRawUploadRetentionDays({
            db: toHealthfitDb(db),
            userId: user.id,
          });
          return { rawUploadRetentionDays };
        }, withInternalError),
      )
      .handle(
        "update",
        Effect.fn("httpApi.privacy.update")(function* ({ payload }) {
          const user = yield* CoreCloudflare.user.CurrentUser;
          yield* updateRawUploadRetentionDays({
            db: toHealthfitDb(db),
            userId: user.id,
            days: payload.rawUploadRetentionDays,
          });
          const deletedRawUploads = yield* deleteRawUploads({
            bucket,
            prefix: `${user.id}/`,
            olderThan: new Date(Date.now() - payload.rawUploadRetentionDays * 86_400_000),
          });
          return { rawUploadRetentionDays: payload.rawUploadRetentionDays, deletedRawUploads };
        }, withInternalError),
      )
      .handle(
        "removeSource",
        Effect.fn("httpApi.privacy.removeSource")(function* ({ params }) {
          const user = yield* CoreCloudflare.user.CurrentUser;
          yield* deleteIngestedSource({
            db: toHealthfitDb(db),
            userId: user.id,
            source: params.source,
          });
          const deletedRawUploads = yield* deleteRawUploads({
            bucket,
            prefix: `${user.id}/${params.source}/`,
          });
          return { source: params.source, deletedRawUploads };
        }, withInternalError),
      ),
  );

export const workoutsHandlers = ({
  db,
  environment,
}: {
  db: QueryDatabaseClient;
  environment: Record<string, unknown>;
}) =>
  HttpApiBuilder.group(HealthFitApi, "workouts", (handlers) =>
    handlers.handle(
      "list",
      Effect.fn("httpApi.workouts.list")(function* () {
        const user = yield* CoreCloudflare.user.CurrentUser;
        yield* ensureHevyFresh({
          db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
          userId: user.id,
          environment,
        });
        const workouts = yield* getWorkouts(
          narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
          user.id,
        );
        return { workouts };
      }, withInternalError),
    ),
  );
