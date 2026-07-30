import * as Cloudflare from "alchemy/Cloudflare";
import { RuntimeContext } from "alchemy";
import {
  ChatStreamRequestSchema,
  buildAssistantParts,
  createChatStream,
  createChatStreamResponse,
  firstUserText,
  generateConversationTitle,
  toUiMessageStream,
  validateChatAttachments,
  validateStoredUIMessages,
} from "@emi/core/chat";
import {
  CurrentUser,
  appendGenerationChunk,
  createConversation,
  createGeneration,
  createGenerationReplayStream,
  finishGeneration,
  getConversation,
  getGeneration,
  getGenerationByRequestId,
  getGenerationChunks,
  getResumableGeneration,
  makeConversationStore,
  makeRequestContext,
  markGenerationStreaming,
  renameConversation,
  saveConversationMessages,
  type ConversationDatabaseSchema,
} from "@emi/core/server";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import type { CloudflareQueryDatabaseClient } from "./db/client.ts";

type PersistedChatDatabase = ConversationDatabaseSchema;

const persistGeneration = async ({
  db,
  userId,
  generationId,
  stream,
  services,
}: {
  db: CloudflareQueryDatabaseClient<PersistedChatDatabase>;
  userId: string;
  generationId: string;
  stream: ReadableStream<
    Awaited<ReturnType<typeof toUiMessageStream>> extends ReadableStream<infer Chunk>
      ? Chunk
      : never
  >;
  services: Context.Context<RuntimeContext>;
}) => {
  const reader = stream.getReader();
  const run = <Value>(effect: Effect.Effect<Value, never, RuntimeContext>) =>
    Effect.runPromiseWith(services)(effect);
  let sequence = 0;
  let error: string | undefined;
  let finishReason: string | undefined;
  let sawFinish = false;
  try {
    await run(markGenerationStreaming({ db, userId, generationId }));
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      await run(appendGenerationChunk({ db, userId, generationId, sequence, chunk: next.value }));
      sequence += 1;
      if (next.value.type === "error") error = next.value.errorText;
      if (next.value.type === "finish") {
        sawFinish = true;
        finishReason = "finishReason" in next.value ? next.value.finishReason : undefined;
      }
    }
    await run(
      finishGeneration({
        db,
        userId,
        generationId,
        status: error === undefined && sawFinish ? "completed" : "failed",
        ...(error === undefined ? {} : { error }),
        ...(finishReason === undefined ? {} : { finishReason }),
      }),
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await run(finishGeneration({ db, userId, generationId, status: "failed", error: message }));
  } finally {
    reader.releaseLock();
  }
};

export const makeGenericChatRoutes = <Database extends PersistedChatDatabase>({
  db,
}: {
  db: CloudflareQueryDatabaseClient<Database>;
}) => {
  const conversationDb = db as unknown as CloudflareQueryDatabaseClient<PersistedChatDatabase>;

  const conversations = Effect.fn("core.chat.conversations")(function* (
    request: HttpServerRequest,
  ) {
    const user = yield* CurrentUser;
    const store = makeConversationStore({
      db: conversationDb,
      requestContext: makeRequestContext({ userId: user.id }),
    });
    if (request.method === "POST") {
      const id = yield* store.create();
      return yield* HttpServerResponse.json({ id }, { status: 201 });
    }
    const values = yield* store.list();
    return yield* HttpServerResponse.json({ conversations: values });
  });

  const chat = Effect.fn("core.chat.stream")(function* (request: HttpServerRequest) {
    const user = yield* CurrentUser;
    const decoded = Schema.decodeUnknownOption(ChatStreamRequestSchema)(yield* request.json);
    if (Option.isNone(decoded)) {
      return yield* HttpServerResponse.json({ error: "Invalid chat request" }, { status: 400 });
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
    const requestId = decoded.value.requestId ?? crypto.randomUUID();
    const conversationId = temporary
      ? "temp_" + crypto.randomUUID()
      : (decoded.value.sessionId ?? (yield* createConversation(conversationDb, user.id)));

    if (!temporary) {
      const conversation = yield* getConversation(conversationDb, user.id, conversationId);
      if (conversation === null) {
        return yield* HttpServerResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      const existingGeneration = yield* getGenerationByRequestId({
        db: conversationDb,
        userId: user.id,
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

    const lastMessage = messages.at(-1);
    const titleSource = firstUserText(messages);
    if (!temporary && lastMessage?.role === "user") {
      yield* saveConversationMessages(conversationDb, user.id, conversationId, null, [
        { role: "user", parts: lastMessage.parts },
      ]);
    }

    const generationId = crypto.randomUUID();
    const services = yield* Effect.context<RuntimeContext>();
    if (!temporary) {
      yield* createGeneration({
        db: conversationDb,
        userId: user.id,
        generationId,
        conversationId,
        requestId,
        model: decoded.value.config.model,
      });
    }

    const result = yield* Effect.tryPromise({
      try: () =>
        createChatStream({
          request: {
            messages,
            system: decoded.value.system,
            configuration: decoded.value.config,
          },
          executeTool: async () => {
            throw new Error("No tools are configured for this chat.");
          },
          onFinish: async (event) => {
            if (temporary) return;
            const parts = buildAssistantParts(event.response?.messages ?? []);
            const assistantParts = parts.length > 0 ? parts : [{ type: "text", text: event.text }];
            await Effect.runPromiseWith(services)(
              saveConversationMessages(conversationDb, user.id, conversationId, null, [
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
            if (titleSource === undefined) return;
            const conversation = await Effect.runPromiseWith(services)(
              getConversation(conversationDb, user.id, conversationId),
            );
            if (conversation?.title !== null) return;
            const title = await generateConversationTitle({
              configuration: {
                apiKey: decoded.value.config.apiKey,
                baseUrl: decoded.value.config.baseUrl,
                model: decoded.value.title?.model ?? "gpt-4o-mini",
              },
              firstUserMessage: titleSource,
              prompt: decoded.value.title?.prompt,
            });
            if (title === "") return;
            await Effect.runPromiseWith(services)(
              renameConversation(conversationDb, user.id, conversationId, title),
            );
          },
        }),
      catch: (cause) => new Error(cause instanceof Error ? cause.message : String(cause)),
    });
    const stream = toUiMessageStream({ result });
    if (!temporary) {
      const streams = stream.tee();
      const executionContext = yield* Cloudflare.Workers.WorkerExecutionContext;
      executionContext.waitUntil(
        persistGeneration({
          db: conversationDb,
          userId: user.id,
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

  const resume = ({ conversationId }: { conversationId: string }) =>
    Effect.fn("core.chat.resume")(function* () {
      const user = yield* CurrentUser;
      const generation = yield* getResumableGeneration({
        db: conversationDb,
        userId: user.id,
        conversationId,
      });
      if (generation === null) return HttpServerResponse.empty({ status: 204 });

      const services = yield* Effect.context<RuntimeContext>();
      const stream = Stream.toReadableStreamWith(
        createGenerationReplayStream({
          generationId: generation.id,
          getChunks: ({ generationId, afterSequence }) =>
            getGenerationChunks({
              db: conversationDb,
              userId: user.id,
              generationId,
              afterSequence,
            }),
          getGeneration: (generationId) =>
            getGeneration({ db: conversationDb, userId: user.id, generationId }),
        }),
        services,
      );
      return HttpServerResponse.fromWeb(
        createChatStreamResponse({
          stream,
          headers: {
            "x-conversation-id": conversationId,
            "x-generation-id": generation.id,
            "x-request-id": generation.request_id,
          },
        }),
      );
    });

  return { conversations, chat, resume };
};
