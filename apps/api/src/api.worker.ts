import * as Cloudflare from "alchemy/Cloudflare";
import { RuntimeContext } from "alchemy";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { safeValidateUIMessages, type UIMessage, type UIMessageChunk } from "ai";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { buildAssistantParts } from "./chat/assistant-parts.ts";
import { buildChatContext } from "./chat/context.ts";
import { handleChat } from "./chat/handler.ts";
import { fitnessCoachV1 } from "./chat/prompts/fitness-coach-v1.ts";
import {
  addThreadMessage,
  createConversation,
  createThread,
  type DataSummary,
  deleteConversation,
  deleteMemory,
  deleteNote,
  discardThread,
  getConversation,
  getConversationMessages,
  getConversations,
  getDataSummary,
  getMemories,
  getMessage,
  getNotes,
  getSuggestionsById,
  getThread,
  getThreadMessages,
  getThreads,
  getThreadsIncludingDiscarded,
  getWorkouts,
  hashSuggestionsKey,
  insertHealthWorkouts,
  insertMemory,
  insertNote,
  pinThread,
  type QueryDatabaseClient,
  renameConversation,
  renameThread,
  reviseConversationMessage,
  restoreThread,
  saveConversationMessages,
  saveSuggestions,
  searchMemories,
  searchNotes,
  summarizeThread,
  updateConversationTimestamp,
  updateNote,
  updateSyncCursor,
  upsertBodyMetrics,
  upsertDailyActivity,
  upsertHevySessions,
  upsertHevySets,
  upsertSleepSessions,
} from "./db/operations.ts";
import { parseHealthExport } from "./ingest/health.ts";
import { parseHevyCsv } from "./ingest/hevy.ts";
import {
  createChatStream,
  extractMemories,
  generateSuggestions,
  generateThreadSummary,
  generateThreadTitle,
  type ChatStreamRequest,
} from "./chat/ai-sdk.ts";
import { executeTool, tools as staticToolDefinitions } from "./tools/api.ts";
import { TtlCache } from "./cache.ts";
import {
  appendGenerationChunk,
  cleanupGenerationHistory,
  createGeneration,
  expireStaleGenerations,
  finishGeneration,
  getGeneration,
  getGenerationChunks,
  getResumableGeneration,
  getRunningGeneration,
} from "./chat/generation-store.ts";
import { createGenerationReplayStream } from "./chat/generation-replay.ts";
import { createChatStreamResponse } from "./chat/ui-message-stream-response.ts";

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
      yield* router.add("GET", "/api/memories", (request) =>
        cors(request, handleMemoriesList(db, request)),
      );
      yield* router.add("POST", "/api/memories", (request) =>
        cors(request, handleMemoryCreate(db, request)),
      );
      yield* router.add("POST", "/api/memories/extract", (request) =>
        cors(request, handleMemoryExtract(db, env, request)),
      );
      yield* router.add("DELETE", "/api/memories/:memoryId", (request) =>
        cors(request, handleMemoryDelete(db, request)),
      );
      yield* router.add("GET", "/api/notes", (request) =>
        cors(request, handleNotesList(db, request)),
      );
      yield* router.add("POST", "/api/notes", (request) =>
        cors(request, handleNoteCreate(db, request)),
      );
      yield* router.add("PATCH", "/api/notes/:noteId", (request) =>
        cors(request, handleNoteUpdate(db, request)),
      );
      yield* router.add("DELETE", "/api/notes/:noteId", (request) =>
        cors(request, handleNoteDelete(db, request)),
      );
      yield* router.add("*", "/*", (request) => {
        if (request.method === "OPTIONS") return handleCorsPreflight(request);
        if (request.method === "GET") return handleAssetRequest({ assetsFetcher, request });
        return Effect.succeed(HttpServerResponse.text("Not Found", { status: 404 }));
      });
    }) as Effect.Effect<void>;

    return {
      fetch: router.asHttpEffect().pipe(
        Effect.scoped,
        Effect.catch(() =>
          Effect.succeed(HttpServerResponse.text("Internal Server Error", { status: 500 })),
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

const handleAssetRequest = ({
  assetsFetcher,
  request,
}: {
  assetsFetcher: ((request: Request) => Promise<Response>) | undefined;
  request: HttpServerRequest;
}) =>
  Effect.gen(function* () {
    const url = new URL(request.url, "http://localhost");
    const pathname = url.pathname;
    if (assetsFetcher === undefined) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    const assetRequest = pathname.match(/^\/chat\/[^/]+\/?$/)
      ? new Request(new URL("/chat/", url), request.source as Request)
      : (request.source as Request);
    const response = yield* Effect.promise(() => assetsFetcher(assetRequest));
    return HttpServerResponse.fromWeb(response);
  });

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
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
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
      return yield* HttpServerResponse.json({ error: "message is required" }, { status: 400 });
    }

    const result = yield* handleChat(db, aiGateway, env, {
      message,
      systemPrompt: body.coachMode ? fitnessCoachV1 : undefined,
    });
    return yield* HttpServerResponse.json(result);
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

interface SuggestionsConfigBody {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

interface SuggestionsRequestBody {
  threadId?: string;
  lastAssistantText?: string;
  lastUserText?: string;
  config?: SuggestionsConfigBody;
}

const resolveSuggestionsApiKey = (
  env: Record<string, unknown>,
  config?: SuggestionsConfigBody,
): string => {
  if (config?.apiKey !== undefined && config.apiKey !== "") return config.apiKey;
  if (env.OPENAI_API_KEY !== undefined) return String(env.OPENAI_API_KEY);
  return "";
};

const handleSuggestions = (
  db: QueryDatabaseClient,
  env: Record<string, unknown>,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const text = yield* request.text;
    const body = JSON.parse(text || "{}") as SuggestionsRequestBody;

    const lastAssistantText = body.lastAssistantText?.trim();
    if (lastAssistantText === undefined || lastAssistantText === "") {
      return yield* HttpServerResponse.json(
        { error: "lastAssistantText is required" },
        { status: 400 },
      );
    }

    const key = yield* hashSuggestionsKey(lastAssistantText, body.lastUserText);
    const cached = yield* getSuggestionsById(db, key);
    if (cached !== null) {
      return yield* HttpServerResponse.json({
        suggestions: JSON.parse(cached.suggestions) as string[],
      });
    }

    const apiKey = resolveSuggestionsApiKey(env, body.config);
    if (apiKey === "") {
      return yield* HttpServerResponse.json({ suggestions: [] });
    }

    const baseUrl =
      body.config?.baseUrl !== undefined && body.config.baseUrl !== ""
        ? body.config.baseUrl
        : env.OPENAI_BASE_URL !== undefined
          ? String(env.OPENAI_BASE_URL)
          : undefined;

    const suggestions = yield* Effect.promise(() =>
      generateSuggestions({
        apiKey,
        baseUrl,
        lastAssistantText,
        lastUserText: body.lastUserText,
      }),
    );

    yield* saveSuggestions(db, key, suggestions);

    return yield* HttpServerResponse.json({ suggestions });
  }).pipe(
    Effect.catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ event: "chat.request.failure", error: message }));
      return HttpServerResponse.json({ error: message }, { status: 500 });
    }),
  );

const handleRecovery = (db: QueryDatabaseClient) =>
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
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const summaryCache = new TtlCache<DataSummary>();
const SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000;

const handleSummary = (db: QueryDatabaseClient) =>
  Effect.gen(function* () {
    const cached = summaryCache.get("summary");
    if (cached !== undefined) {
      return yield* HttpServerResponse.json(cached);
    }

    const summary = yield* getDataSummary(db);
    summaryCache.set("summary", summary, SUMMARY_CACHE_TTL_MS);
    return yield* HttpServerResponse.json(summary);
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleWorkouts = (db: QueryDatabaseClient) =>
  Effect.gen(function* () {
    const workouts = yield* getWorkouts(db);
    return yield* HttpServerResponse.json({ workouts });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleConversationsList = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const url = new URL(request.url, "http://localhost");
    const search = url.searchParams.get("search") ?? undefined;
    const conversations = yield* getConversations(db, search);
    return yield* HttpServerResponse.json({ conversations });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleConversationsCreate = (db: QueryDatabaseClient) =>
  Effect.gen(function* () {
    const id = yield* createConversation(db);
    return yield* HttpServerResponse.json({ id }, { status: 201 });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleConversationDelete = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const conversationId = getConversationIdFromPath(request.url);
    if (conversationId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid conversation id" }, { status: 400 });
    }

    yield* deleteConversation(db, conversationId);
    return yield* HttpServerResponse.json({ success: true });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const getConversationIdFromPath = (urlOrPath: string): string | undefined => {
  const pathname = new URL(urlOrPath, "http://localhost").pathname;
  return pathname.split("/")[3];
};

const getThreadIdFromPath = (urlOrPath: string): string | undefined => {
  const pathname = new URL(urlOrPath, "http://localhost").pathname;
  return pathname.split("/")[3];
};

const getMessageIdFromPath = (urlOrPath: string): string | undefined => {
  const pathname = new URL(urlOrPath, "http://localhost").pathname;
  return pathname.split("/")[3];
};

const rowToMessage = (row: {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  role: string;
  parts: string;
  created_at: string;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
}) => ({
  id: row.id,
  conversationId: row.conversation_id,
  parentId: row.parent_id,
  role: row.role,
  parts: JSON.parse(row.parts) as unknown[],
  createdAt: row.created_at,
  model: row.model ?? undefined,
  usage:
    row.prompt_tokens !== null || row.completion_tokens !== null || row.total_tokens !== null
      ? {
          promptTokens: row.prompt_tokens,
          completionTokens: row.completion_tokens,
          totalTokens: row.total_tokens,
        }
      : undefined,
});

const handleConversationMessages = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const conversationId = getConversationIdFromPath(request.url);
    if (conversationId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid conversation id" }, { status: 400 });
    }

    const conversation = yield* getConversation(db, conversationId);
    if (conversation === null) {
      return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const rows = yield* getConversationMessages(db, conversationId);
    const threads = yield* getThreadsIncludingDiscarded(db, conversationId);
    const threadsWithMessages = yield* Effect.forEach(threads, (thread) =>
      getThreadMessages(db, thread.id).pipe(
        Effect.map((messages) => ({
          ...thread,
          message_ids: messages.map((message) => message.id),
        })),
      ),
    );
    const messages = rows.map(rowToMessage);
    return yield* HttpServerResponse.json({ conversation, messages, threads: threadsWithMessages });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleConversationRename = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const conversationId = getConversationIdFromPath(request.url);
    if (conversationId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid conversation id" }, { status: 400 });
    }

    const text = yield* request.text;
    const body = JSON.parse(text || "{}") as { title?: string };
    if (body.title === undefined || body.title.trim() === "") {
      return yield* HttpServerResponse.json({ error: "title is required" }, { status: 400 });
    }

    yield* renameConversation(db, conversationId, body.title.trim());
    return yield* HttpServerResponse.json({ success: true });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleConversationThreadsList = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const conversationId = getConversationIdFromPath(request.url);
    if (conversationId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid conversation id" }, { status: 400 });
    }

    const threads = yield* getThreads(db, conversationId);
    return yield* HttpServerResponse.json({ threads });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleConversationThreadsCreate = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const conversationId = getConversationIdFromPath(request.url);
    if (conversationId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid conversation id" }, { status: 400 });
    }

    const text = yield* request.text;
    const body = JSON.parse(text || "{}") as { anchorMessageId?: string; title?: string };
    if (body.anchorMessageId === undefined || body.anchorMessageId.trim() === "") {
      return yield* HttpServerResponse.json(
        { error: "anchorMessageId is required" },
        { status: 400 },
      );
    }

    const anchor = yield* getMessage(db, body.anchorMessageId.trim());
    if (anchor === null || anchor.conversation_id !== conversationId) {
      return yield* HttpServerResponse.json({ error: "Anchor message not found" }, { status: 404 });
    }

    const id = yield* createThread(
      db,
      conversationId,
      body.anchorMessageId.trim(),
      body.title?.trim(),
    );
    const thread = yield* getThread(db, id);
    return yield* HttpServerResponse.json(
      thread === null ? null : { ...thread, message_ids: [thread.anchor_message_id] },
      { status: 201 },
    );
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleThreadRead = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const threadId = getThreadIdFromPath(request.url);
    if (threadId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid thread id" }, { status: 400 });
    }

    const thread = yield* getThread(db, threadId);
    if (thread === null) {
      return yield* HttpServerResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const rows = yield* getThreadMessages(db, threadId);
    const messages = rows.map(rowToMessage);
    return yield* HttpServerResponse.json({ thread, messages });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleThreadUpdate = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const threadId = getThreadIdFromPath(request.url);
    if (threadId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid thread id" }, { status: 400 });
    }

    const text = yield* request.text;
    const body = JSON.parse(text || "{}") as {
      title?: string;
      pinned?: boolean;
      status?: string;
    };

    if (body.title !== undefined && body.title.trim() !== "") {
      yield* renameThread(db, threadId, body.title.trim());
    }

    if (body.pinned !== undefined) {
      yield* pinThread(db, threadId, body.pinned);
    }

    if (body.status === "discarded") {
      yield* discardThread(db, threadId);
    }

    if (body.status === "regular") {
      yield* restoreThread(db, threadId);
    }

    return yield* HttpServerResponse.json({ success: true });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleThreadSummarize = (
  db: QueryDatabaseClient,
  env: Record<string, unknown>,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const threadId = getThreadIdFromPath(request.url);
    if (threadId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid thread id" }, { status: 400 });
    }

    const thread = yield* getThread(db, threadId);
    if (thread === null) {
      return yield* HttpServerResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const rows = yield* getThreadMessages(db, threadId);
    const messages = rows
      .filter((row) => row.role !== "summary")
      .map((row) => ({
        role: row.role,
        text: (JSON.parse(row.parts) as Array<{ type?: string; text?: string }>)
          .filter((part) => part.type === "text" && typeof part.text === "string")
          .map((part) => part.text)
          .join("\n"),
      }))
      .filter((message) => message.text.trim() !== "");

    const apiKey = env.OPENAI_API_KEY !== undefined ? String(env.OPENAI_API_KEY) : "";
    const summaryText =
      apiKey === "" || messages.length === 0
        ? "No summary available."
        : yield* Effect.promise(() => generateThreadSummary(apiKey, undefined, messages));

    const summaryId = yield* summarizeThread(db, threadId, summaryText);
    return yield* HttpServerResponse.json({ id: summaryId, summary: summaryText });
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    ),
  );

const handleMessageRead = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const messageId = getMessageIdFromPath(request.url);
    if (messageId === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid message id" }, { status: 400 });
    }

    const message = yield* getMessage(db, messageId);
    if (message === null) {
      return yield* HttpServerResponse.json({ error: "Message not found" }, { status: 404 });
    }

    return yield* HttpServerResponse.json({ message: rowToMessage(message) });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const getMemoryIdFromPath = (pathname: string): string | undefined => {
  const match = pathname.match(/^\/api\/memories\/([^/]+)$/);
  return match?.[1];
};

const getNoteIdFromPath = (pathname: string): string | undefined => {
  const match = pathname.match(/^\/api\/notes\/([^/]+)$/);
  return match?.[1];
};

const handleMemoriesList = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const url = new URL(request.url, "http://localhost");
    const search = url.searchParams.get("search") ?? undefined;
    const limit = Number(url.searchParams.get("limit") ?? "10");
    const memories =
      search !== undefined
        ? yield* searchMemories(db, search, limit)
        : yield* getMemories(db, limit);
    return yield* HttpServerResponse.json({ memories });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleMemoryCreate = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const text = yield* request.text;
    const body = JSON.parse(text || "{}") as {
      content?: string;
      source?: string;
      threadId?: string;
    };
    if (body.content === undefined || body.content.trim() === "") {
      return yield* HttpServerResponse.json({ error: "content is required" }, { status: 400 });
    }
    const id = yield* insertMemory(db, body.content, body.source, body.threadId);
    return yield* HttpServerResponse.json({ id }, { status: id === null ? 400 : 201 });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleMemoryDelete = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const url = new URL(request.url, "http://localhost");
    const id = getMemoryIdFromPath(url.pathname);
    if (id === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid memory id" }, { status: 400 });
    }
    yield* deleteMemory(db, id);
    return yield* HttpServerResponse.json({ success: true });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleNotesList = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const url = new URL(request.url, "http://localhost");
    const search = url.searchParams.get("search") ?? undefined;
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const notes =
      search !== undefined ? yield* searchNotes(db, search, limit) : yield* getNotes(db, limit);
    return yield* HttpServerResponse.json({ notes });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleNoteCreate = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const requestText = yield* request.text;
    const body = JSON.parse(requestText || "{}") as { content?: string };
    if (body.content === undefined || body.content.trim() === "") {
      return yield* HttpServerResponse.json({ error: "content is required" }, { status: 400 });
    }
    const id = yield* insertNote(db, body.content);
    return yield* HttpServerResponse.json({ id }, { status: id === null ? 400 : 201 });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleNoteUpdate = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const url = new URL(request.url, "http://localhost");
    const id = getNoteIdFromPath(url.pathname);
    if (id === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid note id" }, { status: 400 });
    }
    const requestText = yield* request.text;
    const body = JSON.parse(requestText || "{}") as { content?: string };
    if (body.content === undefined || body.content.trim() === "") {
      return yield* HttpServerResponse.json({ error: "content is required" }, { status: 400 });
    }
    yield* updateNote(db, id, body.content);
    return yield* HttpServerResponse.json({ success: true });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleNoteDelete = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const url = new URL(request.url, "http://localhost");
    const id = getNoteIdFromPath(url.pathname);
    if (id === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid note id" }, { status: 400 });
    }
    yield* deleteNote(db, id);
    return yield* HttpServerResponse.json({ success: true });
  }).pipe(
    Effect.catch((error) => HttpServerResponse.json({ error: error.message }, { status: 500 })),
  );

const handleMemoryExtract = (
  db: QueryDatabaseClient,
  env: Record<string, unknown>,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const requestText = yield* request.text;
    const body = JSON.parse(requestText || "{}") as { text?: string; threadId?: string };
    if (body.text === undefined || body.text.trim() === "") {
      return yield* HttpServerResponse.json({ error: "text is required" }, { status: 400 });
    }
    const text = body.text;

    const apiKey = env.OPENAI_API_KEY !== undefined ? String(env.OPENAI_API_KEY) : "";
    if (apiKey === "") {
      return yield* HttpServerResponse.json(
        { error: "OpenAI API key is required" },
        { status: 400 },
      );
    }

    const baseUrl = env.OPENAI_BASE_URL !== undefined ? String(env.OPENAI_BASE_URL) : undefined;
    const snippets = yield* Effect.promise(() => extractMemories(apiKey, baseUrl, text));
    const ids: string[] = [];
    for (const snippet of snippets) {
      const id = yield* insertMemory(db, snippet, "assistant", body.threadId);
      if (id !== null) ids.push(id);
    }
    return yield* HttpServerResponse.json({ ids, count: ids.length });
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    ),
  );

const corsHeaders = (request: HttpServerRequest): Record<string, string> => {
  const origin = request.headers["origin"] ?? "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers":
      "authorization, content-type, mcp-session-id, last-event-id, mcp-protocol-version",
    "access-control-expose-headers":
      "mcp-session-id, mcp-protocol-version, x-thread-id, x-generation-id",
  };
};

const handleCorsPreflight = (request: HttpServerRequest) =>
  Effect.succeed(HttpServerResponse.text("", { headers: corsHeaders(request) }));

const withCors = <E, R>(
  effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
  request: HttpServerRequest,
) =>
  effect.pipe(
    Effect.map((response) => HttpServerResponse.setHeaders(response, corsHeaders(request))),
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
  temporary: Schema.optional(Schema.Boolean),
  sessionId: Schema.optional(Schema.String),
  threadId: Schema.optional(Schema.String),
});

const MessageRevisionSchema = Schema.Struct({
  parts: Schema.mutable(Schema.Array(Schema.Unknown)),
  threadId: Schema.optional(Schema.String),
  replaceMessageId: Schema.optional(Schema.String),
});

const handleMessageRevision = ({
  db,
  request,
  conversationId,
  messageId,
}: {
  db: QueryDatabaseClient;
  request: HttpServerRequest;
  conversationId: string;
  messageId: string;
}) =>
  Effect.gen(function* () {
    const body = yield* request.json;
    const decoded = Schema.decodeUnknownOption(MessageRevisionSchema)(body);
    if (Option.isNone(decoded)) {
      return yield* HttpServerResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const validated = yield* Effect.promise(() =>
      safeValidateUIMessages({
        messages: [{ id: messageId, role: "user", parts: decoded.value.parts }],
      }),
    );
    if (!validated.success) {
      return yield* HttpServerResponse.json({ error: validated.error.message }, { status: 400 });
    }
    const revised = yield* reviseConversationMessage({
      db,
      conversationId,
      messageId,
      parts: validated.data[0]?.parts ?? [],
      threadId: decoded.value.threadId,
    });
    if (!revised) {
      return yield* HttpServerResponse.json({ error: "Message not found" }, { status: 404 });
    }
    return yield* HttpServerResponse.json({ ok: true });
  });

const getFirstUserText = (
  messages: Array<{ role: string; parts: unknown[] }>,
): string | undefined => {
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        (part as Record<string, unknown>).type === "text" &&
        "text" in part
      ) {
        const text = (part as Record<string, unknown>).text;
        if (typeof text === "string" && text.trim() !== "") return text.trim();
      }
    }
  }
  return undefined;
};

const getLastUserText = (
  messages: Array<{ role: string; parts: unknown[] }>,
): string | undefined => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message === undefined || message.role !== "user") continue;
    for (const part of message.parts) {
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        (part as Record<string, unknown>).type === "text" &&
        "text" in part
      ) {
        const text = (part as Record<string, unknown>).text;
        if (typeof text === "string" && text.trim() !== "") return text.trim();
      }
    }
  }
  return undefined;
};

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_MESSAGE = 10;

const getAttachmentSize = (part: Record<string, unknown>): number => {
  if (part.type === "file" && typeof part.data === "string") {
    return part.data.length;
  }
  if (part.type === "file" && typeof part.url === "string") {
    return part.url.length;
  }
  if (part.type === "image" && typeof part.image === "string") {
    return part.image.length;
  }
  return 0;
};

const validateAttachments = (messages: Array<{ parts: unknown[] }>): string | undefined => {
  for (const message of messages) {
    const attachments = message.parts.filter((part) => {
      if (typeof part !== "object" || part === null) return false;
      const record = part as Record<string, unknown>;
      return record.type === "file" || record.type === "image";
    });

    if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      return `Too many attachments. Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} per message.`;
    }

    for (const attachment of attachments) {
      const size = getAttachmentSize(attachment as Record<string, unknown>);
      if (size > MAX_ATTACHMENT_BYTES * 2) {
        return "One attachment is too large. Maximum size is 5 MB.";
      }
    }
  }

  return undefined;
};

const handleAiSdkChat = (
  db: QueryDatabaseClient,
  env: Record<string, unknown>,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const requestStartedAt = performance.now();
    const text = yield* request.text;
    const raw = JSON.parse(text || "{}") as unknown;
    const parsed = Schema.decodeUnknownOption(ChatStreamRequestSchema)(raw);

    if (Option.isNone(parsed)) {
      return yield* HttpServerResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const validatedMessages = yield* Effect.promise(() =>
      safeValidateUIMessages<UIMessage>({ messages: parsed.value.messages }),
    );
    if (!validatedMessages.success) {
      return yield* HttpServerResponse.json(
        { error: validatedMessages.error.message },
        { status: 400 },
      );
    }

    const chatRequest: ChatStreamRequest = {
      ...(parsed.value as ChatStreamRequest),
      messages: validatedMessages.data,
    };
    const apiKey =
      chatRequest.config.apiKey !== ""
        ? chatRequest.config.apiKey
        : env.OPENAI_API_KEY !== undefined
          ? String(env.OPENAI_API_KEY)
          : "";

    if (apiKey === "") {
      return yield* HttpServerResponse.json(
        { error: "OpenAI API key is required" },
        { status: 400 },
      );
    }

    const requestWithKey: ChatStreamRequest = {
      ...chatRequest,
      config: { ...chatRequest.config, apiKey },
    };

    const isTemporary = chatRequest.temporary === true;

    const sessionId =
      chatRequest.sessionId !== undefined && chatRequest.sessionId !== ""
        ? chatRequest.sessionId
        : isTemporary
          ? `temp_${crypto.randomUUID()}`
          : yield* createConversation(db);

    if (!isTemporary) {
      const abandonedGenerations = yield* expireStaleGenerations({ db });
      const deletedGenerations = yield* cleanupGenerationHistory({ db });
      if (abandonedGenerations > 0 || deletedGenerations > 0) {
        console.log(
          JSON.stringify({
            event: "chat.generation.maintenance",
            abandonedGenerations,
            deletedGenerations,
          }),
        );
      }
      const conversation = yield* getConversation(db, sessionId);
      if (conversation === null) {
        return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      const runningGeneration = yield* getRunningGeneration({ db, conversationId: sessionId });
      if (runningGeneration !== null) {
        return yield* HttpServerResponse.json(
          { error: "A generation is already running", generationId: runningGeneration.id },
          { status: 409, headers: corsHeaders(request) },
        );
      }
    }

    const thread =
      isTemporary || chatRequest.threadId === undefined
        ? null
        : yield* getThread(db, chatRequest.threadId);
    if (
      chatRequest.threadId !== undefined &&
      (thread === null || thread.conversation_id !== sessionId || thread.status !== "regular")
    ) {
      return yield* HttpServerResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const conversationRows = isTemporary ? [] : yield* getConversationMessages(db, sessionId);
    const existingRows =
      thread === null
        ? conversationRows
        : yield* Effect.gen(function* () {
            const branchRows = yield* getThreadMessages(db, thread.id);
            const anchor = conversationRows.find((row) => row.id === thread.anchor_message_id);
            const contextRows =
              anchor === undefined
                ? []
                : conversationRows.filter(
                    (row) => row.parent_id === null && row.created_at <= anchor.created_at,
                  );
            return [
              ...new Map([...contextRows, ...branchRows].map((row) => [row.id, row])).values(),
            ].sort((left, right) => left.created_at.localeCompare(right.created_at));
          });
    const existingMessages = existingRows.map((row) => ({
      role: row.role as "system" | "user" | "assistant",
      parts: JSON.parse(row.parts) as unknown[],
    }));

    const requestedMessages = chatRequest.messages.map((message) => ({
      role: message.role,
      parts: message.parts,
    }));

    const attachmentError = validateAttachments(requestedMessages);
    if (attachmentError !== undefined) {
      return yield* HttpServerResponse.json({ error: attachmentError }, { status: 400 });
    }
    const replacementMessage =
      chatRequest.replaceMessageId === undefined
        ? undefined
        : existingRows.find((row) => row.id === chatRequest.replaceMessageId);
    if (
      chatRequest.replaceMessageId !== undefined &&
      (isTemporary || replacementMessage === undefined || replacementMessage.role !== "user")
    ) {
      return yield* HttpServerResponse.json(
        { error: "Replacement message not found" },
        { status: 400 },
      );
    }
    const incomingMessages = chatRequest.replaceMessageId === undefined ? requestedMessages : [];

    const toolRecord = Object.fromEntries(
      staticToolDefinitions.map((definition) => [
        definition.name,
        { description: definition.description, parameters: definition.parameters },
      ]),
    );

    const requestWithHistory: ChatStreamRequest = {
      ...requestWithKey,
      messages: [...existingMessages, ...incomingMessages] as ChatStreamRequest["messages"],
      sessionId,
      tools: toolRecord,
    };

    let lastIncomingMessageId: string | null = chatRequest.replaceMessageId ?? null;
    if (!isTemporary) {
      const branchParentId =
        thread === null ? null : (existingRows.at(-1)?.id ?? thread.anchor_message_id);
      const incomingIds =
        chatRequest.replaceMessageId === undefined
          ? yield* saveConversationMessages(
              db,
              sessionId,
              branchParentId,
              incomingMessages as Array<{ role: string; parts: unknown[] }>,
            )
          : [];
      if (chatRequest.replaceMessageId === undefined) {
        lastIncomingMessageId = incomingIds.at(-1) ?? null;
      }
      if (thread !== null) {
        yield* Effect.forEach(
          incomingIds,
          (messageId) => addThreadMessage(db, thread.id, messageId),
          {
            discard: true,
          },
        );
      }
    }

    const services = yield* Effect.context<RuntimeContext>();

    const executeToolWithServices = (name: string, args: Record<string, unknown>) => {
      const toolStartedAt = performance.now();
      return Effect.runPromiseWith(services)(
        executeTool({
          db,
          name,
          args,
          ...(isTemporary ? {} : { conversationId: sessionId }),
          summarize: (messages) =>
            Effect.promise(() =>
              generateThreadSummary(apiKey, chatRequest.config.baseUrl, messages),
            ),
        }).pipe(
          Effect.tap(() =>
            Effect.sync(() =>
              console.log(
                JSON.stringify({
                  event: "chat.tool.duration",
                  sessionId,
                  tool: name,
                  durationMilliseconds: Math.round(performance.now() - toolStartedAt),
                  status: "completed",
                }),
              ),
            ),
          ),
          Effect.tapError((error) =>
            Effect.sync(() =>
              console.log(
                JSON.stringify({
                  event: "chat.tool.duration",
                  sessionId,
                  tool: name,
                  durationMilliseconds: Math.round(performance.now() - toolStartedAt),
                  status: "failed",
                  error: error instanceof Error ? error.message : String(error),
                }),
              ),
            ),
          ),
        ),
      );
    };

    let previousProviderChunkAt = requestStartedAt;
    let providerChunkCount = 0;

    const result = yield* Effect.promise(() =>
      createChatStream({
        request: requestWithHistory,
        executeTool: executeToolWithServices,
        onChunk: ({ chunk }) => {
          const timestamp = performance.now();
          console.log(
            JSON.stringify({
              event: "chat.provider.chunk",
              sessionId,
              chunkType: chunk.type,
              chunkIndex: providerChunkCount,
              timeToFirstChunkMilliseconds:
                providerChunkCount === 0 ? Math.round(timestamp - requestStartedAt) : undefined,
              interChunkLatencyMilliseconds:
                providerChunkCount === 0
                  ? undefined
                  : Math.round(timestamp - previousProviderChunkAt),
            }),
          );
          providerChunkCount += 1;
          previousProviderChunkAt = timestamp;
        },
        onFinish: async (event) => {
          await Effect.runPromiseWith(services)(
            Effect.gen(function* () {
              const assistantParts = buildAssistantParts(event.response?.messages ?? []);

              console.log(
                JSON.stringify({
                  event: "chat.generation.finished",
                  sessionId,
                  assistantParts: assistantParts.length,
                  textLength: event.text.length,
                  promptTokens: event.usage.inputTokens,
                  completionTokens: event.usage.outputTokens,
                }),
              );

              if (!isTemporary && assistantParts.length > 0) {
                const assistantIds = yield* saveConversationMessages(
                  db,
                  sessionId,
                  thread === null ? null : (lastIncomingMessageId ?? thread.anchor_message_id),
                  [
                    {
                      role: "assistant",
                      parts: assistantParts,
                      usage: {
                        prompt_tokens: event.usage.inputTokens,
                        completion_tokens: event.usage.outputTokens,
                        total_tokens: event.usage.totalTokens,
                      },
                      model: chatRequest.config.model,
                    },
                  ],
                );
                if (thread !== null) {
                  yield* Effect.forEach(
                    assistantIds,
                    (messageId) => addThreadMessage(db, thread.id, messageId),
                    { discard: true },
                  );
                }
              }

              if (!isTemporary) {
                const firstUserText = getFirstUserText(incomingMessages);
                const conversation = yield* getConversation(db, sessionId);
                const needsTitle =
                  conversation !== null &&
                  (conversation.title === null || conversation.title === "");

                if (needsTitle && firstUserText !== undefined) {
                  const title = yield* Effect.promise(() =>
                    generateThreadTitle(apiKey, chatRequest.config.baseUrl, firstUserText),
                  );
                  yield* renameConversation(db, sessionId, title);
                }

                const lastUserText = getLastUserText(requestWithHistory.messages);
                const finalAssistantText =
                  event.text.trim() !== ""
                    ? event.text
                    : assistantParts
                        .filter(
                          (part): part is { type: "text"; text: string } =>
                            typeof part === "object" &&
                            part !== null &&
                            "type" in part &&
                            part.type === "text" &&
                            "text" in part &&
                            typeof part.text === "string",
                        )
                        .map((part) => part.text)
                        .join("\n");
                if (finalAssistantText === "") return;
                const key = yield* hashSuggestionsKey(finalAssistantText, lastUserText);
                const cached = yield* getSuggestionsById(db, key);
                if (cached !== null) return;

                const suggestions = yield* Effect.promise(() =>
                  generateSuggestions({
                    apiKey,
                    baseUrl: chatRequest.config.baseUrl,
                    lastAssistantText: finalAssistantText,
                    lastUserText,
                  }),
                );
                yield* saveSuggestions(db, key, suggestions);
              }
            }).pipe(Effect.catch(() => Effect.void)),
          );
        },
      }),
    );

    const uiMessageStream = result.toUIMessageStream({
      sendReasoning: true,
      onError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    });

    const generationId = crypto.randomUUID();
    let responseStream = uiMessageStream;

    if (!isTemporary) {
      yield* createGeneration({ db, generationId, conversationId: sessionId });
      const streams = uiMessageStream.tee();
      responseStream = streams[0];
      const executionContext = yield* Cloudflare.Workers.WorkerExecutionContext;
      executionContext.waitUntil(
        Effect.runPromiseWith(services)(
          persistGenerationStream({ db, generationId, stream: streams[1] }),
        ),
      );
    }

    const response = createChatStreamResponse({
      stream: responseStream,
      headers: {
        "x-thread-id": sessionId,
        "x-generation-id": generationId,
      },
    });

    return HttpServerResponse.setHeaders(
      HttpServerResponse.fromWeb(response),
      corsHeaders(request),
    );
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    ),
  );

const persistGenerationStream = Effect.fn("chatGeneration.persistStream")(function* ({
  db,
  generationId,
  stream,
}: {
  db: QueryDatabaseClient;
  generationId: string;
  stream: ReadableStream<UIMessageChunk>;
}) {
  const streamError = yield* Ref.make<string | undefined>(undefined);
  const persistenceStartedAt = performance.now();
  const previousChunkAt = yield* Ref.make(persistenceStartedAt);
  const persist = Stream.fromReadableStream({
    evaluate: () => stream,
    onError: (error) => error,
  }).pipe(
    Stream.zipWithIndex,
    Stream.runForEach(([chunk, sequence]) =>
      Effect.gen(function* () {
        const timestamp = performance.now();
        const previous = yield* Ref.get(previousChunkAt);
        yield* appendGenerationChunk({ db, generationId, sequence, chunk });
        console.log(
          JSON.stringify({
            event: "chat.persistence.chunk",
            generationId,
            sequence,
            timeToFirstChunkMilliseconds:
              sequence === 0 ? Math.round(timestamp - persistenceStartedAt) : undefined,
            interChunkLatencyMilliseconds:
              sequence === 0 ? undefined : Math.round(timestamp - previous),
          }),
        );
        yield* Ref.set(previousChunkAt, timestamp);
        if (chunk.type === "error") yield* Ref.set(streamError, chunk.errorText);
      }),
    ),
  );

  yield* persist.pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.gen(function* () {
          const message = error instanceof Error ? error.message : String(error);
          console.log(
            JSON.stringify({ event: "chat.generation.failure", generationId, error: message }),
          );
          yield* finishGeneration({
            db,
            generationId,
            status: "failed",
            error: message,
          });
        }),
      onSuccess: () =>
        Ref.get(streamError).pipe(
          Effect.flatMap((error) =>
            finishGeneration({
              db,
              generationId,
              status: error === undefined ? "completed" : "failed",
              error,
            }),
          ),
        ),
    }),
  );
});

const handleChatResume = (
  db: QueryDatabaseClient,
  conversationId: string,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const abandonedGenerations = yield* expireStaleGenerations({ db });
    const deletedGenerations = yield* cleanupGenerationHistory({ db });
    console.log(
      JSON.stringify({
        event: "chat.generation.reconnect",
        conversationId,
        reconnectCount: 1,
        abandonedGenerations,
        deletedGenerations,
      }),
    );
    const generation = yield* getResumableGeneration({ db, conversationId });
    if (generation === null) {
      return HttpServerResponse.empty({ status: 204, headers: corsHeaders(request) });
    }

    const services = yield* Effect.context<RuntimeContext>();
    const response = createChatStreamResponse({
      stream: Stream.toReadableStreamWith(
        createGenerationReplayStream({
          generationId: generation.id,
          getChunks: ({ generationId, afterSequence }) =>
            getGenerationChunks({ db, generationId, afterSequence }),
          getGeneration: (generationId) => getGeneration({ db, generationId }),
        }),
        services,
      ),
      headers: {
        "x-thread-id": conversationId,
        "x-generation-id": generation.id,
        ...corsHeaders(request),
      },
    });
    return HttpServerResponse.fromWeb(response);
  }).pipe(
    Effect.catch((error) =>
      HttpServerResponse.json(
        { error: String(error) },
        { status: 500, headers: corsHeaders(request) },
      ),
    ),
  );
