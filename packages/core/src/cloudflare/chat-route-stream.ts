import * as Cloudflare from "alchemy/Cloudflare";
import {
  ChatStreamRequestSchema,
  firstUserText,
  validateChatAttachments,
} from "../chat/request.ts";
import { ChatMessageParts } from "../chat/message-parts.ts";
import { OpenAiChat, OpenAiCompatibleConfigurationSchema } from "../adapters/ai-sdk/openai-chat.ts";
import { createChatStreamResponse } from "../chat/stream-response.ts";
import { ChatUiMessages } from "../chat/ui-messages.ts";
import { CurrentUser } from "../server/auth/principal.ts";
import { ConversationDatabase } from "../server/db/conversations.ts";
import { GenerationDatabase } from "../server/db/generations.ts";
import { MemoryDatabase } from "../server/db/memories.ts";
import { ConversationSearchTool } from "../server/conversation-search-tool.ts";
import { MemoryTools } from "../server/memory-tools.ts";
import { MemoryContext } from "../server/memory-context.ts";
import type { ConversationDatabaseSchema, MemoryDatabaseSchema } from "../server/db/schema.ts";
import { ConversationStoreLive } from "../server/make-conversation-store.ts";
import { GenerationStoreLive } from "../server/make-generation-store.ts";
import { MemoryStoreLive } from "../server/make-memory-store.ts";
import { makeRequestContext } from "../server/request-context.ts";
import { ChatRouteGeneration } from "./chat-route-generation.ts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import type { CloudflareQueryDatabaseClient } from "./db/client.ts";

class ChatRouteStreamError extends Schema.TaggedErrorClass<ChatRouteStreamError>()(
  "ChatRouteStreamError",
  { message: Schema.String },
) {}

export class ChatRouteStream {
  static make({
    conversationDb,
    memoryDb,
  }: {
    readonly conversationDb: CloudflareQueryDatabaseClient<ConversationDatabaseSchema>;
    readonly memoryDb: CloudflareQueryDatabaseClient<MemoryDatabaseSchema>;
  }) {
    const conversationDatabaseLayer = ConversationDatabase.layer({ db: conversationDb });
    const generationDatabaseLayer = GenerationDatabase.layer({ db: conversationDb });
    const memoryDatabaseLayer = MemoryDatabase.layer({ db: memoryDb });
    const memoryStoreFor = (userId: string) =>
      MemoryStoreLive.effect({
        requestContext: makeRequestContext({ userId }),
      }).pipe(Effect.provide(memoryDatabaseLayer));
    const conversationStoreFor = (userId: string) =>
      ConversationStoreLive.effect({
        requestContext: makeRequestContext({ userId }),
      }).pipe(Effect.provide(conversationDatabaseLayer));
    const generationStoreFor = (userId: string) =>
      GenerationStoreLive.effect({
        requestContext: makeRequestContext({ userId }),
      }).pipe(Effect.provide(generationDatabaseLayer));

    const chatEffect = Effect.fn("core.chat.stream")(function* (request: HttpServerRequest) {
      const user = yield* CurrentUser;
      const conversationStore = yield* conversationStoreFor(user.id);
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

      const protocolMessages = decoded.value.messages;
      const messages = protocolMessages.map((message) =>
        ChatUiMessages.fromProtocolMessage(message),
      );

      const temporary = decoded.value.temporary === true;
      const memoryEnabled = decoded.value.memory?.enabled !== false;
      const memoryConfiguration = {
        apiKey: decoded.value.config.apiKey,
        ...(decoded.value.config.baseUrl === undefined
          ? {}
          : { baseUrl: decoded.value.config.baseUrl }),
        model: decoded.value.memory?.model ?? decoded.value.config.model,
      };
      const memoryStore = yield* memoryStoreFor(user.id);
      const generationStore = yield* generationStoreFor(user.id);
      const requestId = decoded.value.requestId ?? crypto.randomUUID();
      const conversationId = temporary
        ? "temp_" + crypto.randomUUID()
        : (decoded.value.sessionId ?? (yield* conversationStore.conversationWriter.create()));

      if (!temporary) {
        const existingConversation =
          yield* conversationStore.conversationReader.get(conversationId);
        if (existingConversation === null) {
          return yield* HttpServerResponse.json(
            { error: "Conversation not found" },
            { status: 404 },
          );
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
          : yield* conversationStore.threadStore.getThread(decoded.value.threadId);
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
          : yield* conversationStore.threadStore.getMessages(existingThread.id);
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

      const lastMessage = protocolMessages.at(-1);
      const titleSource = firstUserText(protocolMessages);
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
          const savedUserIds = yield* conversationStore.messageStore.saveMessages({
            conversationId,
            parentId: threadParentId,
            messages: [{ id: lastMessage.id, role: "user", parts: [...lastMessage.parts] }],
          });
          assistantParentId = savedUserIds.at(-1) ?? threadParentId;
          if (existingThread !== null) {
            yield* Effect.forEach(
              savedUserIds,
              (messageId) =>
                conversationStore.threadStore.addThreadMessage({
                  threadId: existingThread.id,
                  messageId,
                }),
              { discard: true },
            );
          }
        }).pipe(Effect.tapError(markGenerationFailed));
      }

      const memorySummary =
        temporary || !memoryEnabled
          ? undefined
          : yield* MemoryContext.loadStoreEffect({
              reader: memoryStore.reader,
              summary: memoryStore.summary,
              configuration: memoryConfiguration,
            }).pipe(Effect.catch(() => Effect.succeed(undefined)));
      const result = yield* OpenAiChat.createChatStreamEffect({
        request: {
          messages,
          system: MemoryContext.append({
            system: decoded.value.system,
            summary: memorySummary,
          }),
          configuration: providerConfiguration.value,
          tools: {
            [ConversationSearchTool.name]: ConversationSearchTool.definition,
            [MemoryTools.summaryName]: {
              description: MemoryTools.summaryDescription,
              parameters: MemoryTools.summaryDefinition,
            },
            [MemoryTools.searchName]: {
              description: MemoryTools.searchDescription,
              parameters: MemoryTools.searchDefinition,
            },
          },
          webSearch: decoded.value.webSearch,
        },
        executeTool: (name, args) => {
          const tool: Effect.Effect<unknown, ChatRouteStreamError> =
            name === ConversationSearchTool.name
              ? ConversationSearchTool.execute({
                  searchMessages: conversationStore.conversationReader.searchMessages,
                  args,
                  excludeConversationId: temporary ? undefined : conversationId,
                }).pipe(
                  Effect.map((value): unknown => value),
                  Effect.mapError((error) => new ChatRouteStreamError({ message: error.message })),
                )
              : name === MemoryTools.summaryName
                ? MemoryTools.searchSummary({ args, summary: memoryStore.summary }).pipe(
                    Effect.map((value): unknown => value),
                    Effect.mapError(
                      (error) => new ChatRouteStreamError({ message: error.message }),
                    ),
                  )
                : name === MemoryTools.searchName
                  ? MemoryTools.search({ args, reader: memoryStore.reader }).pipe(
                      Effect.map((value): unknown => value),
                      Effect.mapError(
                        (error) => new ChatRouteStreamError({ message: error.message }),
                      ),
                    )
                  : Effect.fail(new ChatRouteStreamError({ message: `Unknown tool: ${name}` }));
          return Effect.runPromise(tool);
        },
        onFinish: (event) => {
          if (temporary) return;
          return Effect.runPromise(
            Effect.gen(function* () {
              const parts = yield* ChatMessageParts.buildAssistantPartsEffect(
                event.response?.messages ?? [],
              );
              const assistantParts =
                parts.length > 0 ? parts : [{ type: "text" as const, text: event.text }];
              const savedAssistantIds = yield* conversationStore.messageStore.saveMessages({
                conversationId,
                parentId: assistantParentId,
                messages: [
                  {
                    role: "assistant",
                    parts: [...assistantParts],
                    model: decoded.value.config.model,
                    usage: {
                      prompt_tokens: event.usage.inputTokens,
                      completion_tokens: event.usage.outputTokens,
                      total_tokens: event.usage.totalTokens,
                    },
                  },
                ],
              });
              if (existingThread !== null) {
                yield* Effect.forEach(
                  savedAssistantIds,
                  (messageId) =>
                    conversationStore.threadStore.addThreadMessage({
                      threadId: existingThread.id,
                      messageId,
                    }),
                  { discard: true },
                );
              }
              if (memoryEnabled && event.text.trim() !== "") {
                yield* Effect.gen(function* () {
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
                  yield* MemoryContext.refreshStoreEffect({
                    reader: memoryStore.reader,
                    summary: memoryStore.summary,
                    configuration: memoryConfiguration,
                  });
                }).pipe(Effect.catch(() => Effect.void));
              }
              if (titleSource === undefined) return;
              const storedConversation =
                yield* conversationStore.conversationReader.get(conversationId);
              if (storedConversation?.title !== null) return;
              const title = yield* OpenAiChat.generateConversationTitleEffect({
                configuration: {
                  apiKey: decoded.value.config.apiKey,
                  baseUrl: decoded.value.config.baseUrl,
                  model: decoded.value.title?.model ?? "gpt-4o-mini",
                },
                firstUserMessage: titleSource,
                prompt: decoded.value.title?.prompt,
              });
              if (title === "") return;
              yield* conversationStore.conversationWriter.rename({ conversationId, title });
            }),
          );
        },
      }).pipe(Effect.tapError(markGenerationFailed));
      const stream = OpenAiChat.toUiMessageStream({ result });
      if (!temporary) {
        const streams = stream.tee();
        const executionContext = yield* Cloudflare.Workers.WorkerExecutionContext;
        executionContext.waitUntil(
          Effect.runPromise(
            ChatRouteGeneration.persist({
              writer: generationStore.writer,
              chunkWriter: generationStore.chunkWriter,
              generationId,
              stream: streams[1],
            }),
          ).catch(() => undefined),
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
        Effect.catchTag("GenerationConflictError", (error) =>
          HttpServerResponse.json(
            { error: "A generation is already running", generationId: error.generationId },
            { status: 409 },
          ),
        ),
      );

    const resume = ({ conversationId }: { readonly conversationId: string }) =>
      Effect.fn("core.chat.resume")(function* () {
        const user = yield* CurrentUser;
        const generationStore = yield* generationStoreFor(user.id);
        const generation = yield* generationStore.reader.getResumable(conversationId);
        if (generation === null) return HttpServerResponse.empty({ status: 204 });

        const stream = Stream.toReadableStream(
          ChatRouteGeneration.replay({
            generationId: generation.id,
            getChunks: ({ generationId, afterSequence }) =>
              generationStore.chunkReader.getChunks({
                generationId,
                afterSequence,
              }),
            getGeneration: (generationId) => generationStore.reader.get(generationId),
          }),
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

    return { chat, resume };
  }
}
