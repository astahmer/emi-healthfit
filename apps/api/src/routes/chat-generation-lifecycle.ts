import { RuntimeContext } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Content } from "@emi/api-contract";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { safeValidateUIMessages, type UIMessage } from "ai";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { CurrentUser } from "../auth/request-auth.ts";
import { createChatStream, generateThreadTitle, type ChatStreamRequest } from "../chat/ai-sdk.ts";
import { buildAssistantParts } from "../chat/assistant-parts.ts";
import {
  cleanupGenerationHistory,
  createGeneration,
  expireStaleGenerations,
  finishGeneration,
  getGeneration,
  getGenerationChunks,
  getResumableGeneration,
  getRunningGeneration,
  isGenerationStale,
  recordChatEvent,
  reconcileFinishedGenerations,
  type ChatGeneration,
} from "../chat/generation-store.ts";
import { createGenerationReplayStream } from "../chat/generation-replay.ts";
import { createChatStreamResponse } from "../chat/ui-message-stream-response.ts";
import {
  addThreadMessage,
  createConversation,
  getConversation,
  renameConversation,
  reviseConversationMessage,
  saveConversationMessages,
} from "../db/conversations.ts";
import type { QueryDatabaseClient } from "../db/client.ts";
import { getDiagnosticBundle } from "../diagnostics/bundle.ts";
import { corsHeaders } from "./http.ts";
import { persistGenerationStream } from "./chat-stream-persistence.ts";
import { ChatStreamRequestSchema, getFirstUserText } from "./chat-request-codec.ts";
import { prepareChatHistory } from "./chat-history.ts";
import { createChatToolExecutor } from "./chat-tool-execution.ts";
import { decodeJsonOption } from "../json-codec.ts";

const getConversationIdFromPath = (urlOrPath: string): string | undefined => {
  const pathname = urlOrPath.startsWith("http") ? new URL(urlOrPath).pathname : urlOrPath;
  return pathname.match(/\/api\/conversations\/([^/]+)/)?.[1];
};

const MessageRevisionSchema = Schema.Struct({
  parts: Schema.mutable(Schema.Array(Schema.Unknown)),
  threadId: Schema.optional(Schema.String),
  replaceMessageId: Schema.optional(Schema.String),
});

export const handleMessageRevision = ({
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
    const user = yield* CurrentUser;
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
      userId: user.id,
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

export const handleConversationDiagnostics = (
  db: QueryDatabaseClient,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const conversationId = getConversationIdFromPath(request.url) ?? "";
    const includeSensitive = new URL(request.url, "http://localhost").searchParams.get(
      "includeSensitive",
    );
    const bundle = yield* getDiagnosticBundle({
      db,
      userId: user.id,
      conversationId,
      includeSensitive: includeSensitive === "true",
    });
    if (bundle === null) {
      return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    return yield* HttpServerResponse.json(bundle, {
      headers: { "cache-control": "private, no-store" },
    });
  });

const DiagnosticEventRequest = Schema.Struct({
  generationId: Schema.String,
  type: Schema.Literals([
    "client.submitted",
    "client.disconnected",
    "client.reconnected",
    "client.stopped",
    "client.refreshed",
    "client.retried",
  ]),
  payload: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

export const handleConversationDiagnosticEvent = (
  db: QueryDatabaseClient,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const conversationId = getConversationIdFromPath(request.url) ?? "";
    const body = yield* request.json;
    const decoded = yield* Schema.decodeUnknownEffect(DiagnosticEventRequest)(body).pipe(
      Effect.option,
    );
    if (Option.isNone(decoded)) {
      return yield* HttpServerResponse.json({ error: "Invalid diagnostic event" }, { status: 400 });
    }
    const generation = yield* getGeneration({
      db,
      userId: user.id,
      generationId: decoded.value.generationId,
    });
    if (generation === null || generation.conversation_id !== conversationId) {
      return yield* HttpServerResponse.json({ error: "Generation not found" }, { status: 404 });
    }
    yield* recordChatEvent({
      db,
      userId: user.id,
      conversationId,
      generationId: generation.id,
      requestId: generation.request_id,
      traceId: generation.trace_id,
      type: decoded.value.type,
      payload: decoded.value.payload ?? {},
    });
    return yield* HttpServerResponse.json({ recorded: true }, { status: 201 });
  });

export const handleAiSdkChat = (db: QueryDatabaseClient, request: HttpServerRequest) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const requestStartedAt = performance.now();
    const text = yield* request.text;
    const raw = decodeJsonOption(text);
    if (Option.isNone(raw)) {
      return yield* HttpServerResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const parsed = Schema.decodeUnknownOption(ChatStreamRequestSchema)(raw.value);

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
      ...parsed.value,
      messages: validatedMessages.data,
    };
    const apiKey = chatRequest.config.apiKey;

    const isTemporary = chatRequest.temporary === true;

    const sessionId =
      chatRequest.sessionId ??
      (isTemporary ? `temp_${crypto.randomUUID()}` : yield* createConversation(db, user.id));

    if (!isTemporary) {
      const reconciledGenerations = yield* reconcileFinishedGenerations({ db, userId: user.id });
      const abandonedGenerations = yield* expireStaleGenerations({ db, userId: user.id });
      const deletedGenerations = yield* cleanupGenerationHistory({ db, userId: user.id });
      if (reconciledGenerations > 0 || abandonedGenerations > 0 || deletedGenerations > 0) {
        yield* Effect.logInfo("chat.generation.maintenance").pipe(
          Effect.annotateLogs({ reconciledGenerations, abandonedGenerations, deletedGenerations }),
        );
      }
      const conversation = yield* getConversation(db, user.id, sessionId);
      if (conversation === null) {
        return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      const runningGeneration = yield* getRunningGeneration({
        db,
        userId: user.id,
        conversationId: sessionId,
      });
      if (runningGeneration !== null) {
        return yield* HttpServerResponse.json(
          { error: "A generation is already running", generationId: runningGeneration.id },
          { status: 409, headers: corsHeaders(request) },
        );
      }
    }

    const preparedHistory = yield* prepareChatHistory({
      db,
      userId: user.id,
      chatRequest,
      sessionId,
      isTemporary,
    });
    if ("error" in preparedHistory) {
      return yield* HttpServerResponse.json(
        { error: preparedHistory.error },
        { status: preparedHistory.status },
      );
    }
    const { thread, requestWithHistory, incomingMessages, lastIncomingMessageId } = preparedHistory;

    const services = yield* Effect.context<RuntimeContext>();
    const executionContext = isTemporary
      ? undefined
      : yield* Cloudflare.Workers.WorkerExecutionContext;
    const generationId = crypto.randomUUID();
    const requestId = request.headers["x-request-id"] ?? crypto.randomUUID();
    const traceId = request.headers["x-trace-id"] ?? requestId;
    const { recordEvent, executeToolWithServices } = createChatToolExecutor({
      db,
      userId: user.id,
      sessionId,
      generationId,
      requestId,
      traceId,
      isTemporary,
      apiKey,
      baseUrl: chatRequest.config.baseUrl,
      model: chatRequest.config.model,
      services,
    });

    if (!isTemporary) {
      yield* createGeneration({
        db,
        userId: user.id,
        generationId,
        conversationId: sessionId,
        requestId,
        traceId,
        model: chatRequest.config.model,
      });
      yield* recordEvent("generation.created", { threadId: chatRequest.threadId ?? null });
    }

    let previousProviderChunkAt = requestStartedAt;
    let providerChunkCount = 0;

    const result = yield* Effect.promise(() =>
      createChatStream({
        request: requestWithHistory,
        executeTool: executeToolWithServices,
        onChunk: ({ chunk }) => {
          const timestamp = performance.now();
          Effect.runSync(
            Effect.logDebug("chat.provider.chunk").pipe(
              Effect.annotateLogs({
                sessionId,
                generationId,
                requestId,
                traceId,
                chunkType: chunk.type,
                chunkIndex: providerChunkCount,
                timeToFirstChunkMilliseconds:
                  providerChunkCount === 0 ? Math.round(timestamp - requestStartedAt) : undefined,
                interChunkLatencyMilliseconds:
                  providerChunkCount === 0
                    ? undefined
                    : Math.round(timestamp - previousProviderChunkAt),
              }),
            ),
          );
          providerChunkCount += 1;
          previousProviderChunkAt = timestamp;
        },
        onError: async (error) => {
          if (isTemporary) return;
          await Effect.runPromiseWith(services)(
            recordEvent("provider.failed", {
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        },
        onFinish: async (event) => {
          await Effect.runPromiseWith(services)(
            Effect.gen(function* () {
              const structuredAssistantParts = buildAssistantParts(event.response?.messages ?? []);
              const assistantParts =
                structuredAssistantParts.length > 0
                  ? structuredAssistantParts
                  : Schema.is(Content)(event.text)
                    ? [{ type: "text", text: event.text }]
                    : [];

              yield* Effect.logInfo("chat.generation.finished").pipe(
                Effect.annotateLogs({
                  sessionId,
                  assistantParts: assistantParts.length,
                  textLength: event.text.length,
                  promptTokens: event.usage.inputTokens,
                  completionTokens: event.usage.outputTokens,
                  finishReason: event.finishReason,
                }),
              );

              if (!isTemporary && assistantParts.length === 0) {
                yield* finishGeneration({
                  db,
                  userId: user.id,
                  generationId,
                  status: "failed",
                  error: "Provider completed without assistant output",
                  finishReason: event.finishReason,
                });
                yield* recordEvent("generation.failed", {
                  error: "Provider completed without assistant output",
                  finishReason: event.finishReason,
                });
                return;
              }

              if (!isTemporary) {
                const assistantIds = yield* saveConversationMessages(
                  db,
                  user.id,
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
                    (messageId) => addThreadMessage(db, user.id, thread.id, messageId),
                    { discard: true },
                  );
                }
              }

              if (!isTemporary) {
                yield* finishGeneration({
                  db,
                  userId: user.id,
                  generationId,
                  status: "completed",
                  finishReason: event.finishReason,
                  inputTokens: event.usage.inputTokens ?? 0,
                  outputTokens: event.usage.outputTokens ?? 0,
                });
                yield* recordEvent("provider.finished", {
                  finishReason: event.finishReason,
                  inputTokens: event.usage.inputTokens,
                  outputTokens: event.usage.outputTokens,
                });
              }

              if (executionContext === undefined) return;
              const firstUserText = getFirstUserText(incomingMessages);
              if (firstUserText === undefined) return;
              executionContext.waitUntil(
                Effect.runPromiseWith(services)(
                  Effect.gen(function* () {
                    const conversation = yield* getConversation(db, user.id, sessionId);
                    if (
                      conversation === null ||
                      (conversation.title !== null && Schema.is(Content)(conversation.title))
                    )
                      return;
                    const title = yield* Effect.promise(() =>
                      generateThreadTitle(apiKey, chatRequest.config.baseUrl, firstUserText),
                    );
                    yield* renameConversation(db, user.id, sessionId, title);
                  }).pipe(
                    Effect.catchCause((cause) =>
                      Effect.logError("chat.generation.title.failure").pipe(
                        Effect.annotateLogs({ sessionId, error: Cause.pretty(cause) }),
                      ),
                    ),
                  ),
                ),
              );
            }).pipe(
              Effect.catchCause((cause) =>
                Effect.logError("chat.generation.onFinish.failure").pipe(
                  Effect.annotateLogs({
                    sessionId,
                    error: Cause.pretty(cause),
                  }),
                ),
              ),
            ),
          );
        },
      }),
    );

    const uiMessageStream = result.toUIMessageStream({
      sendReasoning: true,
      onError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    });

    let responseStream = uiMessageStream;

    if (executionContext !== undefined) {
      const streams = uiMessageStream.tee();
      responseStream = streams[0];
      executionContext.waitUntil(
        Effect.runPromiseWith(services)(
          persistGenerationStream({
            db,
            userId: user.id,
            conversationId: sessionId,
            generationId,
            requestId,
            traceId,
            stream: streams[1],
          }),
        ),
      );
    }

    const response = createChatStreamResponse({
      stream: responseStream,
      headers: {
        "x-thread-id": sessionId,
        "x-generation-id": generationId,
        "x-request-id": requestId,
        "x-trace-id": traceId,
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

export const handleChatResume = (
  db: QueryDatabaseClient,
  conversationId: string,
  request: HttpServerRequest,
) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;
    const reconciledGenerations = yield* reconcileFinishedGenerations({ db, userId: user.id });
    const abandonedGenerations = yield* expireStaleGenerations({ db, userId: user.id });
    const deletedGenerations = yield* cleanupGenerationHistory({ db, userId: user.id });
    yield* Effect.logInfo("chat.generation.reconnect").pipe(
      Effect.annotateLogs({
        conversationId,
        reconnectCount: 1,
        reconciledGenerations,
        abandonedGenerations,
        deletedGenerations,
      }),
    );
    const generation = yield* getResumableGeneration({ db, userId: user.id, conversationId });
    if (generation === null) {
      return HttpServerResponse.empty({ status: 204, headers: corsHeaders(request) });
    }

    const services = yield* Effect.context<RuntimeContext>();
    const response = createChatStreamResponse({
      stream: Stream.toReadableStreamWith(
        createGenerationReplayStream({
          generationId: generation.id,
          getChunks: ({ generationId, afterSequence }) =>
            getGenerationChunks({ db, userId: user.id, generationId, afterSequence }),
          getGeneration: (generationId) =>
            Effect.gen(function* () {
              const current = yield* getGeneration({ db, userId: user.id, generationId });
              if (current === null || !isGenerationStale(current)) return current;
              yield* finishGeneration({
                db,
                userId: user.id,
                generationId,
                status: "failed",
                error: "Generation timed out",
              });
              const failedGeneration: ChatGeneration = {
                ...current,
                status: "failed",
                error: "Generation timed out",
              };
              return failedGeneration;
            }),
          poll: Effect.sleep("1 second"),
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
