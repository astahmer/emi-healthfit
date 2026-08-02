import {
  CoreApi,
  type Memory as ApiMemory,
  type Note as ApiNote,
} from "@emi/core/contract";
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
import type { MemoryDatabaseSchema } from "@emi/core/server";
import { CurrentUser } from "./core/auth/request-auth.ts";
import { narrowQueryDatabaseClient, type QueryDatabaseClient } from "./platform/db/client.ts";
import {
  deleteMemory,
  deleteMemoriesByMessage,
  deleteNote,
  getMemories,
  getNotes,
  insertMemory,
  insertNote,
  searchMemories,
  searchNotes,
  updateNote,
} from "./core/db/memories.ts";
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
  const notesDb = narrowQueryDatabaseClient<MemoryDatabaseSchema>(db);
  return HttpApiBuilder.group(CoreApi, "notes", (handlers) =>
    handlers
      .handle(
        "list",
        Effect.fn("httpApi.notes.list")(function* ({ query }) {
          const user = yield* CurrentUser;
          const limit = query.limit ?? 100;
          const notes =
            query.search === undefined
              ? yield* getNotes(notesDb, user.id, limit)
              : yield* searchNotes(notesDb, user.id, query.search, limit);
          return { notes: notes.map(toApiNote) };
        }, Effect.provide(runtimeContext)),
      )
      .handle(
        "create",
        Effect.fn("httpApi.notes.create")(function* ({ payload }) {
          const user = yield* CurrentUser;
          const id = yield* insertNote(notesDb, user.id, payload.content);
          return { id: requireIdentifier(id) };
        }, Effect.provide(runtimeContext)),
      )
      .handle(
        "update",
        Effect.fn("httpApi.notes.update")(function* ({ params, payload }) {
          const user = yield* CurrentUser;
          yield* updateNote(notesDb, user.id, params.id, payload.content);
          return { success: true } satisfies { success: true };
        }, Effect.provide(runtimeContext)),
      )
      .handle(
        "remove",
        Effect.fn("httpApi.notes.remove")(function* ({ params }) {
          const user = yield* CurrentUser;
          yield* deleteNote(notesDb, user.id, params.id);
          return { success: true } satisfies { success: true };
        }, Effect.provide(runtimeContext)),
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
  const memoriesDb = narrowQueryDatabaseClient<MemoryDatabaseSchema>(db);
  return HttpApiBuilder.group(CoreApi, "memories", (handlers) =>
    handlers
      .handle(
        "list",
        Effect.fn("httpApi.memories.list")(function* ({ query }) {
          const user = yield* CurrentUser;
          const limit = query.limit ?? 100;
          const memories =
            query.search === undefined
              ? yield* getMemories(memoriesDb, user.id, { limit })
              : yield* searchMemories(memoriesDb, user.id, query.search, { limit });
          return { memories: memories.map(toApiMemory) };
        }, Effect.provide(runtimeContext)),
      )
      .handle(
        "create",
        Effect.fn("httpApi.memories.create")(function* ({ payload }) {
          const user = yield* CurrentUser;
          const id = yield* insertMemory(
            memoriesDb,
            user.id,
            payload.content,
            payload.source,
            payload.threadId,
            payload.messageId,
          );
          return { id: requireIdentifier(id) };
        }, Effect.provide(runtimeContext)),
      )
      .handle(
        "remove",
        Effect.fn("httpApi.memories.remove")(function* ({ params }) {
          const user = yield* CurrentUser;
          yield* deleteMemory(memoriesDb, user.id, params.id);
          return { success: true } satisfies { success: true };
        }, Effect.provide(runtimeContext)),
      )
      .handle(
        "removeByMessage",
        Effect.fn("httpApi.memories.removeByMessage")(function* ({ params }) {
          const user = yield* CurrentUser;
          yield* deleteMemoriesByMessage(memoriesDb, user.id, params.messageId);
          return { success: true } satisfies { success: true };
        }, Effect.provide(runtimeContext)),
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
