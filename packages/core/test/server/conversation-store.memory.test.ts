import assert from "node:assert";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import { Kysely, SqliteDialect, type Compilable } from "kysely";
import type { SqliteDatabase, SqliteStatement } from "kysely";
import { ConversationStoreLive } from "../../src/server/make-conversation-store.ts";
import { makeRequestContext } from "../../src/server/request-context.ts";
import type { QueryDatabaseClient } from "../../src/server/db/query-database.ts";
import type { ConversationDatabaseSchema } from "../../src/server/db/schema.ts";

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

const normalizeParameter = (value: unknown): SQLInputValue => {
  if (typeof value === "boolean") return Number(value);
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "string" ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  throw new Error(`Unsupported SQLite parameter: ${typeof value}`);
};

class NodeSqliteStatementAdapter implements SqliteStatement {
  readonly reader: boolean;
  readonly #statement: ReturnType<DatabaseSync["prepare"]>;

  constructor(statement: ReturnType<DatabaseSync["prepare"]>, sql: string) {
    this.#statement = statement;
    this.reader = /^\s*(select|with|pragma)/i.test(sql);
  }

  all(parameters: ReadonlyArray<unknown>): unknown[] {
    return this.#statement.all(...parameters.map(normalizeParameter));
  }

  run(parameters: ReadonlyArray<unknown>) {
    const result = this.#statement.run(...parameters.map(normalizeParameter));
    return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
  }

  iterate(parameters: ReadonlyArray<unknown>): IterableIterator<unknown> {
    return this.#statement.iterate(...parameters.map(normalizeParameter));
  }
}

class NodeSqliteDatabaseAdapter implements SqliteDatabase {
  readonly #sqlite: DatabaseSync;

  constructor(sqlite: DatabaseSync) {
    this.#sqlite = sqlite;
  }

  close(): void {
    this.#sqlite.close();
  }

  prepare(sql: string): SqliteStatement {
    return new NodeSqliteStatementAdapter(this.#sqlite.prepare(sql), sql);
  }
}

const makeInMemoryDb = (): QueryDatabaseClient<ConversationDatabaseSchema, never> => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(schemaDdl);
  const kysely = new Kysely<ConversationDatabaseSchema>({
    dialect: new SqliteDialect({ database: new NodeSqliteDatabaseAdapter(sqlite) }),
  });
  return {
    kysely: Effect.succeed(kysely),
    runtime: databaseRuntime,
    batch: (statements: ReadonlyArray<Compilable<unknown>>) =>
      Effect.promise(async () => {
        const results: Array<{ meta: { changes: number } }> = [];
        for (const statement of statements) {
          const compiled = statement.compile();
          const changes = await kysely
            .executeQuery(compiled)
            .then((result) => Number(result.numAffectedRows ?? 0));
          results.push({ meta: { changes } });
        }
        return results;
      }),
  };
};

const run = <A, E>(effect: Effect.Effect<A, E, never>) => Effect.runPromise(effect);

describe("makeConversationStore", () => {
  it("binds userId from RequestContext into every operation and isolates ownership", async () => {
    const db = makeInMemoryDb();
    const alice = ConversationStoreLive.shape({
      db,
      requestContext: makeRequestContext({ userId: "user-alice" }),
    });
    const bob = ConversationStoreLive.shape({
      db,
      requestContext: makeRequestContext({ userId: "user-bob" }),
    });

    const conversationId = await run(alice.create("Alice chat"));
    assert.ok(conversationId);

    assert.strictEqual((await run(alice.get(conversationId)))?.title, "Alice chat");
    assert.strictEqual(await run(bob.get(conversationId)), null);
    assert.deepStrictEqual(await run(bob.list()), []);

    const [messageId] = await run(
      alice.saveMessages({
        conversationId,
        parentId: null,
        messages: [{ role: "user", parts: [{ type: "text", text: "private" }] }],
      }),
    );
    assert.ok(messageId);
    assert.strictEqual((await run(alice.getMessages(conversationId))).length, 1);
    assert.strictEqual((await run(bob.getMessages(conversationId))).length, 0);

    const threadId = await run(
      alice.createThread({ conversationId, anchorMessageId: messageId, title: "Alice thread" }),
    );
    assert.ok(threadId);
    assert.strictEqual((await run(alice.getThread(threadId)))?.title, "Alice thread");
    assert.strictEqual(await run(bob.getThread(threadId)), null);

    assert.strictEqual(
      await run(bob.createThread({ conversationId, anchorMessageId: messageId })),
      null,
    );
    assert.strictEqual(await run(bob.addThreadMessage({ threadId, messageId })), false);

    await run(bob.delete(conversationId));
    assert.ok(await run(alice.get(conversationId)));
    await run(alice.delete(conversationId));
    assert.strictEqual(await run(alice.get(conversationId)), null);
  });
});
