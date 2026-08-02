import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, it } from "node:test";
import * as Effect from "effect/Effect";
import { Kysely, SqliteDialect, type Compilable } from "kysely";
import type { SqliteDatabase, SqliteStatement } from "kysely";
import {
  consumeDiscordLinkCode,
  createDiscordLinkCode,
  getLinkedUserIdForDiscord,
  hashDiscordLinkCode,
  listDiscordAccountLinks,
  unlinkDiscordAccountByDiscordUserId,
} from "../../src/server/db/discord-links.ts";
import type { DiscordDatabaseSchema } from "../../src/server/db/discord-schema.ts";
import type { QueryDatabaseClient } from "../../src/server/db/query-database.ts";

const schemaDdl = `
  CREATE TABLE discord_account_links (
    discord_user_id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE discord_link_codes (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL
  );
`;

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

const makeInMemoryDb = (): QueryDatabaseClient<DiscordDatabaseSchema, never> => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(schemaDdl);
  const kysely = new Kysely<DiscordDatabaseSchema>({
    dialect: new SqliteDialect({ database: new NodeSqliteDatabaseAdapter(sqlite) }),
  });
  return {
    kysely: Effect.succeed(kysely),
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

describe("discord link codes", () => {
  it("creates a hashed one-time code, consumes it once, and isolates owners", async () => {
    const db = makeInMemoryDb();
    const created = await Effect.runPromise(createDiscordLinkCode(db, "user-a"));
    assert.ok(created !== null);
    const hash = await Effect.runPromise(hashDiscordLinkCode(created.code));
    assert.notEqual(hash, created.code);

    const first = await Effect.runPromise(
      consumeDiscordLinkCode(db, { code: created.code, discordUserId: "discord-1" }),
    );
    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.userId, "user-a");

    const linked = await Effect.runPromise(getLinkedUserIdForDiscord(db, "discord-1"));
    assert.equal(linked, "user-a");

    const second = await Effect.runPromise(
      consumeDiscordLinkCode(db, { code: created.code, discordUserId: "discord-2" }),
    );
    assert.deepEqual(second, { ok: false, reason: "consumed" });

    const otherUserLinks = await Effect.runPromise(listDiscordAccountLinks(db, "user-b"));
    assert.deepEqual(otherUserLinks, []);

    const unlinked = await Effect.runPromise(unlinkDiscordAccountByDiscordUserId(db, "discord-1"));
    assert.equal(unlinked, true);
    assert.equal(await Effect.runPromise(getLinkedUserIdForDiscord(db, "discord-1")), null);
  });

  it("caps active unconsumed codes per user", async () => {
    const db = makeInMemoryDb();
    assert.ok(await Effect.runPromise(createDiscordLinkCode(db, "user-a")));
    assert.ok(await Effect.runPromise(createDiscordLinkCode(db, "user-a")));
    assert.ok(await Effect.runPromise(createDiscordLinkCode(db, "user-a")));
    assert.equal(await Effect.runPromise(createDiscordLinkCode(db, "user-a")), null);
  });

  it("rejects expired codes", async () => {
    const db = makeInMemoryDb();
    const created = await Effect.runPromise(createDiscordLinkCode(db, "user-a"));
    assert.ok(created !== null);
    const kysely = await Effect.runPromise(db.kysely);
    await kysely
      .updateTable("discord_link_codes")
      .set({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .where("id", "=", created.id)
      .execute();

    const result = await Effect.runPromise(
      consumeDiscordLinkCode(db, { code: created.code, discordUserId: "discord-1" }),
    );
    assert.deepEqual(result, { ok: false, reason: "expired" });
  });

  it("only one concurrent consume wins the update race", async () => {
    const db = makeInMemoryDb();
    const created = await Effect.runPromise(createDiscordLinkCode(db, "user-a"));
    assert.ok(created !== null);

    const [first, second] = await Promise.all([
      Effect.runPromise(
        consumeDiscordLinkCode(db, { code: created.code, discordUserId: "discord-1" }),
      ),
      Effect.runPromise(
        consumeDiscordLinkCode(db, { code: created.code, discordUserId: "discord-2" }),
      ),
    ]);

    const winners = [first, second].filter((result) => result.ok);
    const losers = [first, second].filter((result) => !result.ok);
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.deepEqual(losers[0], { ok: false, reason: "consumed" });
    if (winners[0]?.ok) {
      assert.equal(winners[0].userId, "user-a");
    }
  });
});
