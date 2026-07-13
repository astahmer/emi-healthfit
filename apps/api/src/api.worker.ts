import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { buildChatContext } from "./chat/context.ts";
import { handleChat } from "./chat/handler.ts";
import { fitnessCoachV1 } from "./chat/prompts/fitness-coach-v1.ts";
import {
  createThread,
  deleteThread,
  getDataSummary,
  getThread,
  getThreadMessages,
  getThreads,
  getWorkouts,
  insertHealthWorkouts,
  type QueryDatabaseClient,
  renameThread,
  saveThreadMessages,
  updateSyncCursor,
  upsertBodyMetrics,
  upsertDailyActivity,
  upsertHevySessions,
  upsertHevySets,
  upsertSleepSessions,
} from "./db/operations.ts";
import { parseHealthExport } from "./ingest/health.ts";
import { parseHevyCsv } from "./ingest/hevy.ts";
import { streamChat, type ChatStreamRequest } from "./chat/ai-sdk.ts";
import { handleToolExecute, handleToolsList } from "./tools/api.ts";

const DB = Cloudflare.D1.Database("GymData");
const ExportsBucket = Cloudflare.R2.Bucket("Exports");
const AiGateway = Cloudflare.AI.Gateway("AiGateway");

type ReadWriteBucketClient = Effect.Success<ReturnType<typeof Cloudflare.R2.ReadWriteBucket>>;
type QueryGatewayClient = Effect.Success<ReturnType<typeof Cloudflare.AI.QueryGateway>>;

export default class Api extends Cloudflare.Worker<Api>()(
  "Api",
  {
    main: import.meta.url,
    assets: "./assets",
    observability: {
      enabled: true,
    },
  },
  Effect.gen(function* () {
    const db = yield* Cloudflare.D1.QueryDatabase(DB);
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(ExportsBucket);
    const aiGateway = yield* Cloudflare.AI.QueryGateway(AiGateway);
    const env = (yield* yield* Cloudflare.CloudflareEnvironment) as Record<string, unknown>;

    const assetsBinding = (env as Record<string, unknown>).ASSETS as
      | { fetch: (req: Request) => Promise<Response> }
      | undefined;
    const assetsFetcher = assetsBinding?.fetch;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const url = new URL(request.url, "http://localhost");

        if (request.method === "OPTIONS") {
          return yield* handleCorsPreflight(request);
        }

        if (request.method === "GET" && assetsFetcher !== undefined) {
          const isAssetPath = url.pathname === "/" ||
            url.pathname === "/index.html" ||
            url.pathname.startsWith("/assets/") ||
            url.pathname.startsWith("/_next/");
          if (isAssetPath) {
            const response = yield* Effect.promise(() => assetsFetcher(request.source as Request));
            if (response.status !== 404) {
              return HttpServerResponse.fromWeb(response);
            }
          }
        }

        if (url.pathname === "/ingest" && request.method === "POST") {
          return yield* withCors(handleIngest(db, bucket, request), request);
        }

        if (url.pathname === "/chat" && request.method === "POST") {
          return yield* withCors(handleChatRoute(db, aiGateway, env, request), request);
        }

        if (url.pathname === "/api/chat" && request.method === "POST") {
          return yield* handleAiSdkChat(env, request);
        }

        if (url.pathname === "/api/tools" && request.method === "GET") {
          return yield* withCors(handleToolsList(), request);
        }

        if (url.pathname.startsWith("/api/tools/") && request.method === "POST") {
          return yield* withCors(handleToolExecute(db, request), request);
        }

        if (url.pathname === "/api/recovery" && request.method === "GET") {
          return yield* withCors(handleRecovery(db), request);
        }

        if (url.pathname === "/api/summary" && request.method === "GET") {
          return yield* withCors(handleSummary(db), request);
        }

        if (url.pathname === "/api/workouts" && request.method === "GET") {
          return yield* withCors(handleWorkouts(db), request);
        }

        if (url.pathname === "/api/threads" && request.method === "GET") {
          return yield* withCors(handleThreadsList(db, request), request);
        }

        if (url.pathname === "/api/threads" && request.method === "POST") {
          return yield* withCors(handleThreadsCreate(db), request);
        }

        if (url.pathname.startsWith("/api/threads/") && request.method === "GET") {
          return yield* withCors(handleThreadMessages(db, request), request);
        }

        if (url.pathname.startsWith("/api/threads/") && request.method === "PATCH") {
          return yield* withCors(handleThreadRename(db, request), request);
        }

        if (url.pathname.startsWith("/api/threads/") && request.method === "DELETE") {
          return yield* withCors(handleThreadDelete(db, request), request);
        }

        return HttpServerResponse.text("Not Found", { status: 404 });
      }),
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

const handleIngest = (
  db: QueryDatabaseClient,
  bucket: ReadWriteBucketClient,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const nativeRequest = request.source as Request;
    const formData = yield* Effect.tryPromise({
      try: () => nativeRequest.formData(),
      catch: (error) => new Error(`Failed to read form data: ${error}`),
    });

    const healthFile = formData.get("health_export") as File | null;
    const hevyFile = formData.get("hevy_export") as File | null;

    if (healthFile === null && hevyFile === null) {
      return yield* HttpServerResponse.json(
        { error: "Expected health_export and/or hevy_export files" },
        { status: 400 },
      );
    }

    const timestamp = new Date().toISOString();
    let healthSummary = { daily: 0, workouts: 0, sleep: 0, body: 0 };
    let hevySummary = { sessions: 0, sets: 0 };

    if (healthFile !== null) {
      const healthText = yield* Effect.tryPromise({
        try: () => healthFile.text(),
        catch: (error) => new Error(`Failed to read health file: ${error}`),
      });

      yield* bucket.put(`health/${timestamp}_${healthFile.name}`, healthText, {
        httpMetadata: { contentType: healthFile.type || "application/json" },
      });

      const startYear = Number(healthFile.name.match(/(\d{4})/)?.[0] ?? new Date().getFullYear());
      const parsed = yield* parseHealthExport(healthText, startYear);

      healthSummary = {
        daily: parsed.daily.length,
        workouts: parsed.workouts.length,
        sleep: parsed.sleep.length,
        body: parsed.body.length,
      };

      yield* upsertDailyActivity(db, parsed.daily);
      yield* insertHealthWorkouts(db, parsed.workouts);
      yield* upsertSleepSessions(db, parsed.sleep);
      yield* upsertBodyMetrics(db, parsed.body);
      yield* updateSyncCursor(db, "apple_health", timestamp);
    }

    if (hevyFile !== null) {
      const hevyText = yield* Effect.tryPromise({
        try: () => hevyFile.text(),
        catch: (error) => new Error(`Failed to read hevy file: ${error}`),
      });

      yield* bucket.put(`hevy/${timestamp}_${hevyFile.name}`, hevyText, {
        httpMetadata: { contentType: hevyFile.type || "text/csv" },
      });

      const parsed = yield* parseHevyCsv(hevyText);

      hevySummary = {
        sessions: parsed.sessions.length,
        sets: parsed.sets.length,
      };

      yield* upsertHevySessions(db, parsed.sessions);
      yield* upsertHevySets(db, parsed.sets);
      yield* updateSyncCursor(db, "hevy", timestamp);
    }

    return yield* HttpServerResponse.json({
      health: healthSummary,
      hevy: hevySummary,
    });
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json({ error: error.message }, { status: 500 }),
    ),
  );

const handleChatRoute = (
  db: QueryDatabaseClient,
  aiGateway: QueryGatewayClient,
  env: Record<string, unknown>,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const text = yield* request.text;
    const body = JSON.parse(text || "{}") as {
      message?: string;
      coachMode?: boolean;
    };
    const message = body.message?.trim();

    if (message === undefined || message === "") {
      return yield* HttpServerResponse.json(
        { error: "message is required" },
        { status: 400 },
      );
    }

    const result = yield* handleChat(db, aiGateway, env, {
      message,
      systemPrompt: body.coachMode ? fitnessCoachV1 : undefined,
    });
    return yield* HttpServerResponse.json(result);
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json({ error: error.message }, { status: 500 }),
    ),
  );

const handleRecovery = (
  db: QueryDatabaseClient,
) =>
  Effect.gen(function* () {
    const ctx = yield* buildChatContext(db);
    return yield* HttpServerResponse.json({
      today: ctx.today,
      label: ctx.recoveryLabel,
      explanation: ctx.recoveryExplanation,
      lastWorkout: ctx.lastWorkout.lastSessionSummary,
      sleepAverageHours: ctx.sleep.sevenDayAverage !== null ? ctx.sleep.sevenDayAverage / 60 : null,
      recentWorkoutCount: ctx.recentWorkoutCount,
      recentVolume: ctx.lastWorkout.recentVolume,
    });
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json({ error: error.message }, { status: 500 }),
    ),
  );

const handleSummary = (
  db: QueryDatabaseClient,
) =>
  Effect.gen(function* () {
    const summary = yield* getDataSummary(db);
    return yield* HttpServerResponse.json(summary);
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json({ error: error.message }, { status: 500 }),
    ),
  );

const handleWorkouts = (
  db: QueryDatabaseClient,
) =>
  Effect.gen(function* () {
    const workouts = yield* getWorkouts(db);
    return yield* HttpServerResponse.json({ workouts });
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json({ error: error.message }, { status: 500 }),
    ),
  );

const handleThreadsList = (
  db: QueryDatabaseClient,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const url = new URL(request.url, "http://localhost");
    const search = url.searchParams.get("search") ?? undefined;
    const threads = yield* getThreads(db, search);
    return yield* HttpServerResponse.json({ threads });
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json({ error: error.message }, { status: 500 }),
    ),
  );

const handleThreadsCreate = (db: QueryDatabaseClient) =>
  Effect.gen(function* () {
    const id = yield* createThread(db);
    return yield* HttpServerResponse.json({ id }, { status: 201 });
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json({ error: error.message }, { status: 500 }),
    ),
  );

const getThreadIdFromPath = (pathname: string): string | undefined => {
  const match = pathname.match(/^\/api\/threads\/([^/]+)$/);
  return match?.[1];
};

const handleThreadMessages = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const url = new URL(request.url, "http://localhost");
    const threadId = getThreadIdFromPath(url.pathname);
    if (threadId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid thread id" }, { status: 400 });
    }

    const thread = yield* getThread(db, threadId);
    if (thread === null) {
      return yield* HttpServerResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const rows = yield* getThreadMessages(db, threadId);
    const messages = rows.map((row) => ({
      id: row.id,
      role: row.role,
      parts: JSON.parse(row.parts) as unknown[],
    }));
    return yield* HttpServerResponse.json({ thread, messages });
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json({ error: error.message }, { status: 500 }),
    ),
  );

const handleThreadRename = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const url = new URL(request.url, "http://localhost");
    const threadId = getThreadIdFromPath(url.pathname);
    if (threadId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid thread id" }, { status: 400 });
    }

    const text = yield* request.text;
    const body = JSON.parse(text || "{}") as { title?: string };
    if (body.title === undefined || body.title.trim() === "") {
      return yield* HttpServerResponse.json({ error: "title is required" }, { status: 400 });
    }

    yield* renameThread(db, threadId, body.title.trim());
    return yield* HttpServerResponse.json({ success: true });
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json({ error: error.message }, { status: 500 }),
    ),
  );

const handleThreadDelete = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const url = new URL(request.url, "http://localhost");
    const threadId = getThreadIdFromPath(url.pathname);
    if (threadId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid thread id" }, { status: 400 });
    }

    yield* deleteThread(db, threadId);
    return yield* HttpServerResponse.json({ success: true });
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json({ error: error.message }, { status: 500 }),
    ),
  );

const corsHeaders = (request: HttpServerRequest): Record<string, string> => {
  const origin = request.headers["origin"] ?? "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers":
      "authorization, content-type, mcp-session-id, last-event-id, mcp-protocol-version",
    "access-control-expose-headers": "mcp-session-id, mcp-protocol-version",
  };
};

const handleCorsPreflight = (request: HttpServerRequest) =>
  Effect.succeed(
    HttpServerResponse.text("", { headers: corsHeaders(request) }),
  );

const withCors = <E, R>(
  effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const response = yield* effect;
    const webResponse = HttpServerResponse.toWeb(response);
    const headers = new Headers(webResponse.headers);
    for (const [key, value] of Object.entries(corsHeaders(request))) {
      headers.set(key, value);
    }
    return HttpServerResponse.fromWeb(
      new Response(webResponse.body, {
        status: webResponse.status,
        statusText: webResponse.statusText,
        headers,
      }),
    );
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    ),
  );

const ChatStreamRequestSchema = Schema.Struct({
  messages: Schema.mutable(Schema.Array(Schema.Unknown)),
  system: Schema.optional(Schema.String),
  tools: Schema.optional(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        description: Schema.optional(Schema.String),
        parameters: Schema.Record(Schema.String, Schema.Unknown),
      }),
    ),
  ),
  config: Schema.Struct({
    provider: Schema.Literal("openai"),
    baseUrl: Schema.optional(Schema.String),
    apiKey: Schema.String,
    model: Schema.String,
    system: Schema.optional(Schema.String),
  }),
  coachMode: Schema.optional(Schema.Boolean),
  webSearch: Schema.optional(Schema.Boolean),
});

const handleAiSdkChat = (env: Record<string, unknown>, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const text = yield* request.text;
    const raw = JSON.parse(text || "{}") as unknown;
    const parsed = Schema.decodeUnknownOption(ChatStreamRequestSchema)(raw);

    if (Option.isNone(parsed)) {
      return yield* HttpServerResponse.json(
        { error: "Invalid request" },
        { status: 400 },
      );
    }

    const chatRequest = parsed.value as ChatStreamRequest;
    const apiKey = chatRequest.config.apiKey !== ""
      ? chatRequest.config.apiKey
      : (env.OPENAI_API_KEY !== undefined ? String(env.OPENAI_API_KEY) : "");
    const requestWithKey: ChatStreamRequest = {
      ...chatRequest,
      config: { ...chatRequest.config, apiKey },
    };

    const response = yield* Effect.promise(() => streamChat(requestWithKey));

    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(request))) {
      headers.set(key, value);
    }

    return HttpServerResponse.fromWeb(
      new Response(response.body as unknown as BodyInit, {
        status: response.status,
        statusText: response.statusText,
        headers,
      }),
    );
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    ),
  );
