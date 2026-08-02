import * as Cloudflare from "alchemy/Cloudflare";
import { RuntimeContext } from "alchemy";
import {
  ChatStreamRequestSchema,
  CompactConversationRequestSchema,
  firstUserText,
  validateChatAttachments,
} from "../chat/request.ts";
import { buildAssistantParts } from "../chat/message-parts.ts";
import { OpenAiChat, OpenAiCompatibleConfigurationSchema } from "../chat/openai.ts";
import { createChatStreamResponse } from "../chat/stream-response.ts";
import { validateStoredUIMessages } from "../chat/ui-messages.ts";
import { ConversationDatabase } from "../server/db/conversations.ts";
import { ConversationStoreLive } from "../server/make-conversation-store.ts";
import { GenerationStoreLive } from "../server/make-generation-store.ts";
import { MemoryStoreLive } from "../server/make-memory-store.ts";
import { makeRequestContext } from "../server/request-context.ts";
import { CurrentUser } from "../server/auth/principal.ts";
import { GenerationConflictError } from "../server/ports/generation-store.ts";
import type { ConversationDatabaseSchema, MemoryDatabaseSchema } from "../server/db/schema.ts";
import { ChatRouteGeneration } from "./chat-route-generation.ts";
import { ChatRouteSupport } from "./chat-route-support.ts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import type { CloudflareQueryDatabaseClient } from "./db/client.ts";

const {
  addThreadMessage,
  cloneConversation,
  createConversation,
  createThread,
  deleteConversation,
  getConversation,
  getConversationMessages,
  getThread,
  getThreadMessages,
  getThreads,
  renameConversation,
  renameThread,
  pinThread,
  discardThread,
  restoreThread,
  saveConversationMessages,
  updateConversationState,
} = ConversationDatabase;
type PersistedChatDatabase = ConversationDatabaseSchema & MemoryDatabaseSchema;

export const makeGenericChatRoutes = <Database extends PersistedChatDatabase>({
  db,
}: {
  db: CloudflareQueryDatabaseClient<Database>;
}) => {
  const conversationDb = db as unknown as CloudflareQueryDatabaseClient<ConversationDatabaseSchema>;
  const memoryDb = db as unknown as CloudflareQueryDatabaseClient<MemoryDatabaseSchema>;
  const memoryStoreFor = (userId: string) =>
    MemoryStoreLive.shapes({
      db: memoryDb,
      requestContext: makeRequestContext({ userId }),
    });
  const generationStoreFor = (userId: string) =>
    GenerationStoreLive.shapes({
      db: conversationDb,
      requestContext: makeRequestContext({ userId }),
    });

  const conversations = Effect.fn("core.chat.conversations")(function* (
    request: HttpServerRequest,
  ) {
    const user = yield* CurrentUser;
    const stores = ConversationStoreLive.shapes({
      db: conversationDb,
      requestContext: makeRequestContext({ userId: user.id }),
    });
    if (request.method === "POST") {
      const id = yield* stores.conversationWriter.create();
      return yield* HttpServerResponse.json({ id }, { status: 201 });
    }
    const search = new URL(request.url, "http://localhost").searchParams.get("search") ?? undefined;
    const values = yield* stores.conversationReader.list(search);
    return yield* HttpServerResponse.json({
      conversations: values.map(ChatRouteSupport.conversationResponse),
    });
  });

  const conversation = Effect.fn("core.chat.conversation")(function* (request: HttpServerRequest) {
    const user = yield* CurrentUser;
    const params = yield* HttpRouter.params;
    const conversationId = params.conversationId;
    if (conversationId === undefined) {
      return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    const existing = yield* getConversation(conversationDb, user.id, conversationId);
    if (existing === null) {
      return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    if (request.method === "GET") {
      const messages = yield* getConversationMessages(conversationDb, user.id, conversationId);
      return yield* HttpServerResponse.json({
        conversation: ChatRouteSupport.conversationResponse(existing),
        messages: messages.map(ChatRouteSupport.messageResponse),
      });
    }
    if (request.method === "DELETE") {
      yield* deleteConversation(conversationDb, user.id, conversationId);
      return yield* HttpServerResponse.json({ deleted: true });
    }

    const decoded = Schema.decodeUnknownOption(ChatRouteSupport.conversationActionSchema)(
      yield* request.json,
    );
    if (Option.isNone(decoded)) {
      return yield* HttpServerResponse.json(
        { error: "Invalid conversation update" },
        { status: 400 },
      );
    }
    if (decoded.value.title !== undefined) {
      yield* renameConversation(conversationDb, user.id, conversationId, decoded.value.title);
    }
    yield* updateConversationState({
      db: conversationDb,
      userId: user.id,
      conversationId,
      status: decoded.value.status,
      pinned: decoded.value.pinned,
    });
    const updated = yield* getConversation(conversationDb, user.id, conversationId);
    if (updated === null) {
      return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    return yield* HttpServerResponse.json({
      conversation: ChatRouteSupport.conversationResponse(updated),
    });
  });

  const clone = Effect.fn("core.chat.conversation.clone")(function* () {
    const user = yield* CurrentUser;
    const params = yield* HttpRouter.params;
    const conversationId = params.conversationId;
    if (conversationId === undefined) {
      return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    const cloned = yield* cloneConversation({
      db: conversationDb,
      userId: user.id,
      conversationId,
    });
    if (cloned === null) {
      return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    return yield* HttpServerResponse.json(
      { conversation: ChatRouteSupport.conversationResponse(cloned) },
      { status: 201 },
    );
  });

  const compact = Effect.fn("core.chat.conversation.compact")(function* (
    request: HttpServerRequest,
  ) {
    const user = yield* CurrentUser;
    const params = yield* HttpRouter.params;
    const conversationId = params.conversationId;
    if (conversationId === undefined) {
      return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    const existingConversation = yield* getConversation(conversationDb, user.id, conversationId);
    if (existingConversation === null) {
      return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    const decoded = Schema.decodeUnknownOption(CompactConversationRequestSchema)(
      yield* request.json,
    );
    if (Option.isNone(decoded)) {
      return yield* HttpServerResponse.json(
        { error: "Invalid compaction request" },
        { status: 400 },
      );
    }
    const messages = (yield* getConversationMessages(conversationDb, user.id, conversationId))
      .filter((message) => message.role !== "summary")
      .map((message) => ({
        role: message.role,
        text: ChatRouteSupport.storedMessageText({ parts: message.parts }),
      }))
      .filter((message) => message.text !== "");
    if (messages.length === 0) {
      return yield* HttpServerResponse.json(
        { error: "Conversation has no text to compact" },
        { status: 400 },
      );
    }
    const summary = yield* OpenAiChat.generateConversationSummaryEffect({
      configuration: decoded.value.config,
      messages,
    });
    if (summary === "") {
      return yield* HttpServerResponse.json(
        { error: "Unable to compact conversation" },
        { status: 502 },
      );
    }
    const title = existingConversation.title?.trim() || "New chat";
    const compactedId = yield* createConversation(conversationDb, user.id, `${title} (compacted)`);
    yield* saveConversationMessages(conversationDb, user.id, compactedId, null, [
      {
        role: "system",
        parts: [
          {
            type: "text",
            text: `Use this compacted summary of the previous conversation as context:\n\n${summary}`,
          },
        ],
      },
    ]);
    const compacted = yield* getConversation(conversationDb, user.id, compactedId);
    if (compacted === null) {
      return yield* HttpServerResponse.json(
        { error: "Compacted conversation not found" },
        { status: 404 },
      );
    }
    return yield* HttpServerResponse.json(
      { conversation: ChatRouteSupport.conversationResponse(compacted) },
      { status: 201 },
    );
  });

  const memories = Effect.fn("core.chat.memories")(function* (request: HttpServerRequest) {
    const user = yield* CurrentUser;
    const memoryStore = memoryStoreFor(user.id);
    if (request.method === "POST") {
      const decoded = Schema.decodeUnknownOption(ChatRouteSupport.createMemorySchema)(
        yield* request.json,
      );
      if (Option.isNone(decoded)) {
        return yield* HttpServerResponse.json({ error: "Invalid memory" }, { status: 400 });
      }
      const id = yield* memoryStore.writer.insert({
        content: decoded.value.content,
        source: "manual",
      });
      if (id === null) {
        return yield* HttpServerResponse.json({ error: "Invalid memory" }, { status: 400 });
      }
      return yield* HttpServerResponse.json({ id }, { status: 201 });
    }
    const search = new URL(request.url, "http://localhost").searchParams.get("search") ?? "";
    const values =
      search === "" ? yield* memoryStore.reader.list() : yield* memoryStore.reader.search(search);
    return yield* HttpServerResponse.json({
      memories: values.map(ChatRouteSupport.memoryResponse),
    });
  });

  const suggestions = Effect.fn("core.chat.suggestions")(function* (request: HttpServerRequest) {
    yield* CurrentUser;
    const decoded = Schema.decodeUnknownOption(ChatRouteSupport.suggestionsRequestSchema)(
      yield* request.json,
    );
    if (Option.isNone(decoded)) {
      return yield* HttpServerResponse.json(
        { error: "Invalid suggestions request" },
        { status: 400 },
      );
    }
    const values = yield* OpenAiChat.generateSuggestionsEffect({
      configuration: {
        apiKey: decoded.value.config.apiKey,
        ...(decoded.value.config.baseUrl === undefined
          ? {}
          : { baseUrl: decoded.value.config.baseUrl }),
        model: decoded.value.config.model,
      },
      lastAssistantText: decoded.value.lastAssistantText,
      lastUserText: decoded.value.lastUserText,
    });
    return yield* HttpServerResponse.json({ suggestions: values });
  });

  const memory = Effect.fn("core.chat.memory")(function* () {
    const user = yield* CurrentUser;
    const memoryStore = memoryStoreFor(user.id);
    const params = yield* HttpRouter.params;
    const memoryId = params.memoryId;
    if (memoryId === undefined) {
      return yield* HttpServerResponse.json({ error: "Memory not found" }, { status: 404 });
    }
    yield* memoryStore.writer.delete(memoryId);
    return yield* HttpServerResponse.json({ deleted: true });
  });

  const threads = Effect.fn("core.chat.threads")(function* (request: HttpServerRequest) {
    const user = yield* CurrentUser;
    const params = yield* HttpRouter.params;
    const conversationId = params.conversationId;
    if (conversationId === undefined) {
      return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    const existingConversation = yield* getConversation(conversationDb, user.id, conversationId);
    if (existingConversation === null) {
      return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    if (request.method === "GET") {
      const values = yield* getThreads(conversationDb, user.id, conversationId);
      return yield* HttpServerResponse.json({
        threads: values.map(ChatRouteSupport.threadResponse),
      });
    }
    const decoded = Schema.decodeUnknownOption(ChatRouteSupport.createThreadSchema)(
      yield* request.json,
    );
    if (Option.isNone(decoded)) {
      return yield* HttpServerResponse.json({ error: "Invalid thread" }, { status: 400 });
    }
    const id = yield* createThread(
      conversationDb,
      user.id,
      conversationId,
      decoded.value.anchorMessageId,
      decoded.value.title,
    );
    if (id === null) {
      return yield* HttpServerResponse.json({ error: "Anchor message not found" }, { status: 404 });
    }
    const thread = yield* getThread(conversationDb, user.id, id);
    if (thread === null) {
      return yield* HttpServerResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    return yield* HttpServerResponse.json(
      { thread: ChatRouteSupport.threadResponse(thread) },
      { status: 201 },
    );
  });

  const thread = Effect.fn("core.chat.thread")(function* (request: HttpServerRequest) {
    const user = yield* CurrentUser;
    const params = yield* HttpRouter.params;
    const conversationId = params.conversationId;
    const threadId = params.threadId;
    if (conversationId === undefined || threadId === undefined) {
      return yield* HttpServerResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    const existing = yield* getThread(conversationDb, user.id, threadId);
    if (existing === null || existing.conversation_id !== conversationId) {
      return yield* HttpServerResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    if (request.method === "GET") {
      const [conversationMessages, branchMessages] = yield* Effect.all([
        getConversationMessages(conversationDb, user.id, conversationId),
        getThreadMessages(conversationDb, user.id, threadId),
      ]);
      const anchor = conversationMessages.find(
        (message) => message.id === existing.anchor_message_id,
      );
      const contextMessages =
        anchor === undefined
          ? []
          : conversationMessages.filter(
              (message) => message.parent_id === null && message.created_at <= anchor.created_at,
            );
      const messages = [
        ...new Map(
          [...contextMessages, ...branchMessages].map((message) => [message.id, message]),
        ).values(),
      ].toSorted((left, right) => left.created_at.localeCompare(right.created_at));
      return yield* HttpServerResponse.json({
        thread: ChatRouteSupport.threadResponse(existing),
        messages: messages.map(ChatRouteSupport.messageResponse),
      });
    }
    if (request.method === "DELETE") {
      yield* discardThread(conversationDb, user.id, threadId);
      return yield* HttpServerResponse.json({ deleted: true });
    }
    const decoded = Schema.decodeUnknownOption(ChatRouteSupport.threadActionSchema)(
      yield* request.json,
    );
    if (Option.isNone(decoded)) {
      return yield* HttpServerResponse.json({ error: "Invalid thread update" }, { status: 400 });
    }
    if (decoded.value.title !== undefined) {
      yield* renameThread(conversationDb, user.id, threadId, decoded.value.title);
    }
    if (decoded.value.pinned !== undefined) {
      yield* pinThread(conversationDb, user.id, threadId, decoded.value.pinned);
    }
    if (decoded.value.status === "discarded") {
      yield* discardThread(conversationDb, user.id, threadId);
    }
    if (decoded.value.status === "regular") {
      yield* restoreThread(conversationDb, user.id, threadId);
    }
    const updated = yield* getThread(conversationDb, user.id, threadId);
    if (updated === null) {
      return yield* HttpServerResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    return yield* HttpServerResponse.json({
      thread: ChatRouteSupport.threadResponse(updated),
    });
  });

  const chatEffect = Effect.fn("core.chat.stream")(function* (request: HttpServerRequest) {
    const user = yield* CurrentUser;
    const decoded = Schema.decodeUnknownOption(ChatStreamRequestSchema)(yield* request.json);
    if (Option.isNone(decoded)) {
      return yield* HttpServerResponse.json({ error: "Invalid chat request" }, { status: 400 });
    }
    const providerConfiguration = Schema.decodeUnknownOption(OpenAiCompatibleConfigurationSchema)(
      decoded.value.config,
    );
    if (Option.isNone(providerConfiguration)) {
      return yield* HttpServerResponse.json(
        { error: `Unsupported model provider: ${decoded.value.config.provider}` },
        { status: 400 },
      );
    }

    const attachmentError = validateChatAttachments(
      decoded.value.messages.flatMap((message) =>
        message !== null &&
        typeof message === "object" &&
        "parts" in message &&
        Array.isArray(message.parts)
          ? [{ parts: message.parts }]
          : [],
      ),
    );
    if (attachmentError !== undefined) {
      return yield* HttpServerResponse.json({ error: attachmentError }, { status: 400 });
    }

    const messages = yield* Effect.tryPromise({
      try: () => validateStoredUIMessages(decoded.value.messages),
      catch: (cause) => new Error(cause instanceof Error ? cause.message : String(cause)),
    }).pipe(Effect.catch(() => Effect.succeed(undefined)));
    if (messages === undefined) {
      return yield* HttpServerResponse.json({ error: "Invalid chat messages" }, { status: 400 });
    }

    const temporary = decoded.value.temporary === true;
    const memoryEnabled = decoded.value.memory?.enabled !== false;
    const memoryConfiguration = {
      apiKey: decoded.value.config.apiKey,
      ...(decoded.value.config.baseUrl === undefined
        ? {}
        : { baseUrl: decoded.value.config.baseUrl }),
      model: decoded.value.memory?.model ?? decoded.value.config.model,
    };
    const memoryStore = memoryStoreFor(user.id);
    const generationStore = generationStoreFor(user.id);
    const requestId = decoded.value.requestId ?? crypto.randomUUID();
    const conversationId = temporary
      ? "temp_" + crypto.randomUUID()
      : (decoded.value.sessionId ?? (yield* createConversation(conversationDb, user.id)));

    if (!temporary) {
      const existingConversation = yield* getConversation(conversationDb, user.id, conversationId);
      if (existingConversation === null) {
        return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      const existingGeneration = yield* generationStore.reader.getByRequestId({
        conversationId,
        requestId,
      });
      if (existingGeneration !== null) {
        return yield* HttpServerResponse.json(
          { error: "Request is already in progress", generationId: existingGeneration.id },
          { status: 409 },
        );
      }
    }

    const existingThread =
      temporary || decoded.value.threadId === undefined
        ? null
        : yield* getThread(conversationDb, user.id, decoded.value.threadId);
    if (
      decoded.value.threadId !== undefined &&
      (existingThread === null ||
        existingThread.conversation_id !== conversationId ||
        existingThread.status !== "regular")
    ) {
      return yield* HttpServerResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const threadMessages =
      existingThread === null
        ? []
        : yield* getThreadMessages(conversationDb, user.id, existingThread.id);
    const threadParentId = threadMessages.at(-1)?.id ?? existingThread?.anchor_message_id ?? null;

    const generationId = crypto.randomUUID();
    if (!temporary) {
      yield* generationStore.writer.create({
        generationId,
        conversationId,
        requestId,
        model: decoded.value.config.model,
      });
    }

    const lastMessage = messages.at(-1);
    const titleSource = firstUserText(messages);
    let assistantParentId = threadParentId;
    const markGenerationFailed = (cause: unknown) =>
      temporary
        ? Effect.void
        : generationStore.writer
            .finish({
              generationId,
              status: "failed",
              error: cause instanceof Error ? cause.message : String(cause),
            })
            .pipe(Effect.catch(() => Effect.void));
    if (!temporary && lastMessage?.role === "user") {
      yield* Effect.gen(function* () {
        const savedUserIds = yield* saveConversationMessages(
          conversationDb,
          user.id,
          conversationId,
          threadParentId,
          [{ id: lastMessage.id, role: "user", parts: lastMessage.parts }],
        );
        assistantParentId = savedUserIds.at(-1) ?? threadParentId;
        if (existingThread !== null) {
          yield* Effect.forEach(
            savedUserIds,
            (messageId) => addThreadMessage(conversationDb, user.id, existingThread.id, messageId),
            { discard: true },
          );
        }
      }).pipe(Effect.tapError(markGenerationFailed));
    }

    const services = yield* Effect.context<RuntimeContext>();
    const memorySummary =
      temporary || !memoryEnabled
        ? undefined
        : yield* ChatRouteSupport.loadMemorySummary({
            reader: memoryStore.reader,
            summary: memoryStore.summary,
            configuration: memoryConfiguration,
          }).pipe(Effect.catch(() => Effect.succeed(undefined)));
    const result = yield* OpenAiChat.createChatStreamEffect({
      request: {
        messages,
        system: ChatRouteSupport.appendMemoryContext({
          system: decoded.value.system,
          summary: memorySummary,
        }),
        configuration: providerConfiguration.value,
        webSearch: decoded.value.webSearch,
      },
      executeTool: async () => {
        throw new Error("No tools are configured for this chat.");
      },
      onFinish: async (event) => {
        if (temporary) return;
        const parts = buildAssistantParts(event.response?.messages ?? []);
        const assistantParts = parts.length > 0 ? parts : [{ type: "text", text: event.text }];
        const savedAssistantIds = await Effect.runPromiseWith(services)(
          saveConversationMessages(conversationDb, user.id, conversationId, assistantParentId, [
            {
              role: "assistant",
              parts: assistantParts,
              model: decoded.value.config.model,
              usage: {
                prompt_tokens: event.usage.inputTokens,
                completion_tokens: event.usage.outputTokens,
                total_tokens: event.usage.totalTokens,
              },
            },
          ]),
        );
        if (existingThread !== null) {
          await Effect.runPromiseWith(services)(
            Effect.forEach(
              savedAssistantIds,
              (messageId) =>
                addThreadMessage(conversationDb, user.id, existingThread.id, messageId),
              { discard: true },
            ),
          );
        }
        if (memoryEnabled && event.text.trim() !== "") {
          await Effect.runPromiseWith(services)(
            Effect.gen(function* () {
              const existingMemories = yield* memoryStore.reader.list({ limit: 60 });
              const snippets = yield* OpenAiChat.extractMemoriesEffect({
                configuration: memoryConfiguration,
                text: event.text,
                existingMemories: existingMemories.map((memoryRecord) => memoryRecord.content),
              });
              const ids = yield* memoryStore.writer.insertMany(
                snippets.map((content) => ({
                  content,
                  source: "auto",
                  threadId: existingThread?.id,
                  messageId: savedAssistantIds.at(-1),
                })),
              );
              if (ids.length === 0) return;
              yield* ChatRouteSupport.refreshMemorySummary({
                reader: memoryStore.reader,
                summary: memoryStore.summary,
                configuration: memoryConfiguration,
              });
            }).pipe(Effect.catch(() => Effect.void)),
          );
        }
        if (titleSource !== undefined) {
          const storedConversation = await Effect.runPromiseWith(services)(
            getConversation(conversationDb, user.id, conversationId),
          );
          if (storedConversation?.title === null) {
            const title = await OpenAiChat.generateConversationTitle({
              configuration: {
                apiKey: decoded.value.config.apiKey,
                baseUrl: decoded.value.config.baseUrl,
                model: decoded.value.title?.model ?? "gpt-4o-mini",
              },
              firstUserMessage: titleSource,
              prompt: decoded.value.title?.prompt,
            });
            if (title !== "") {
              await Effect.runPromiseWith(services)(
                renameConversation(conversationDb, user.id, conversationId, title),
              );
            }
          }
        }
      },
    }).pipe(Effect.tapError(markGenerationFailed));
    const stream = OpenAiChat.toUiMessageStream({ result });
    if (!temporary) {
      const streams = stream.tee();
      const executionContext = yield* Cloudflare.Workers.WorkerExecutionContext;
      executionContext.waitUntil(
        ChatRouteGeneration.persist({
          writer: generationStore.writer,
          chunkWriter: generationStore.chunkWriter,
          generationId,
          stream: streams[1],
          services,
        }),
      );
      return HttpServerResponse.fromWeb(
        createChatStreamResponse({
          stream: streams[0],
          headers: {
            "x-conversation-id": conversationId,
            "x-generation-id": generationId,
            "x-request-id": requestId,
          },
        }),
      );
    }

    return HttpServerResponse.fromWeb(
      createChatStreamResponse({
        stream,
        headers: { "x-conversation-id": conversationId, "x-request-id": requestId },
      }),
    );
  });

  const chat = (request: HttpServerRequest) =>
    chatEffect(request).pipe(
      Effect.catchIf(
        (error): error is GenerationConflictError => error instanceof GenerationConflictError,
        (error) =>
          HttpServerResponse.json(
            { error: "A generation is already running", generationId: error.generationId },
            { status: 409 },
          ),
      ),
    );

  const resume = ({ conversationId }: { conversationId: string }) =>
    Effect.fn("core.chat.resume")(function* () {
      const user = yield* CurrentUser;
      const generationStore = generationStoreFor(user.id);
      const generation = yield* generationStore.reader.getResumable(conversationId);
      if (generation === null) return HttpServerResponse.empty({ status: 204 });

      const services = yield* Effect.context<RuntimeContext>();
      const stream = Stream.toReadableStreamWith(
        ChatRouteGeneration.replay({
          generationId: generation.id,
          getChunks: ({ generationId, afterSequence }) =>
            generationStore.chunkReader.getChunks({
              generationId,
              afterSequence,
            }),
          getGeneration: (generationId) => generationStore.reader.get(generationId),
        }),
        services,
      );
      return HttpServerResponse.fromWeb(
        createChatStreamResponse({
          stream,
          headers: {
            "x-conversation-id": conversationId,
            "x-generation-id": generation.id,
            "x-request-id": generation.requestId,
          },
        }),
      );
    });

  return {
    conversations,
    conversation,
    clone,
    compact,
    memories,
    memory,
    suggestions,
    threads,
    thread,
    chat,
    resume,
  };
};
