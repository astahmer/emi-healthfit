import { RuntimeContext } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Content } from "@emi/api-contract";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { safeValidateUIMessages, type UIMessage, type UIMessageChunk } from "ai";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { CurrentUser } from "../auth/request-auth.ts";
import {
  createChatStream,
  generateThreadSummary,
  generateThreadTitle,
  type ChatStreamRequest,
} from "../chat/ai-sdk.ts";
import { buildAssistantParts } from "../chat/assistant-parts.ts";
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
  isGenerationStale,
  markGenerationStreaming,
  recordChatEvent,
  reconcileFinishedGenerations,
  type ChatGeneration,
} from "../chat/generation-store.ts";
import { createGenerationReplayStream } from "../chat/generation-replay.ts";
import { resolveGenerationTerminalState } from "../chat/generation-terminal-state.ts";
import { getProviderMessages } from "../chat/orphan-turn.ts";
import { createToolCircuitBreaker } from "../chat/tool-circuit-breaker.ts";
import { createChatStreamResponse } from "../chat/ui-message-stream-response.ts";
import { validateStoredUIMessages } from "../chat/ui-messages.ts";
import {
  addThreadMessage,
  createConversation,
  getConversation,
  getConversationMessages,
  getThread,
  getThreadMessages,
  renameConversation,
  reviseConversationMessage,
  saveConversationMessages,
} from "../db/conversations.ts";
import type { QueryDatabaseClient } from "../db/client.ts";
import { getDiagnosticBundle } from "../diagnostics/bundle.ts";
import { executeTool, tools as staticToolDefinitions } from "../tools/api.ts";
import { corsHeaders } from "./http.ts";
import { decodeMessageParts } from "../http-api-codecs.ts";
import { decodeJsonOption } from "../json-codec.ts";

const getConversationIdFromPath = (urlOrPath: string): string | undefined => {
  const pathname = urlOrPath.startsWith("http") ? new URL(urlOrPath).pathname : urlOrPath;
  return pathname.match(/\/api\/conversations\/([^/]+)/)?.[1];
};

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
    apiKey: Content,
    model: Schema.String,
    system: Schema.optional(Schema.String),
  }),
  coachMode: Schema.optional(Schema.Boolean),
  webSearch: Schema.optional(Schema.Boolean),
  temporary: Schema.optional(Schema.Boolean),
  sessionId: Schema.optional(Content),
  threadId: Schema.optional(Content),
});

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

const getFirstUserText = (
  messages: Array<{ role: string; parts: unknown[] }>,
): string | undefined => {
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      const textPart = Schema.decodeUnknownOption(
        Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }),
      )(part);
      if (Option.isSome(textPart) && textPart.value.text.trim() !== "") {
        return textPart.value.text.trim();
      }
    }
  }
  return undefined;
};

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_MESSAGE = 10;

const AttachmentPart = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("file"),
    data: Schema.optional(Schema.String),
    url: Schema.optional(Schema.String),
  }),
  Schema.Struct({ type: Schema.Literal("image"), image: Schema.optional(Schema.String) }),
]);

const getAttachmentSize = (part: typeof AttachmentPart.Type): number => {
  if (part.type === "file") return part.data?.length ?? part.url?.length ?? 0;
  return part.image?.length ?? 0;
};

const validateAttachments = (messages: Array<{ parts: unknown[] }>): string | undefined => {
  for (const message of messages) {
    const attachments = message.parts.flatMap((part) => {
      const attachment = Schema.decodeUnknownOption(AttachmentPart)(part);
      return Option.isSome(attachment) ? [attachment.value] : [];
    });

    if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      return `Too many attachments. Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} per message.`;
    }

    for (const attachment of attachments) {
      const size = getAttachmentSize(attachment);
      if (size > MAX_ATTACHMENT_BYTES * 2) {
        return "One attachment is too large. Maximum size is 5 MB.";
      }
    }
  }

  return undefined;
};

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
    const requestWithKey: ChatStreamRequest = chatRequest;

    const isTemporary = chatRequest.temporary === true;

    const sessionId =
      chatRequest.sessionId !== undefined && chatRequest.sessionId !== ""
        ? chatRequest.sessionId
        : isTemporary
          ? `temp_${crypto.randomUUID()}`
          : yield* createConversation(db, user.id);

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

    const thread =
      isTemporary || chatRequest.threadId === undefined
        ? null
        : yield* getThread(db, user.id, chatRequest.threadId);
    if (
      chatRequest.threadId !== undefined &&
      (thread === null || thread.conversation_id !== sessionId || thread.status !== "regular")
    ) {
      return yield* HttpServerResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const conversationRows = isTemporary
      ? []
      : yield* getConversationMessages(db, user.id, sessionId);
    const existingRows =
      thread === null
        ? conversationRows
        : yield* Effect.gen(function* () {
            const branchRows = yield* getThreadMessages(db, user.id, thread.id);
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
    const providerMessageRole = Schema.Literals(["system", "user", "assistant"]);
    const storedMessages = existingRows
      .filter((row) => row.role !== "summary")
      .map((row) => ({
        id: row.id,
        role: Schema.decodeUnknownSync(providerMessageRole)(row.role),
        parts: [...decodeMessageParts(row.parts)],
      }));
    const validatedExistingMessages = yield* Effect.promise(() =>
      validateStoredUIMessages(storedMessages),
    );
    const existingMessages = validatedExistingMessages.map((message) => ({
      role: message.role,
      parts: message.parts,
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
      messages: getProviderMessages({
        existingRows,
        existingMessages,
        incomingMessages,
        replaceMessageId: chatRequest.replaceMessageId,
      }),
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
              user.id,
              sessionId,
              branchParentId,
              incomingMessages,
            )
          : [];
      if (chatRequest.replaceMessageId === undefined) {
        lastIncomingMessageId = incomingIds.at(-1) ?? null;
      }
      if (thread !== null) {
        yield* Effect.forEach(
          incomingIds,
          (messageId) => addThreadMessage(db, user.id, thread.id, messageId),
          {
            discard: true,
          },
        );
      }
    }

    const services = yield* Effect.context<RuntimeContext>();
    const executionContext = isTemporary
      ? undefined
      : yield* Cloudflare.Workers.WorkerExecutionContext;
    const generationId = crypto.randomUUID();
    const requestId = request.headers["x-request-id"] ?? crypto.randomUUID();
    const traceId = request.headers["x-trace-id"] ?? requestId;
    const toolCircuitBreaker = createToolCircuitBreaker();
    const recordEvent = (type: string, payload: Record<string, unknown> = {}) =>
      isTemporary
        ? Effect.void
        : recordChatEvent({
            db,
            userId: user.id,
            conversationId: sessionId,
            generationId,
            requestId,
            traceId,
            type,
            payload,
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

    const executeToolWithServices = (name: string, args: Record<string, unknown>) => {
      const toolStartedAt = performance.now();
      if (toolCircuitBreaker.isBlocked({ name, args })) {
        return Effect.runPromiseWith(services)(
          recordEvent("tool.blocked", { tool: name, args, code: "REPEATED_FAILED_CALL" }).pipe(
            Effect.andThen(
              Effect.fail(
                new Error(
                  `Repeated failed ${name} call blocked. Use another tool or report the observed error.`,
                ),
              ),
            ),
          ),
        );
      }
      return Effect.runPromiseWith(services)(
        recordEvent("tool.started", { tool: name, args }).pipe(
          Effect.andThen(
            executeTool({
              db,
              userId: user.id,
              name,
              args,
              ...(isTemporary ? {} : { conversationId: sessionId }),
              summarize: (messages) =>
                Effect.promise(() =>
                  generateThreadSummary(
                    apiKey,
                    chatRequest.config.baseUrl,
                    chatRequest.config.model,
                    messages,
                  ),
                ),
            }),
          ),
          Effect.tap((output) =>
            Effect.all(
              [
                recordEvent("tool.succeeded", {
                  tool: name,
                  args,
                  output,
                  durationMilliseconds: Math.round(performance.now() - toolStartedAt),
                }),
                Effect.logInfo("chat.tool.duration").pipe(
                  Effect.annotateLogs({
                    sessionId,
                    generationId,
                    requestId,
                    traceId,
                    tool: name,
                    durationMilliseconds: Math.round(performance.now() - toolStartedAt),
                    status: "completed",
                  }),
                ),
              ],
              { discard: true },
            ),
          ),
          Effect.tapError((error) => {
            toolCircuitBreaker.recordFailure({ name, args });
            const message = error instanceof Error ? error.message : String(error);
            return Effect.all(
              [
                recordEvent("tool.failed", {
                  tool: name,
                  args,
                  code: error instanceof Error ? error.name : "TOOL_EXECUTION_ERROR",
                  error: message,
                  durationMilliseconds: Math.round(performance.now() - toolStartedAt),
                }),
                name === "render_component" && message.includes("Invalid")
                  ? recordEvent("component.invalid", { tool: name, args, error: message })
                  : Effect.void,
                Effect.logError("chat.tool.duration").pipe(
                  Effect.annotateLogs({
                    sessionId,
                    generationId,
                    requestId,
                    traceId,
                    tool: name,
                    durationMilliseconds: Math.round(performance.now() - toolStartedAt),
                    status: "failed",
                    error: message,
                  }),
                ),
              ],
              { discard: true },
            );
          }),
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
                  : event.text === ""
                    ? []
                    : [{ type: "text", text: event.text }];

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
                      (conversation.title !== null && conversation.title !== "")
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

const persistGenerationStream = Effect.fn("chatGeneration.persistStream")(function* ({
  db,
  userId,
  conversationId,
  generationId,
  requestId,
  traceId,
  stream,
}: {
  db: QueryDatabaseClient;
  userId: string;
  conversationId: string;
  generationId: string;
  requestId: string;
  traceId: string;
  stream: ReadableStream<UIMessageChunk>;
}) {
  const streamError = yield* Ref.make<string | undefined>(undefined);
  const finishReason = yield* Ref.make<string | undefined>(undefined);
  const sawFinish = yield* Ref.make(false);
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
        yield* appendGenerationChunk({ db, userId, generationId, sequence, chunk });
        if (sequence === 0) {
          yield* markGenerationStreaming({ db, userId, generationId });
          yield* recordChatEvent({
            db,
            userId,
            conversationId,
            generationId,
            requestId,
            traceId,
            type: "provider.first_chunk",
            payload: { timeToFirstChunkMilliseconds: Math.round(timestamp - persistenceStartedAt) },
          });
        }
        yield* Effect.logDebug("chat.persistence.chunk").pipe(
          Effect.annotateLogs({
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
        if (chunk.type === "finish") {
          yield* Ref.set(sawFinish, true);
          const finish = Schema.decodeUnknownOption(
            Schema.Struct({
              type: Schema.Literal("finish"),
              finishReason: Schema.optional(Schema.String),
            }),
          )(chunk);
          if (Option.isSome(finish) && finish.value.finishReason !== undefined) {
            yield* Ref.set(finishReason, finish.value.finishReason);
          }
        }
      }),
    ),
  );

  yield* persist.pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.gen(function* () {
          const message = error instanceof Error ? error.message : String(error);
          yield* Effect.logError("chat.generation.failure").pipe(
            Effect.annotateLogs({ generationId, error: message }),
          );
          yield* recordChatEvent({
            db,
            userId,
            conversationId,
            generationId,
            requestId,
            traceId,
            type: "persistence.failed",
            payload: { error: message },
          });
          yield* finishGeneration({
            db,
            userId,
            generationId,
            status: "failed",
            error: message,
          });
        }),
      onSuccess: () =>
        Effect.all([Ref.get(streamError), Ref.get(finishReason), Ref.get(sawFinish)]).pipe(
          Effect.flatMap(([streamErrorValue, reason, finished]) => {
            const terminal = resolveGenerationTerminalState({
              streamError: streamErrorValue,
              sawFinish: finished,
            });
            return Effect.all(
              [
                finishGeneration({
                  db,
                  userId,
                  generationId,
                  status: terminal.status,
                  error: terminal.error,
                  finishReason: reason,
                }),
                recordChatEvent({
                  db,
                  userId,
                  conversationId,
                  generationId,
                  requestId,
                  traceId,
                  type:
                    terminal.status === "completed" ? "generation.completed" : "generation.failed",
                  payload: { error: terminal.error ?? null, finishReason: reason ?? null },
                }),
              ],
              { discard: true },
            );
          }),
        ),
    }),
  );
});

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
