import * as Cloudflare from "alchemy/Cloudflare";
import { RuntimeContext } from "alchemy";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { buildAssistantParts } from "./chat/assistant-parts.ts";
import { buildChatContext } from "./chat/context.ts";
import { handleChat } from "./chat/handler.ts";
import { fitnessCoachV1 } from "./chat/prompts/fitness-coach-v1.ts";
import {
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
  getWorkouts,
  hashSuggestionsKey,
  insertHealthWorkouts,
  insertMemory,
  insertNote,
  pinThread,
  type QueryDatabaseClient,
  renameConversation,
  renameThread,
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
import {
  executeTool,
  handleToolExecute,
  handleToolsList,
  tools as staticToolDefinitions,
} from "./tools/api.ts";
import { TtlCache } from "./cache.ts";
import {
  appendGenerationChunk,
  createGeneration,
  expireStaleGenerations,
  finishGeneration,
  getGeneration,
  getGenerationChunks,
  getResumableGeneration,
  getRunningGeneration,
} from "./chat/generation-store.ts";
import { createGenerationReplayStream } from "./chat/generation-replay.ts";

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
          const isAssetPath =
            url.pathname === "/" ||
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
          return yield* handleAiSdkChat(db, env, request);
        }

        const resumeMatch = url.pathname.match(/^\/api\/chat\/([^/]+)\/stream$/);
        if (resumeMatch !== null && request.method === "GET") {
          return yield* handleChatResume(db, decodeURIComponent(resumeMatch[1] ?? ""), request);
        }

        if (url.pathname === "/api/suggestions" && request.method === "POST") {
          return yield* withCors(handleSuggestions(db, env, request), request);
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

        if (url.pathname === "/api/conversations" && request.method === "GET") {
          return yield* withCors(handleConversationsList(db, request), request);
        }

        if (url.pathname === "/api/conversations" && request.method === "POST") {
          return yield* withCors(handleConversationsCreate(db), request);
        }

        if (url.pathname.startsWith("/api/conversations/") && request.method === "GET") {
          const pathParts = url.pathname.split("/");
          const resource = pathParts[4];
          if (resource === "messages") {
            return yield* withCors(handleConversationMessages(db, request), request);
          }
          if (resource === "threads") {
            return yield* withCors(handleConversationThreadsList(db, request), request);
          }
          return HttpServerResponse.text("Not Found", { status: 404 });
        }

        if (url.pathname.startsWith("/api/conversations/") && request.method === "PATCH") {
          const pathParts = url.pathname.split("/");
          const resource = pathParts[4];
          if (resource === "title") {
            return yield* withCors(handleConversationRename(db, request), request);
          }
          return HttpServerResponse.text("Not Found", { status: 404 });
        }

        if (url.pathname.startsWith("/api/conversations/") && request.method === "POST") {
          const pathParts = url.pathname.split("/");
          const resource = pathParts[4];
          if (resource === "threads") {
            return yield* withCors(handleConversationThreadsCreate(db, request), request);
          }
          return HttpServerResponse.text("Not Found", { status: 404 });
        }

        if (url.pathname.startsWith("/api/conversations/") && request.method === "DELETE") {
          return yield* withCors(handleConversationDelete(db, request), request);
        }

        if (url.pathname.startsWith("/api/threads/") && request.method === "GET") {
          return yield* withCors(handleThreadRead(db, request), request);
        }

        if (url.pathname.startsWith("/api/threads/") && request.method === "PATCH") {
          return yield* withCors(handleThreadUpdate(db, request), request);
        }

        if (url.pathname.startsWith("/api/threads/") && request.method === "POST") {
          const pathParts = url.pathname.split("/");
          if (pathParts[4] === "summarize") {
            return yield* withCors(handleThreadSummarize(db, env, request), request);
          }
          return HttpServerResponse.text("Not Found", { status: 404 });
        }

        if (url.pathname.startsWith("/api/messages/") && request.method === "GET") {
          return yield* withCors(handleMessageRead(db, request), request);
        }

        if (url.pathname === "/api/memories" && request.method === "GET") {
          return yield* withCors(handleMemoriesList(db, request), request);
        }

        if (url.pathname === "/api/memories" && request.method === "POST") {
          return yield* withCors(handleMemoryCreate(db, request), request);
        }

        if (url.pathname === "/api/memories/extract" && request.method === "POST") {
          return yield* withCors(handleMemoryExtract(db, env, request), request);
        }

        if (url.pathname.startsWith("/api/memories/") && request.method === "DELETE") {
          return yield* withCors(handleMemoryDelete(db, request), request);
        }

        if (url.pathname === "/api/notes" && request.method === "GET") {
          return yield* withCors(handleNotesList(db, request), request);
        }

        if (url.pathname === "/api/notes" && request.method === "POST") {
          return yield* withCors(handleNoteCreate(db, request), request);
        }

        if (url.pathname.startsWith("/api/notes/") && request.method === "PATCH") {
          return yield* withCors(handleNoteUpdate(db, request), request);
        }

        if (url.pathname.startsWith("/api/notes/") && request.method === "DELETE") {
          return yield* withCors(handleNoteDelete(db, request), request);
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
    Effect.catch((error) =>
      HttpServerResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    ),
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
  role: string;
  parts: string;
  created_at: string;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
}) => ({
  id: row.id,
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
    const threads = yield* getThreads(db, conversationId);
    const messages = rows.map(rowToMessage);
    return yield* HttpServerResponse.json({ conversation, messages, threads });
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

    const id = yield* createThread(
      db,
      conversationId,
      body.anchorMessageId.trim(),
      body.title?.trim(),
    );
    return yield* HttpServerResponse.json({ id }, { status: 201 });
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
  temporary: Schema.optional(Schema.Boolean),
  sessionId: Schema.optional(Schema.String),
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
      yield* expireStaleGenerations({ db });
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

    const existingRows = isTemporary ? [] : yield* getConversationMessages(db, sessionId);
    const existingMessages = existingRows.map((row) => ({
      role: row.role as "system" | "user" | "assistant",
      parts: JSON.parse(row.parts) as unknown[],
    }));

    const incomingMessages = chatRequest.messages.map((message) => ({
      role: message.role,
      parts: message.parts,
    }));

    const attachmentError = validateAttachments(incomingMessages);
    if (attachmentError !== undefined) {
      return yield* HttpServerResponse.json({ error: attachmentError }, { status: 400 });
    }

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

    if (!isTemporary) {
      yield* saveConversationMessages(
        db,
        sessionId,
        null,
        incomingMessages as Array<{ role: string; parts: unknown[] }>,
      );
    }

    const services = yield* Effect.context<RuntimeContext>();

    const executeToolWithServices = (name: string, args: Record<string, unknown>) =>
      Effect.runPromiseWith(services)(
        executeTool(db, name, args) as Effect.Effect<unknown, Error, RuntimeContext>,
      );

    const result = yield* Effect.promise(() =>
      createChatStream({
        request: requestWithHistory,
        executeTool: executeToolWithServices,
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
                yield* saveConversationMessages(db, sessionId, null, [
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
                ]);
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
        persistGenerationStream({
          db,
          generationId,
          stream: streams[1],
          services,
        }),
      );
    }

    const response = createUIMessageStreamResponse({
      stream: responseStream,
      headers: { "x-thread-id": sessionId, "x-generation-id": generationId },
    });

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

const persistGenerationStream = async ({
  db,
  generationId,
  stream,
  services,
}: {
  db: QueryDatabaseClient;
  generationId: string;
  stream: ReadableStream<UIMessageChunk>;
  services: Context.Context<RuntimeContext>;
}): Promise<void> => {
  const reader = stream.getReader();
  let sequence = 0;
  let streamError: string | undefined;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      await Effect.runPromiseWith(services)(
        appendGenerationChunk({ db, generationId, sequence, chunk: next.value }),
      );
      if (next.value.type === "error") streamError = next.value.errorText;
      sequence += 1;
    }
    await Effect.runPromiseWith(services)(
      finishGeneration({
        db,
        generationId,
        status: streamError === undefined ? "completed" : "failed",
        error: streamError,
      }),
    );
  } catch (error) {
    await Effect.runPromiseWith(services)(
      finishGeneration({
        db,
        generationId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  } finally {
    reader.releaseLock();
  }
};

const handleChatResume = (
  db: QueryDatabaseClient,
  conversationId: string,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    yield* expireStaleGenerations({ db });
    const generation = yield* getResumableGeneration({ db, conversationId });
    if (generation === null) {
      return HttpServerResponse.empty({ status: 204, headers: corsHeaders(request) });
    }

    const services = yield* Effect.context<RuntimeContext>();
    const runEffect = <A>(effect: Effect.Effect<A, unknown, RuntimeContext>) =>
      Effect.runPromiseWith(services)(effect);
    const response = createUIMessageStreamResponse({
      stream: createGenerationReplayStream({
        generationId: generation.id,
        getChunks: ({ generationId, afterSequence }) =>
          runEffect(getGenerationChunks({ db, generationId, afterSequence })),
        getGeneration: (generationId) => runEffect(getGeneration({ db, generationId })),
      }),
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
