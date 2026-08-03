import assert from "node:assert";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import { ConversationSearchTool } from "../../src/server/conversation-search-tool.ts";
import { ConversationStoreLive } from "../../src/server/make-conversation-store.ts";
import { ConversationDatabase } from "../../src/server/db/conversations.ts";
import {
  ConversationReader,
  ConversationWriter,
  MessageStore,
  ThreadStore,
} from "../../src/server/ports/conversation-store.ts";
import { makeRequestContext } from "../../src/server/request-context.ts";
import type { ConversationDatabaseSchema } from "../../src/server/db/schema.ts";
import { makeSqliteDatabase } from "./sqlite.ts";

let nextDatabaseId = 0;

const databaseRuntime = {
  createId: () => `conversation-test-id-${nextDatabaseId++}`,
  now: () => "2026-08-02T00:00:00.000Z",
  nowMilliseconds: () => Date.parse("2026-08-02T00:00:00.000Z"),
  randomBytes: (length: number) => new Uint8Array(length).fill(7),
};

const makeInMemoryDb = () =>
  makeSqliteDatabase<ConversationDatabaseSchema>({
    runtime: databaseRuntime,
  });

describe("makeConversationStore", () => {
  it("provides each granular persistence port through one Effect Layer", async () => {
    const db = makeInMemoryDb();
    const layer = ConversationStoreLive.layer({
      db,
      requestContext: makeRequestContext({ userId: "user-layer" }),
    });
    const services = await Effect.runPromise(
      Effect.gen(function* () {
        return {
          reader: yield* ConversationReader,
          writer: yield* ConversationWriter,
          messages: yield* MessageStore,
          threads: yield* ThreadStore,
        };
      }).pipe(Effect.provide(layer)),
    );

    assert.equal(typeof services.reader.list, "function");
    assert.equal(typeof services.writer.create, "function");
    assert.equal(typeof services.messages.saveMessages, "function");
    assert.equal(typeof services.threads.createThread, "function");
  });

  it("binds userId from RequestContext into every operation and isolates ownership", async () => {
    const db = makeInMemoryDb();
    const makeStore = (userId: string) =>
      Effect.runPromise(
        ConversationStoreLive.effect({ requestContext: makeRequestContext({ userId }) }).pipe(
          Effect.provide(ConversationDatabase.layer({ db })),
        ),
      );
    const alice = await makeStore("user-alice");
    const bob = await makeStore("user-bob");

    const previousConversationId = await Effect.runPromise(
      alice.conversationWriter.create("Earlier chat"),
    );
    const [previousMessageId] = await Effect.runPromise(
      alice.messageStore.saveMessages({
        conversationId: previousConversationId,
        parentId: null,
        messages: [{ role: "user", parts: [{ type: "text", text: "My old preference" }] }],
      }),
    );
    const conversationId = await Effect.runPromise(alice.conversationWriter.create("Alice chat"));
    assert.ok(conversationId);

    assert.strictEqual(
      (await Effect.runPromise(alice.conversationReader.get(conversationId)))?.title,
      "Alice chat",
    );
    assert.strictEqual(await Effect.runPromise(bob.conversationReader.get(conversationId)), null);
    assert.deepStrictEqual(await Effect.runPromise(bob.conversationReader.list()), []);

    const [messageId] = await Effect.runPromise(
      alice.messageStore.saveMessages({
        conversationId,
        parentId: null,
        messages: [{ role: "user", parts: [{ type: "text", text: "private" }] }],
      }),
    );
    assert.ok(messageId);
    assert.strictEqual(
      (await Effect.runPromise(alice.messageStore.getMessages(conversationId))).length,
      1,
    );
    assert.strictEqual(
      (await Effect.runPromise(bob.messageStore.getMessages(conversationId))).length,
      0,
    );

    assert.deepStrictEqual(
      await Effect.runPromise(
        ConversationSearchTool.execute({
          searchMessages: alice.conversationReader.searchMessages,
          args: { query: "old preference" },
          excludeConversationId: conversationId,
        }),
      ),
      {
        results: [
          {
            conversation_id: previousConversationId,
            conversation_title: "Earlier chat",
            message_id: previousMessageId,
            message_role: "user",
            parts: [{ type: "text", text: "My old preference" }],
          },
        ],
      },
    );

    const threadId = await Effect.runPromise(
      alice.threadStore.createThread({
        conversationId,
        anchorMessageId: messageId,
        title: "Alice thread",
      }),
    );
    assert.ok(threadId);
    assert.strictEqual(
      (await Effect.runPromise(alice.threadStore.getThread(threadId)))?.title,
      "Alice thread",
    );
    assert.strictEqual(await Effect.runPromise(bob.threadStore.getThread(threadId)), null);

    assert.strictEqual(
      await Effect.runPromise(
        bob.threadStore.createThread({ conversationId, anchorMessageId: messageId }),
      ),
      null,
    );
    assert.strictEqual(
      await Effect.runPromise(bob.threadStore.addThreadMessage({ threadId, messageId })),
      false,
    );

    await Effect.runPromise(bob.conversationWriter.delete(conversationId));
    assert.ok(await Effect.runPromise(alice.conversationReader.get(conversationId)));
    await Effect.runPromise(alice.conversationWriter.delete(conversationId));
    assert.strictEqual(await Effect.runPromise(alice.conversationReader.get(conversationId)), null);
  });
});
