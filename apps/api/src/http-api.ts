import { CoreApi, type Memory as ApiMemory, type Note as ApiNote } from "@emi/core/contract";
import { HealthFitApi } from "@emi/flavor-healthfit/contract";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { HttpApiBuilder, OpenApi } from "effect/unstable/httpapi";
import { ServerDatabase } from "@emi/core/server/database";
import { Cloudflare as CoreCloudflare } from "@emi/core/cloudflare";
import { narrowQueryDatabaseClient, type QueryDatabaseClient } from "./platform/db/client.ts";
import {
  conversationsHandlers,
  memoryExtractionHandlers,
  messagesHandlers,
  threadsHandlers,
} from "./core/http/conversations.ts";
import { discordHandlers } from "./core/http/discord.ts";
import {
  analyticsHandlers,
  dataHandlers,
  privacyHandlers,
  suggestionsHandlers,
  workoutsHandlers,
} from "./healthfit/http/data.ts";
import { hevyHandlers } from "./healthfit/http/hevy.ts";

type ReadWriteBucketClient = Effect.Success<ReturnType<typeof Cloudflare.R2.ReadWriteBucket>>;

const MemoryDatabase = ServerDatabase.memories;
const HttpApiHandler = Schema.Struct({
  routes: Schema.declare<Array<HttpRouter.Route<never, never>>>(Array.isArray),
});

const requireIdentifier = (identifier: string | null): string => {
  if (identifier === null) throw new Error("Database did not return an identifier");
  return identifier;
};

const toApiNote = (note: ApiNote): ApiNote => ({
  id: note.id,
  content: note.content,
  created_at: note.created_at,
  updated_at: note.updated_at,
});

const toApiMemory = (memory: ApiMemory): ApiMemory => ({
  id: memory.id,
  content: memory.content,
  source: memory.source,
  thread_id: memory.thread_id,
  created_at: memory.created_at,
  rank: memory.rank,
});

const notesHandlers = ({
  db,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  runtimeContext: Context.Context<never>;
}) => {
  const notesDb = narrowQueryDatabaseClient<ServerDatabase.MemoryDatabaseSchema>(db);
  const databaseLayer = MemoryDatabase.layer({ db: notesDb });
  const provideDatabase = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provide(databaseLayer), Effect.provide(runtimeContext));
  return HttpApiBuilder.group(CoreApi, "notes", (handlers) =>
    handlers
      .handle(
        "list",
        Effect.fn("httpApi.notes.list")(function* ({ query }) {
          const user = yield* CoreCloudflare.user.CurrentUser;
          const limit = query.limit ?? 100;
          const notes =
            query.search === undefined
              ? yield* MemoryDatabase.getNotes({ userId: user.id, limit })
              : yield* MemoryDatabase.searchNotes({
                  userId: user.id,
                  query: query.search,
                  limit,
                });
          return { notes: notes.map(toApiNote) };
        }, provideDatabase),
      )
      .handle(
        "create",
        Effect.fn("httpApi.notes.create")(function* ({ payload }) {
          const user = yield* CoreCloudflare.user.CurrentUser;
          const id = yield* MemoryDatabase.insertNote({
            userId: user.id,
            content: payload.content,
          });
          return { id: requireIdentifier(id) };
        }, provideDatabase),
      )
      .handle(
        "update",
        Effect.fn("httpApi.notes.update")(function* ({ params, payload }) {
          const user = yield* CoreCloudflare.user.CurrentUser;
          yield* MemoryDatabase.updateNote({
            userId: user.id,
            id: params.id,
            content: payload.content,
          });
          return { success: true } satisfies { success: true };
        }, provideDatabase),
      )
      .handle(
        "remove",
        Effect.fn("httpApi.notes.remove")(function* ({ params }) {
          const user = yield* CoreCloudflare.user.CurrentUser;
          yield* MemoryDatabase.deleteNote({ userId: user.id, id: params.id });
          return { success: true } satisfies { success: true };
        }, provideDatabase),
      ),
  );
};

const memoriesHandlers = ({
  db,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  runtimeContext: Context.Context<never>;
}) => {
  const memoriesDb = narrowQueryDatabaseClient<ServerDatabase.MemoryDatabaseSchema>(db);
  const databaseLayer = MemoryDatabase.layer({ db: memoriesDb });
  const provideDatabase = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provide(databaseLayer), Effect.provide(runtimeContext));
  return HttpApiBuilder.group(CoreApi, "memories", (handlers) =>
    handlers
      .handle(
        "list",
        Effect.fn("httpApi.memories.list")(function* ({ query }) {
          const user = yield* CoreCloudflare.user.CurrentUser;
          const limit = query.limit ?? 100;
          const memories =
            query.search === undefined
              ? yield* MemoryDatabase.getMemories({ userId: user.id, options: { limit } })
              : yield* MemoryDatabase.searchMemories({
                  userId: user.id,
                  query: query.search,
                  options: { limit },
                });
          return { memories: memories.map(toApiMemory) };
        }, provideDatabase),
      )
      .handle(
        "create",
        Effect.fn("httpApi.memories.create")(function* ({ payload }) {
          const user = yield* CoreCloudflare.user.CurrentUser;
          const id = yield* MemoryDatabase.insertMemory({
            userId: user.id,
            content: payload.content,
            source: payload.source,
            threadId: payload.threadId,
            messageId: payload.messageId,
          });
          return { id: requireIdentifier(id) };
        }, provideDatabase),
      )
      .handle(
        "remove",
        Effect.fn("httpApi.memories.remove")(function* ({ params }) {
          const user = yield* CoreCloudflare.user.CurrentUser;
          yield* MemoryDatabase.deleteMemory({ userId: user.id, id: params.id });
          return { success: true } satisfies { success: true };
        }, provideDatabase),
      )
      .handle(
        "removeByMessage",
        Effect.fn("httpApi.memories.removeByMessage")(function* ({ params }) {
          const user = yield* CoreCloudflare.user.CurrentUser;
          yield* MemoryDatabase.deleteMemoriesByMessage({
            userId: user.id,
            messageId: params.messageId,
          });
          return { success: true } satisfies { success: true };
        }, provideDatabase),
      ),
  );
};

export const registerHttpApi = Effect.fn("httpApi.register")(function* ({
  bucket,
  db,
  environment,
  router,
}: {
  bucket: ReadWriteBucketClient;
  db: QueryDatabaseClient;
  environment: Record<string, unknown>;
  router: HttpRouter.HttpRouter;
}) {
  const runtimeContext = Context.empty();
  const handlerContext = yield* Layer.build(
    Layer.mergeAll(
      notesHandlers({ db, runtimeContext }),
      memoriesHandlers({ db, runtimeContext }),
      conversationsHandlers({ db, runtimeContext }),
      threadsHandlers({ db, runtimeContext }),
      messagesHandlers({ db, runtimeContext }),
      memoryExtractionHandlers({ db, runtimeContext }),
      suggestionsHandlers({ db, runtimeContext }),
      analyticsHandlers({ db, environment, runtimeContext }),
      dataHandlers({ db, runtimeContext }),
      privacyHandlers({ bucket, db, runtimeContext }),
      workoutsHandlers({ db, environment, runtimeContext }),
      hevyHandlers({ bucket, db, environment, runtimeContext }),
      discordHandlers({ db, runtimeContext }),
    ),
  ).pipe(Effect.scoped);
  const routes = Object.values(HealthFitApi.groups).flatMap((group) => {
    const service = handlerContext.mapUnsafe.get(group.key);
    if (service === undefined) throw new Error(`Missing handlers for ${group.identifier}`);
    const handler = Schema.decodeUnknownOption(HttpApiHandler)(service);
    if (Option.isNone(handler)) throw new Error(`Missing routes for ${group.identifier}`);
    return handler.value.routes;
  });
  yield* router.addAll(routes) as Effect.Effect<void>;
  yield* router.add(
    "GET",
    "/api/openapi.json",
    Effect.succeed(HttpServerResponse.jsonUnsafe(OpenApi.fromApi(HealthFitApi))),
  );
});
