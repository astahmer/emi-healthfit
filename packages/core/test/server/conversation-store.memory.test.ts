import assert from "node:assert";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
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

const schemaDdl = `
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    status TEXT NOT NULL DEFAULT 'regular',
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    parent_id TEXT,
    role TEXT NOT NULL,
    parts TEXT NOT NULL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    model TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE threads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    anchor_message_id TEXT NOT NULL,
    title TEXT,
    status TEXT NOT NULL DEFAULT 'regular',
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE thread_messages (
    user_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    included_at TEXT NOT NULL,
    PRIMARY KEY (user_id, thread_id, message_id)
  );
  CREATE TABLE suggestions (
    user_id TEXT NOT NULL,
    id TEXT NOT NULL,
    suggestions TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  );
`;

let nextDatabaseId = 0;

const databaseRuntime = {
  createId: () => `conversation-test-id-${nextDatabaseId++}`,
  now: () => "2026-08-02T00:00:00.000Z",
  nowMilliseconds: () => Date.parse("2026-08-02T00:00:00.000Z"),
  randomBytes: (length: number) => new Uint8Array(length).fill(7),
};

const makeInMemoryDb = () =>
  makeSqliteDatabase<ConversationDatabaseSchema>({
    schemaDdl,
    runtime: databaseRuntime,
  });

const run = <A, E>(effect: Effect.Effect<A, E, never>) => Effect.runPromise(effect);

describe("makeConversationStore", () => {
  it("provides each granular persistence port through one Effect Layer", async () => {
    const db = makeInMemoryDb();
    const layer = ConversationStoreLive.layer({
      db,
      requestContext: makeRequestContext({ userId: "user-layer" }),
    });
    const services = await run(
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
      run(
        ConversationStoreLive.effect({ requestContext: makeRequestContext({ userId }) }).pipe(
          Effect.provide(ConversationDatabase.layer({ db })),
        ),
      );
    const alice = await makeStore("user-alice");
    const bob = await makeStore("user-bob");

    const conversationId = await run(alice.conversationWriter.create("Alice chat"));
    assert.ok(conversationId);

    assert.strictEqual(
      (await run(alice.conversationReader.get(conversationId)))?.title,
      "Alice chat",
    );
    assert.strictEqual(await run(bob.conversationReader.get(conversationId)), null);
    assert.deepStrictEqual(await run(bob.conversationReader.list()), []);

    const [messageId] = await run(
      alice.messageStore.saveMessages({
        conversationId,
        parentId: null,
        messages: [{ role: "user", parts: [{ type: "text", text: "private" }] }],
      }),
    );
    assert.ok(messageId);
    assert.strictEqual((await run(alice.messageStore.getMessages(conversationId))).length, 1);
    assert.strictEqual((await run(bob.messageStore.getMessages(conversationId))).length, 0);

    const threadId = await run(
      alice.threadStore.createThread({
        conversationId,
        anchorMessageId: messageId,
        title: "Alice thread",
      }),
    );
    assert.ok(threadId);
    assert.strictEqual((await run(alice.threadStore.getThread(threadId)))?.title, "Alice thread");
    assert.strictEqual(await run(bob.threadStore.getThread(threadId)), null);

    assert.strictEqual(
      await run(bob.threadStore.createThread({ conversationId, anchorMessageId: messageId })),
      null,
    );
    assert.strictEqual(await run(bob.threadStore.addThreadMessage({ threadId, messageId })), false);

    await run(bob.conversationWriter.delete(conversationId));
    assert.ok(await run(alice.conversationReader.get(conversationId)));
    await run(alice.conversationWriter.delete(conversationId));
    assert.strictEqual(await run(alice.conversationReader.get(conversationId)), null);
  });
});
