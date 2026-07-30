import * as Cloudflare from "alchemy/Cloudflare";
import { RuntimeContext } from "alchemy";
import { Stack } from "alchemy/Stack";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import {
  authenticateWorkerFetch,
  makeGenericChatRoutes,
  makeQueryDatabaseClient,
  type CloudflareQueryDatabaseClient,
} from "@emi/core/cloudflare";
import {
  isGenericProtectedPath,
  type AuthDatabaseSchema,
  type ConversationDatabaseSchema,
} from "@emi/core/server";
import { genericWorkerAppConfig } from "./app-config.ts";

const DB = Cloudflare.D1.Database(genericWorkerAppConfig.databaseName);

type GenericDatabaseSchema = ConversationDatabaseSchema & AuthDatabaseSchema;

export class GenericWorker extends Cloudflare.Worker<GenericWorker, {}>()("GenericWorker") {}

export default GenericWorker.make(
  Stack.useSync(() => ({
    main: import.meta.url,
    compatibility: { flags: ["nodejs_compat"] },
    env: {
      BETTER_AUTH_SECRET: Config.redacted("BETTER_AUTH_SECRET"),
      BETTER_AUTH_URL: Config.redacted("BETTER_AUTH_URL"),
      AUTH_APP_NAME: Config.string("AUTH_APP_NAME").pipe(
        Config.withDefault(genericWorkerAppConfig.name),
      ),
      ALLOW_DEMO_USER_HEADER: Config.string("ALLOW_DEMO_USER_HEADER").pipe(Config.withDefault("0")),
    },
    observability: { enabled: true },
  })),
  Effect.gen(function* () {
    const query = yield* Cloudflare.D1.QueryDatabase(DB);
    const db = makeQueryDatabaseClient<GenericDatabaseSchema>({ query });
    const env: Record<string, unknown> = yield* Cloudflare.Workers.WorkerEnvironment;
    const router = yield* HttpRouter.make;
    const routes = makeGenericChatRoutes({
      db: db as unknown as CloudflareQueryDatabaseClient<ConversationDatabaseSchema>,
    });
    yield* Effect.gen(function* () {
      yield* router.add("GET", "/api/health", () =>
        HttpServerResponse.json({ name: genericWorkerAppConfig.name }),
      );
      yield* router.add("GET", "/api/conversations", routes.conversations);
      yield* router.add("POST", "/api/conversations", routes.conversations);
      yield* router.add("GET", "/api/conversations/:conversationId", routes.conversation);
      yield* router.add("PATCH", "/api/conversations/:conversationId", routes.conversation);
      yield* router.add("DELETE", "/api/conversations/:conversationId", routes.conversation);
      yield* router.add("POST", "/api/conversations/:conversationId/clone", routes.clone);
      yield* router.add("POST", "/api/conversations/:conversationId/compact", routes.compact);
      yield* router.add("GET", "/api/conversations/:conversationId/threads", routes.threads);
      yield* router.add("POST", "/api/conversations/:conversationId/threads", routes.threads);
      yield* router.add(
        "GET",
        "/api/conversations/:conversationId/threads/:threadId",
        routes.thread,
      );
      yield* router.add(
        "PATCH",
        "/api/conversations/:conversationId/threads/:threadId",
        routes.thread,
      );
      yield* router.add(
        "DELETE",
        "/api/conversations/:conversationId/threads/:threadId",
        routes.thread,
      );
      yield* router.add("POST", "/api/chat", routes.chat);
      yield* router.add("GET", "/api/chat/:conversationId/stream", () =>
        Effect.gen(function* () {
          const params = yield* HttpRouter.params;
          return yield* routes.resume({ conversationId: params.conversationId ?? "" })();
        }),
      );
      yield* router.add("*", "/*", () =>
        Effect.succeed(HttpServerResponse.text("Not Found", { status: 404 })),
      );
    }) as Effect.Effect<void>;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        return yield* authenticateWorkerFetch({
          db,
          environment: env,
          isProtectedPath: isGenericProtectedPath,
          policy: "anonymous",
          request,
          route: router.asHttpEffect(),
        });
      }).pipe(
        Effect.scoped,
        Effect.catch((error) =>
          Effect.logError("Unhandled fetch error").pipe(
            Effect.annotateLogs({ error: String(error) }),
            Effect.as(HttpServerResponse.text("Internal Server Error", { status: 500 })),
          ),
        ),
        Effect.provide(RuntimeContext.phantom),
      ),
    };
  }).pipe(Effect.provide(Cloudflare.D1.QueryDatabaseBinding)),
);
