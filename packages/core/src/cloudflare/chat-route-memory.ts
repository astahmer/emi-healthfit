import { OpenAiChat } from "../adapters/ai-sdk/openai-chat.ts";
import { CurrentUser } from "../server/auth/principal.ts";
import { MemoryStoreLive } from "../server/make-memory-store.ts";
import { makeRequestContext } from "../server/request-context.ts";
import type { MemoryDatabaseSchema } from "../server/db/schema.ts";
import { ChatRouteSupport } from "./chat-route-support.ts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import type { CloudflareQueryDatabaseClient } from "./db/client.ts";

export class ChatRouteMemory {
  static make({ db }: { readonly db: CloudflareQueryDatabaseClient<MemoryDatabaseSchema> }) {
    const memoryStoreFor = (userId: string) =>
      MemoryStoreLive.shapes({
        db,
        requestContext: makeRequestContext({ userId }),
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

    return { memories, memory, suggestions };
  }
}
