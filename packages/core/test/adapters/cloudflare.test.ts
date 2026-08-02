import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, it } from "node:test";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import {
  CloudflareRepositories,
  type CloudflareDatabase,
} from "../../src/adapters/cloudflare/index.ts";
import { ChatServerError } from "../../src/server/use-cases/chat-server.ts";

const schemaDdl = `
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT,
    status TEXT NOT NULL,
    pinned INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY NOT NULL,
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
  CREATE TABLE chat_generations (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    finish_reason TEXT,
    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    retry_count INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (conversation_id, request_id)
  );
`;

const toSqlInputValue = (value: unknown): SQLInputValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    value instanceof Uint8Array
  )
    return value;
  throw new TypeError("Unsupported SQLite parameter");
};

class SqliteStatement {
  private readonly statement: ReturnType<DatabaseSync["prepare"]>;
  private readonly parameters: ReadonlyArray<unknown>;

  constructor(
    statement: ReturnType<DatabaseSync["prepare"]>,
    parameters: ReadonlyArray<unknown> = [],
  ) {
    this.statement = statement;
    this.parameters = parameters;
  }

  bind(...parameters: ReadonlyArray<unknown>): SqliteStatement {
    return new SqliteStatement(this.statement, parameters);
  }

  all(): Promise<{ results: ReadonlyArray<unknown> }> {
    return Promise.resolve({
      results: this.statement.all(...this.parameters.map(toSqlInputValue)),
    });
  }

  first(): Promise<unknown | null> {
    return Promise.resolve(this.statement.get(...this.parameters.map(toSqlInputValue)) ?? null);
  }

  run(): Promise<{ meta: { changes: number } }> {
    const result = this.statement.run(...this.parameters.map(toSqlInputValue));
    return Promise.resolve({ meta: { changes: Number(result.changes) } });
  }
}

class SqliteDatabase implements CloudflareDatabase {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  prepare(query: string): SqliteStatement {
    return new SqliteStatement(this.database.prepare(query));
  }
}

const makeDatabase = (): CloudflareDatabase => {
  const database = new DatabaseSync(":memory:");
  for (const statement of schemaDdl
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean))
    database.exec(statement);
  database
    .prepare(
      "INSERT INTO conversations (id, user_id, title, status, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      "conversation-1",
      "user-1",
      "Planning",
      "regular",
      0,
      "2026-08-02T00:00:00.000Z",
      "2026-08-02T00:00:00.000Z",
    );
  return new SqliteDatabase(database);
};

describe("CloudflareRepositories", () => {
  it("maps D1 rows into provider-neutral repositories", async () => {
    const repositories = CloudflareRepositories.fromDatabase({ database: makeDatabase() });

    const conversations = await Effect.runPromise(
      repositories.conversations.list({ subject: "user-1" }),
    );
    assert.deepEqual(conversations, [
      {
        id: "conversation-1",
        title: "Planning",
        status: "regular",
        pinned: false,
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    ]);

    await Effect.runPromise(
      repositories.messages.append({
        subject: "user-1",
        conversationId: "conversation-1",
        message: {
          id: "message-1",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
          createdAt: "2026-08-02T00:01:00.000Z",
        },
      }),
    );

    const anotherUser = await Effect.runPromise(
      repositories.conversations.list({ subject: "user-2" }),
    );
    assert.deepEqual(anotherUser, []);
  });

  it("turns a unique active-generation violation into a typed conflict", async () => {
    const repositories = CloudflareRepositories.fromDatabase({ database: makeDatabase() });
    const input = {
      subject: "user-1",
      requestId: "request-1",
      conversationId: "conversation-1",
    };

    await Effect.runPromise(repositories.generations.admit(input));
    const second = await Effect.runPromiseExit(repositories.generations.admit(input));

    assert.equal(second._tag, "Failure");
    if (second._tag === "Failure") {
      const reason = second.cause.reasons[0];
      assert.equal(Cause.isFailReason<ChatServerError>(reason), true);
      if (Cause.isFailReason<ChatServerError>(reason)) assert.equal(reason.error.kind, "conflict");
    }
  });
});
