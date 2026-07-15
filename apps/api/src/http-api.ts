import { EmiApi } from "@emi/api-contract";
import { RuntimeContext } from "alchemy";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { HttpApiBuilder, OpenApi } from "effect/unstable/httpapi";
import {
  deleteMemory,
  deleteNote,
  getMemories,
  getNotes,
  insertMemory,
  insertNote,
  type QueryDatabaseClient,
  searchMemories,
  searchNotes,
  updateNote,
} from "./db/operations.ts";

const requireIdentifier = (identifier: string | null): string => {
  if (identifier === null) throw new Error("Database did not return an identifier");
  return identifier;
};

const notesHandlers = ({
  db,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  runtimeContext: Context.Context<RuntimeContext>;
}) =>
  HttpApiBuilder.group(EmiApi, "notes", (handlers) =>
    handlers
      .handle(
        "list",
        Effect.fn("httpApi.notes.list")(function* ({ query }) {
          const limit = query.limit ?? 100;
          const notes =
            query.search === undefined
              ? yield* getNotes(db, limit)
              : yield* searchNotes(db, query.search, limit);
          return { notes };
        }, Effect.provide(runtimeContext)),
      )
      .handle(
        "create",
        Effect.fn("httpApi.notes.create")(function* ({ payload }) {
          const id = yield* insertNote(db, payload.content);
          return { id: requireIdentifier(id) };
        }, Effect.provide(runtimeContext)),
      )
      .handle(
        "update",
        Effect.fn("httpApi.notes.update")(function* ({ params, payload }) {
          yield* updateNote(db, params.id, payload.content);
          return { success: true } satisfies { success: true };
        }, Effect.provide(runtimeContext)),
      )
      .handle(
        "remove",
        Effect.fn("httpApi.notes.remove")(function* ({ params }) {
          yield* deleteNote(db, params.id);
          return { success: true } satisfies { success: true };
        }, Effect.provide(runtimeContext)),
      ),
  );

const memoriesHandlers = ({
  db,
  runtimeContext,
}: {
  db: QueryDatabaseClient;
  runtimeContext: Context.Context<RuntimeContext>;
}) =>
  HttpApiBuilder.group(EmiApi, "memories", (handlers) =>
    handlers
      .handle(
        "list",
        Effect.fn("httpApi.memories.list")(function* ({ query }) {
          const limit = query.limit ?? 100;
          const memories =
            query.search === undefined
              ? yield* getMemories(db, limit)
              : yield* searchMemories(db, query.search, limit);
          return { memories };
        }, Effect.provide(runtimeContext)),
      )
      .handle(
        "create",
        Effect.fn("httpApi.memories.create")(function* ({ payload }) {
          const id = yield* insertMemory(db, payload.content, payload.source, payload.threadId);
          return { id: requireIdentifier(id) };
        }, Effect.provide(runtimeContext)),
      )
      .handle(
        "remove",
        Effect.fn("httpApi.memories.remove")(function* ({ params }) {
          yield* deleteMemory(db, params.id);
          return { success: true } satisfies { success: true };
        }, Effect.provide(runtimeContext)),
      ),
  );

export const registerHttpApi = Effect.fn("httpApi.register")(function* ({
  db,
  router,
}: {
  db: QueryDatabaseClient;
  router: HttpRouter.HttpRouter;
}) {
  const runtimeContext = yield* Effect.context<RuntimeContext>();
  const handlerContext = yield* Layer.build(
    Layer.mergeAll(notesHandlers({ db, runtimeContext }), memoriesHandlers({ db, runtimeContext })),
  ).pipe(Effect.scoped);
  const routes = Object.values(EmiApi.groups).flatMap((group) => {
    const service = handlerContext.mapUnsafe.get(group.key);
    if (service === undefined) throw new Error(`Missing handlers for ${group.identifier}`);
    const groupRoutes = Reflect.get(service, "routes");
    if (!Array.isArray(groupRoutes)) throw new Error(`Missing routes for ${group.identifier}`);
    return groupRoutes as Array<HttpRouter.Route<never, never>>;
  });
  yield* router.addAll(routes) as Effect.Effect<void>;
  yield* router.add(
    "GET",
    "/api/openapi.json",
    Effect.succeed(HttpServerResponse.jsonUnsafe(OpenApi.fromApi(EmiApi))),
  );
});
