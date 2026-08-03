import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { DiscordLinkDatabase } from "../../src/server/db/discord-links.ts";
import type { DiscordDatabaseSchema } from "../../src/server/db/discord-schema.ts";
import type { QueryDatabaseClient } from "../../src/server/db/query-database.ts";
import { makeSqliteDatabase } from "./sqlite.ts";

let nextDatabaseId = 0;
let nextRandomByte = 0;

const databaseRuntime = {
  createId: () => `discord-test-id-${nextDatabaseId++}`,
  now: () => "2026-08-02T00:00:00.000Z",
  nowMilliseconds: () => Date.parse("2026-08-02T00:00:00.000Z"),
  randomBytes: (length: number) => {
    const bytes = new Uint8Array(length);
    bytes[0] = nextRandomByte++;
    return bytes;
  },
};

const makeInMemoryDb = () =>
  makeSqliteDatabase<DiscordDatabaseSchema>({
    runtime: databaseRuntime,
  });

const makeDatabaseRunner = (db: QueryDatabaseClient<DiscordDatabaseSchema, never>) => {
  const databaseLayer = DiscordLinkDatabase.layer({ db });
  return <A, E>(
    program: (database: Context.Service.Shape<typeof DiscordLinkDatabase>) => Effect.Effect<A, E>,
  ) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* DiscordLinkDatabase;
        return yield* program(database);
      }).pipe(Effect.provide(databaseLayer)),
    );
};

describe("discord link codes", () => {
  it("creates a hashed one-time code, consumes it once, and isolates owners", async () => {
    const db = makeInMemoryDb();
    const runDatabase = makeDatabaseRunner(db);
    const created = await runDatabase((database) => database.createLinkCode({ userId: "user-a" }));
    assert.ok(created !== null);
    const hash = await Effect.runPromise(DiscordLinkDatabase.hashLinkCode(created.code));
    assert.notEqual(hash, created.code);

    const first = await runDatabase((database) =>
      database.consumeLinkCode({ code: created.code, discordUserId: "discord-1" }),
    );
    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.userId, "user-a");

    const linked = await runDatabase((database) =>
      database.getLinkedUserId({ discordUserId: "discord-1" }),
    );
    assert.equal(linked, "user-a");

    const second = await runDatabase((database) =>
      database.consumeLinkCode({ code: created.code, discordUserId: "discord-2" }),
    );
    assert.deepEqual(second, { ok: false, reason: "consumed" });

    const otherUserLinks = await runDatabase((database) =>
      database.listAccountLinks({ userId: "user-b" }),
    );
    assert.deepEqual(otherUserLinks, []);

    const unlinked = await runDatabase((database) =>
      database.unlinkAccountByDiscordUserId({ discordUserId: "discord-1" }),
    );
    assert.equal(unlinked, true);
    assert.equal(
      await runDatabase((database) => database.getLinkedUserId({ discordUserId: "discord-1" })),
      null,
    );
  });

  it("caps active unconsumed codes per user", async () => {
    const db = makeInMemoryDb();
    const runDatabase = makeDatabaseRunner(db);
    assert.ok(await runDatabase((database) => database.createLinkCode({ userId: "user-a" })));
    assert.ok(await runDatabase((database) => database.createLinkCode({ userId: "user-a" })));
    assert.ok(await runDatabase((database) => database.createLinkCode({ userId: "user-a" })));
    assert.equal(
      await runDatabase((database) => database.createLinkCode({ userId: "user-a" })),
      null,
    );
  });

  it("rejects expired codes", async () => {
    const db = makeInMemoryDb();
    const runDatabase = makeDatabaseRunner(db);
    const created = await runDatabase((database) => database.createLinkCode({ userId: "user-a" }));
    assert.ok(created !== null);
    const kysely = await Effect.runPromise(db.kysely);
    await kysely
      .updateTable("discord_link_codes")
      .set({ expires_at: new Date(db.runtime.nowMilliseconds() - 1000).toISOString() })
      .where("id", "=", created.id)
      .execute();

    const result = await runDatabase((database) =>
      database.consumeLinkCode({ code: created.code, discordUserId: "discord-1" }),
    );
    assert.deepEqual(result, { ok: false, reason: "expired" });
  });

  it("only one concurrent consume wins the update race", async () => {
    const db = makeInMemoryDb();
    const runDatabase = makeDatabaseRunner(db);
    const created = await runDatabase((database) => database.createLinkCode({ userId: "user-a" }));
    assert.ok(created !== null);

    const [first, second] = await Promise.all([
      runDatabase((database) =>
        database.consumeLinkCode({ code: created.code, discordUserId: "discord-1" }),
      ),
      runDatabase((database) =>
        database.consumeLinkCode({ code: created.code, discordUserId: "discord-2" }),
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
