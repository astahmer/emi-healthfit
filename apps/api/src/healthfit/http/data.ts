import { EmiApi } from "@emi/api-contract";
import * as Cloudflare from "alchemy/Cloudflare";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { CurrentUser } from "../../core/auth/request-auth.ts";
import { generateSuggestions, normalizeGeneratedStrings } from "../../core/chat/ai-sdk.ts";
import {
  getSuggestionsById,
  hashSuggestionsKey,
  saveSuggestions,
} from "../../core/db/conversations.ts";
import type { QueryDatabaseClient } from "../../platform/db/client.ts";
import { getAnalyticsOverview, getIngestedDataExportSummary, getWorkouts } from "../db/fitness.ts";
import {
  deleteIngestedSource,
  getRawUploadRetentionDays,
  updateRawUploadRetentionDays,
} from "../db/ingested-data.ts";
import { withInternalError } from "../../core/http/errors.ts";
import { ensureHevyFresh } from "../integrations/hevy/hevy-sync.ts";

type ReadWriteBucketClient = Effect.Success<ReturnType<typeof Cloudflare.R2.ReadWriteBucket>>;

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

export const suggestionsHandlers = ({
  db,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  runtimeContext: Context.Context<never>;
}) =>
  HttpApiBuilder.group(EmiApi, "suggestions", (handlers) =>
    handlers.handle(
      "generate",
      Effect.fn("httpApi.suggestions.generate")(
        function* ({ payload }) {
          const user = yield* CurrentUser;
          const lastAssistantText = payload.lastAssistantText.trim();
          const key = yield* hashSuggestionsKey(lastAssistantText, payload.lastUserText);
          const cached = yield* getSuggestionsById(db, user.id, key);
          if (cached !== null) {
            return { suggestions: normalizeGeneratedStrings(cached.suggestions) };
          }
          const suggestions = yield* Effect.promise(() =>
            generateSuggestions({
              apiKey: payload.config.apiKey,
              baseUrl: payload.config.baseUrl,
              model: payload.config.model,
              lastAssistantText,
              lastUserText: payload.lastUserText,
            }),
          );
          yield* saveSuggestions(db, user.id, key, suggestions);
          return { suggestions };
        },
        withInternalError,
        Effect.provide(runtimeContext),
      ),
    ),
  );

export const analyticsHandlers = ({
  db,
  environment,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  environment: Record<string, unknown>;
  runtimeContext: Context.Context<never>;
}) =>
  HttpApiBuilder.group(EmiApi, "analytics", (handlers) =>
    handlers.handle(
      "overview",
      Effect.fn("httpApi.analytics.overview")(
        function* ({ query }) {
          const user = yield* CurrentUser;
          yield* ensureHevyFresh({ db, userId: user.id, environment });
          return yield* getAnalyticsOverview({ db, userId: user.id, days: query.days ?? 90 });
        },
        withInternalError,
        Effect.provide(runtimeContext),
      ),
    ),
  );

export const dataHandlers = ({
  db,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  runtimeContext: Context.Context<never>;
}) =>
  HttpApiBuilder.group(EmiApi, "data", (handlers) =>
    handlers.handle(
      "exportSummary",
      Effect.fn("httpApi.data.exportSummary")(
        function* () {
          const user = yield* CurrentUser;
          const summary = yield* getIngestedDataExportSummary({ db, userId: user.id });
          return { summary };
        },
        withInternalError,
        Effect.provide(runtimeContext),
      ),
    ),
  );

export const privacyHandlers = ({
  bucket,
  db,
  runtimeContext,
}: {
  bucket: ReadWriteBucketClient;
  db: QueryDatabaseClient;
  runtimeContext: Context.Context<never>;
}) =>
  HttpApiBuilder.group(EmiApi, "privacy", (handlers) =>
    handlers
      .handle(
        "read",
        Effect.fn("httpApi.privacy.read")(
          function* () {
            const user = yield* CurrentUser;
            const rawUploadRetentionDays = yield* getRawUploadRetentionDays({
              db,
              userId: user.id,
            });
            return { rawUploadRetentionDays };
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "update",
        Effect.fn("httpApi.privacy.update")(
          function* ({ payload }) {
            const user = yield* CurrentUser;
            yield* updateRawUploadRetentionDays({
              db,
              userId: user.id,
              days: payload.rawUploadRetentionDays,
            });
            const deletedRawUploads = yield* deleteRawUploads({
              bucket,
              prefix: `${user.id}/`,
              olderThan: new Date(Date.now() - payload.rawUploadRetentionDays * 86_400_000),
            });
            return { rawUploadRetentionDays: payload.rawUploadRetentionDays, deletedRawUploads };
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      )
      .handle(
        "removeSource",
        Effect.fn("httpApi.privacy.removeSource")(
          function* ({ params }) {
            const user = yield* CurrentUser;
            yield* deleteIngestedSource({ db, userId: user.id, source: params.source });
            const deletedRawUploads = yield* deleteRawUploads({
              bucket,
              prefix: `${user.id}/${params.source}/`,
            });
            return { source: params.source, deletedRawUploads };
          },
          withInternalError,
          Effect.provide(runtimeContext),
        ),
      ),
  );

export const workoutsHandlers = ({
  db,
  environment,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  environment: Record<string, unknown>;
  runtimeContext: Context.Context<never>;
}) =>
  HttpApiBuilder.group(EmiApi, "workouts", (handlers) =>
    handlers.handle(
      "list",
      Effect.fn("httpApi.workouts.list")(
        function* () {
          const user = yield* CurrentUser;
          yield* ensureHevyFresh({ db, userId: user.id, environment });
          const workouts = yield* getWorkouts(db, user.id);
          return { workouts };
        },
        withInternalError,
        Effect.provide(runtimeContext),
      ),
    ),
  );
