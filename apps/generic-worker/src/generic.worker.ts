import * as Cloudflare from "alchemy/Cloudflare";
import { RuntimeContext } from "alchemy";
import { Stack } from "alchemy/Stack";
import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import {
  coreAppDefinition,
  makeConversationStore,
  makeRequestContext,
  type ConversationDatabaseSchema,
} from "@emi/core-server";
import {
  makeQueryDatabaseClient,
  type CloudflareQueryDatabaseClient,
} from "@emi/platform-cloudflare";

const DB = Cloudflare.D1.Database("GenericData");

/**
 * `x-demo-user-id` is a placeholder identity for this scaffold. It proves the
 * core conversation store and D1 adapter compose end to end without pulling
 * in any flavor. Real deployments must replace it with session-based auth
 * before exposing this worker publicly.
 */
const demoUserId = (request: HttpServerRequest): string | undefined =>
  request.headers["x-demo-user-id"];

const conversationsRoute = (db: CloudflareQueryDatabaseClient<ConversationDatabaseSchema>) =>
  Effect.fn("generic.conversations")(function* (request: HttpServerRequest) {
    const userId = demoUserId(request);
    if (userId === undefined || userId === "") {
      return yield* HttpServerResponse.json(
        { error: "Missing x-demo-user-id header (demo identity only, not production auth)" },
        { status: 401 },
      );
    }
    const store = makeConversationStore({ db, requestContext: makeRequestContext({ userId }) });
    if (request.method === "POST") {
      const id = yield* store.create();
      return yield* HttpServerResponse.json({ id }, { status: 201 });
    }
    const conversations = yield* store.list();
    return yield* HttpServerResponse.json({ conversations });
  });

export class GenericWorker extends Cloudflare.Worker<GenericWorker, {}>()("GenericWorker") {}

export default GenericWorker.make(
  Stack.useSync(() => ({
    main: import.meta.url,
    compatibility: { flags: ["nodejs_compat"] },
    observability: { enabled: true },
  })),
  Effect.gen(function* () {
    const query = yield* Cloudflare.D1.QueryDatabase(DB);
    const db = makeQueryDatabaseClient<ConversationDatabaseSchema>({ query });

    const router = yield* HttpRouter.make;
    yield* Effect.gen(function* () {
      yield* router.add("GET", "/api/health", () =>
        HttpServerResponse.json({
          name: coreAppDefinition.identity.name,
          description: coreAppDefinition.identity.description,
        }),
      );
      yield* router.add("GET", "/api/conversations", conversationsRoute(db));
      yield* router.add("POST", "/api/conversations", conversationsRoute(db));
      yield* router.add("*", "/*", () =>
        Effect.succeed(HttpServerResponse.text("Not Found", { status: 404 })),
      );
    }) as Effect.Effect<void>;

    return {
      fetch: router.asHttpEffect().pipe(
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
