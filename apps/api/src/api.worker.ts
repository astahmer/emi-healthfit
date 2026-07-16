import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import {
  authenticateRequest,
  handleAuthRequest,
  isProtectedPath,
  withCurrentUser,
} from "./auth/request-auth.ts";
import {
  handleAiSdkChat,
  handleChatResume,
  handleConversationDiagnosticEvent,
  handleConversationDiagnostics,
  handleMessageRevision,
} from "./routes/chat.ts";
import {
  handleConversationClone,
  handleConversationDelete,
  handleConversationMessages,
  handleConversationRename,
  handleConversationsCreate,
  handleConversationsList,
  handleConversationStateUpdate,
  handleConversationThreadsCreate,
  handleConversationThreadsList,
  handleMemoryExtract,
  handleMessageRead,
  handleThreadRead,
  handleThreadSummarize,
  handleThreadUpdate,
} from "./routes/conversations.ts";
import {
  handleAnalyticsOverview,
  handleChatRoute,
  handleIngest,
  handleIngestedDataExport,
  handleIngestedDataExportSummary,
  handleIngestedDataImport,
  handlePrivacyRead,
  handlePrivacyUpdate,
  handleRecovery,
  handleSourceDelete,
  handleSuggestions,
  handleSummary,
  handleWorkouts,
} from "./routes/data.ts";
import { handleAssetRequest, handleCorsPreflight, withCors } from "./routes/http.ts";
import { registerHttpApi } from "./http-api.ts";

const DB = Cloudflare.D1.Database("GymData");
const ExportsBucket = Cloudflare.R2.Bucket("Exports");
const AiGateway = Cloudflare.AI.Gateway("AiGateway");

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
    const db = yield* Cloudflare.D1.QueryDatabase(DB);
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(ExportsBucket);
    const aiGateway = yield* Cloudflare.AI.QueryGateway(AiGateway);
    const env: Record<string, unknown> = yield* Cloudflare.Workers.WorkerEnvironment;
    const assetsBinding = env.ASSETS;
    const assetsFetch =
      typeof assetsBinding === "object" && assetsBinding !== null
        ? Reflect.get(assetsBinding, "fetch")
        : undefined;
    const assetsFetcher =
      typeof assetsFetch === "function"
        ? (request: Request): Promise<Response> =>
            Promise.resolve(Reflect.apply(assetsFetch, assetsBinding, [request]))
        : undefined;

    const router = yield* HttpRouter.make;
    const cors = <E, R>(
      request: HttpServerRequest,
      effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
    ) => withCors(effect, request);

    yield* Effect.gen(function* () {
      yield* router.add("POST", "/ingest", (request) =>
        cors(request, handleIngest(db, bucket, request)),
      );
      yield* router.add("POST", "/chat", (request) =>
        cors(request, handleChatRoute(db, aiGateway, env, request)),
      );
      yield* router.add("POST", "/api/chat", (request) => handleAiSdkChat(db, env, request));
      yield* router.add("GET", "/api/chat/:conversationId/stream", (request) =>
        Effect.gen(function* () {
          const params = yield* HttpRouter.params;
          return yield* handleChatResume(db, params.conversationId ?? "", request);
        }),
      );
      yield* router.add("POST", "/api/suggestions", (request) =>
        cors(request, handleSuggestions(db, env, request)),
      );
      yield* router.add("GET", "/api/recovery", (request) => cors(request, handleRecovery(db)));
      yield* router.add("GET", "/api/summary", (request) => cors(request, handleSummary(db)));
      yield* router.add("GET", "/api/analytics/overview", (request) =>
        cors(request, handleAnalyticsOverview(db, request)),
      );
      yield* router.add("GET", "/api/export/ingested-data", (request) =>
        cors(request, handleIngestedDataExport(db)),
      );
      yield* router.add("GET", "/api/export/ingested-data/summary", (request) =>
        cors(request, handleIngestedDataExportSummary(db)),
      );
      yield* router.add("POST", "/api/import/ingested-data", (request) =>
        cors(request, handleIngestedDataImport(db, request)),
      );
      yield* router.add("GET", "/api/privacy", (request) => cors(request, handlePrivacyRead(db)));
      yield* router.add("PATCH", "/api/privacy", (request) =>
        cors(request, handlePrivacyUpdate(db, bucket, request)),
      );
      yield* router.add("DELETE", "/api/privacy/data/:source", (request) =>
        cors(request, handleSourceDelete(db, bucket, request)),
      );
      yield* router.add("GET", "/api/workouts", (request) => cors(request, handleWorkouts(db)));
      yield* router.add("GET", "/api/conversations", (request) =>
        cors(request, handleConversationsList(db, request)),
      );
      yield* router.add("POST", "/api/conversations", (request) =>
        cors(request, handleConversationsCreate(db)),
      );
      yield* router.add("DELETE", "/api/conversations/:conversationId", (request) =>
        cors(request, handleConversationDelete(db, request)),
      );
      yield* router.add("PATCH", "/api/conversations/:conversationId", (request) =>
        cors(request, handleConversationStateUpdate(db, request)),
      );
      yield* router.add("POST", "/api/conversations/:conversationId/clone", (request) =>
        cors(request, handleConversationClone(db, request)),
      );
      yield* router.add("GET", "/api/conversations/:conversationId/diagnostics", (request) =>
        cors(request, handleConversationDiagnostics(db, request)),
      );
      yield* router.add("POST", "/api/conversations/:conversationId/diagnostic-events", (request) =>
        cors(request, handleConversationDiagnosticEvent(db, request)),
      );
      yield* router.add("GET", "/api/conversations/:conversationId/messages", (request) =>
        cors(request, handleConversationMessages(db, request)),
      );
      yield* router.add("PATCH", "/api/conversations/:conversationId/title", (request) =>
        cors(request, handleConversationRename(db, request)),
      );
      yield* router.add("GET", "/api/conversations/:conversationId/threads", (request) =>
        cors(request, handleConversationThreadsList(db, request)),
      );
      yield* router.add("POST", "/api/conversations/:conversationId/threads", (request) =>
        cors(request, handleConversationThreadsCreate(db, request)),
      );
      yield* router.add("GET", "/api/threads/:threadId", (request) =>
        cors(request, handleThreadRead(db, request)),
      );
      yield* router.add("PATCH", "/api/threads/:threadId", (request) =>
        cors(request, handleThreadUpdate(db, request)),
      );
      yield* router.add("POST", "/api/threads/:threadId/summarize", (request) =>
        cors(request, handleThreadSummarize(db, env, request)),
      );
      yield* router.add("GET", "/api/messages/:messageId", (request) =>
        cors(request, handleMessageRead(db, request)),
      );
      yield* router.add(
        "PATCH",
        "/api/conversations/:conversationId/messages/:messageId",
        (request) =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            return yield* cors(
              request,
              handleMessageRevision({
                db,
                request,
                conversationId: params.conversationId ?? "",
                messageId: params.messageId ?? "",
              }),
            );
          }),
      );
      yield* router.add("POST", "/api/memories/extract", (request) =>
        cors(request, handleMemoryExtract(db, env, request)),
      );
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
        if (
          pathname === "/api/openapi.json" ||
          pathname === "/api/notes" ||
          pathname.startsWith("/api/notes/") ||
          pathname === "/api/memories" ||
          (pathname.startsWith("/api/memories/") && pathname !== "/api/memories/extract")
        ) {
          if (principal === null) {
            return yield* HttpServerResponse.json(
              { error: "Authentication required" },
              { status: 401 },
            );
          }
          const httpApiRouter = yield* HttpRouter.make;
          yield* registerHttpApi({ db, router: httpApiRouter });
          return yield* withCurrentUser({ effect: httpApiRouter.asHttpEffect(), principal });
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
      ),
    };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Cloudflare.D1.QueryDatabaseBinding,
        Cloudflare.R2.ReadWriteBucketBinding,
        Cloudflare.AI.QueryGatewayBinding,
      ),
    ),
  ),
) {}
