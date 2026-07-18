import * as Cloudflare from "alchemy/Cloudflare";
import { RuntimeContext } from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import {
  authenticateRequest,
  handleAuthRequest,
  isProtectedPath,
  withCurrentUser,
} from "./auth/request-auth.ts";
import { makeQueryDatabaseClient } from "./db/client.ts";
import { handleAiSdkChat, handleChatResume, handleConversationDiagnostics } from "./routes/chat.ts";
import {
  handleIngest,
  handleIngestedDataExport,
  handleIngestedDataImport,
  handleRecovery,
  handleSummary,
} from "./routes/data.ts";
import { handleAssetRequest, handleCorsPreflight, withCors } from "./routes/http.ts";
import { registerHttpApi } from "./http-api.ts";

const DB = Cloudflare.D1.Database("GymData");
const ExportsBucket = Cloudflare.R2.Bucket("Exports");
const AssetsBinding = Schema.Struct({
  fetch: Schema.declare<(request: Request) => Promise<Response>>(
    (value): value is (request: Request) => Promise<Response> => typeof value === "function",
  ),
});
const cors = <E, R>({
  request,
  effect,
}: {
  request: HttpServerRequest;
  effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>;
}) => withCors(effect, request);

export default class Api extends Cloudflare.Worker<Api>()(
  "Api",
  {
    main: import.meta.url,
    assets: "./assets",
    compatibility: { flags: ["nodejs_compat"] },
    env: {
      BETTER_AUTH_SECRET: Config.redacted("BETTER_AUTH_SECRET"),
      BETTER_AUTH_URL: Config.redacted("BETTER_AUTH_URL"),
      GOOGLE_CLIENT_ID: Config.redacted("GOOGLE_CLIENT_ID"),
      GOOGLE_CLIENT_SECRET: Config.redacted("GOOGLE_CLIENT_SECRET"),
      ALLOWED_EMAILS: Config.redacted("ALLOWED_EMAILS"),
    },
    observability: {
      enabled: true,
    },
  },
  Effect.gen(function* () {
    const query = yield* Cloudflare.D1.QueryDatabase(DB);
    const db = makeQueryDatabaseClient({ query });
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(ExportsBucket);
    const env: Record<string, unknown> = yield* Cloudflare.Workers.WorkerEnvironment;
    const assetsBinding = Schema.decodeUnknownOption(AssetsBinding)(env.ASSETS);
    const assetsFetcher = Option.isSome(assetsBinding)
      ? (request: Request): Promise<Response> => Promise.resolve(assetsBinding.value.fetch(request))
      : undefined;

    const router = yield* HttpRouter.make;
    yield* Effect.gen(function* () {
      yield* router.add("POST", "/ingest", (request) =>
        cors({ request, effect: handleIngest(db, bucket, request) }),
      );
      yield* router.add("POST", "/api/chat", (request) => handleAiSdkChat(db, request));
      yield* router.add("GET", "/api/chat/:conversationId/stream", (request) =>
        Effect.gen(function* () {
          const params = yield* HttpRouter.params;
          return yield* handleChatResume(db, params.conversationId ?? "", request);
        }),
      );
      yield* router.add("GET", "/api/recovery", (request) =>
        cors({ request, effect: handleRecovery(db) }),
      );
      yield* router.add("GET", "/api/summary", (request) =>
        cors({ request, effect: handleSummary(db) }),
      );
      yield* router.add("GET", "/api/export/ingested-data", (request) =>
        cors({ request, effect: handleIngestedDataExport(db) }),
      );
      yield* router.add("POST", "/api/import/ingested-data", (request) =>
        cors({ request, effect: handleIngestedDataImport(db, request) }),
      );
      yield* router.add("GET", "/api/conversations/:conversationId/diagnostics", (request) =>
        cors({ request, effect: handleConversationDiagnostics(db, request) }),
      );
      yield* registerHttpApi({ bucket, db, router });
      yield* router.add("*", "/*", (request) => {
        if (request.method === "OPTIONS") return handleCorsPreflight(request);
        if (request.method === "GET") return handleAssetRequest({ assetsFetcher, request });
        return Effect.succeed(HttpServerResponse.text("Not Found", { status: 404 }));
      });
    }) as Effect.Effect<void>;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const pathname = new URL(request.url, "http://localhost").pathname;
        if (pathname.startsWith("/api/auth/")) {
          return yield* handleAuthRequest({ db, environment: env, request });
        }
        const protectedPath = isProtectedPath(pathname);
        const principal = protectedPath
          ? yield* authenticateRequest({ db, environment: env, request })
          : null;
        if (protectedPath) {
          if (principal === null) {
            return yield* HttpServerResponse.json(
              { error: "Authentication required" },
              { status: 401 },
            );
          }
          yield* Effect.logDebug("auth.request.authorized").pipe(
            Effect.annotateLogs({ userId: principal.id, pathname }),
          );
        }
        if (principal !== null) {
          return yield* withCurrentUser({ effect: router.asHttpEffect(), principal });
        }
        return yield* router.asHttpEffect();
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
  }).pipe(
    Effect.provide(
      Layer.mergeAll(Cloudflare.D1.QueryDatabaseBinding, Cloudflare.R2.ReadWriteBucketBinding),
    ),
  ),
) {}
