import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Effect } from "effect";
import { makeSqliteDatabase, run } from "./sqlite.ts";
import { encryptHevyApiKey } from "../src/integrations/hevy/credential-crypto.ts";
import { upsertHevyConnection } from "../src/integrations/hevy/hevy-store.ts";
import { connectHevy, syncHevy } from "../src/integrations/hevy/hevy-sync.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const workout = ({
  id,
  title,
  updatedAt,
}: {
  id: string;
  title: string;
  updatedAt: string;
}) => ({
  id,
  title,
  start_time: updatedAt,
  end_time: updatedAt,
  updated_at: updatedAt,
  exercises: [
    {
      index: 0,
      title: "Bench",
      sets: [{ index: 1, weight_kg: 60, reps: 5 }],
    },
  ],
});

const seedConnectedUser = async ({
  db,
  userId,
  environment,
  keyBytes,
}: {
  db: ReturnType<typeof makeSqliteDatabase>["db"];
  userId: string;
  environment: { HEVY_CREDENTIAL_ENCRYPTION_KEY: string };
  keyBytes: Uint8Array;
}) => {
  const envelope = await Effect.runPromise(
    encryptHevyApiKey({ apiKey: "hevy-test-key", userId, keyBytes }),
  );
  await run(
    upsertHevyConnection({
      db,
      userId,
      providerUserId: "u1",
      envelope,
      status: "connected",
    }),
  );
};

describe("Hevy sync edge cases", () => {
  it("imports multiple workout list pages on initial sync", async () => {
    const { db } = makeSqliteDatabase();
    const environment = { HEVY_CREDENTIAL_ENCRYPTION_KEY: "a".repeat(64) };
    const pages: number[] = [];

    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/v1/user/info")) {
        return Response.json({ data: { id: "u1", name: "Ada" } });
      }
      if (url.includes("/v1/workouts/events")) {
        return Response.json({ page: 1, page_count: 1, events: [] });
      }
      if (url.includes("/v1/workouts?") || /\/v1\/workouts$/.test(new URL(url).pathname)) {
        const page = Number(new URL(url).searchParams.get("page") ?? "1");
        pages.push(page);
        if (page === 1) {
          return Response.json({
            page: 1,
            page_count: 2,
            workouts: [workout({ id: "w-1", title: "A", updatedAt: "2026-07-01T10:00:00.000Z" })],
          });
        }
        return Response.json({
          page: 2,
          page_count: 2,
          workouts: [workout({ id: "w-2", title: "B", updatedAt: "2026-07-02T10:00:00.000Z" })],
        });
      }
      return new Response("not found", { status: 404 });
    };

    const connected = await run(
      connectHevy({
        db,
        userId: "user-1",
        apiKey: "hevy-test-key",
        environment,
      }),
    );
    assert.equal(connected.mode, "initial");
    assert.equal(connected.imported, 2);
    assert.deepEqual(pages, [1, 2]);

    const kysely = await run(db.kysely);
    const sessions = await kysely
      .selectFrom("hevy_sessions")
      .select("provider_workout_id")
      .where("user_id", "=", "user-1")
      .orderBy("provider_workout_id")
      .execute();
    assert.deepEqual(
      sessions.map((row) => row.provider_workout_id),
      ["w-1", "w-2"],
    );
  });

  it("coalesces concurrent syncs behind a lease as skipped_busy", async () => {
    const { db } = makeSqliteDatabase();
    const keyBytes = new Uint8Array(32).fill(0xbb);
    const environment = {
      HEVY_CREDENTIAL_ENCRYPTION_KEY: Buffer.from(keyBytes).toString("hex"),
    };
    await seedConnectedUser({ db, userId: "user-1", environment, keyBytes });

    const kysely = await run(db.kysely);
    await kysely
      .insertInto("hevy_sync_state")
      .values({
        user_id: "user-1",
        event_watermark: "2026-07-01T00:00:00.000Z",
        last_checked_at: "2026-07-01T00:00:00.000Z",
        last_success_at: "2026-06-01T00:00:00.000Z",
        last_data_change_at: null,
        lease_until: new Date(Date.now() + 60_000).toISOString(),
        last_error_code: null,
        last_error_at: null,
      })
      .execute();

    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("should not fetch", { status: 500 });
    };

    const summary = await run(syncHevy({ db, userId: "user-1", environment, force: true }));
    assert.equal(summary.mode, "skipped_busy");
    assert.equal(fetchCalls, 0);
  });

  it("does not advance watermark when a later page fails", async () => {
    const { db } = makeSqliteDatabase();
    const keyBytes = new Uint8Array(32).fill(0xcc);
    const environment = {
      HEVY_CREDENTIAL_ENCRYPTION_KEY: Buffer.from(keyBytes).toString("hex"),
    };
    await seedConnectedUser({ db, userId: "user-1", environment, keyBytes });

    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/v1/workouts?") || /\/v1\/workouts$/.test(new URL(url).pathname)) {
        const page = Number(new URL(url).searchParams.get("page") ?? "1");
        if (page === 1) {
          return Response.json({
            page: 1,
            page_count: 2,
            workouts: [workout({ id: "w-1", title: "A", updatedAt: "2026-07-01T10:00:00.000Z" })],
          });
        }
        return new Response("boom", { status: 500 });
      }
      return new Response("not found", { status: 404 });
    };

    await assert.rejects(() => run(syncHevy({ db, userId: "user-1", environment, force: true })));

    const kysely = await run(db.kysely);
    const state = await kysely
      .selectFrom("hevy_sync_state")
      .selectAll()
      .where("user_id", "=", "user-1")
      .executeTakeFirst();
    assert.equal(state?.event_watermark ?? null, null);
    assert.equal(state?.last_success_at ?? null, null);
    assert.equal(state?.last_error_code, "hevy_http");
    assert.equal(state?.lease_until, null);

    const sessions = await kysely
      .selectFrom("hevy_sessions")
      .selectAll()
      .where("user_id", "=", "user-1")
      .execute();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.provider_workout_id, "w-1");
  });

  it("records hevy_auth when the provider rejects the key", async () => {
    const { db } = makeSqliteDatabase();
    const keyBytes = new Uint8Array(32).fill(0xdd);
    const environment = {
      HEVY_CREDENTIAL_ENCRYPTION_KEY: Buffer.from(keyBytes).toString("hex"),
    };
    await seedConnectedUser({ db, userId: "user-1", environment, keyBytes });

    const kysely = await run(db.kysely);
    await kysely
      .insertInto("hevy_sync_state")
      .values({
        user_id: "user-1",
        event_watermark: "2026-07-01T00:00:00.000Z",
        last_checked_at: "2026-07-01T00:00:00.000Z",
        last_success_at: "2026-06-01T00:00:00.000Z",
        last_data_change_at: null,
        lease_until: null,
        last_error_code: null,
        last_error_at: null,
      })
      .execute();

    globalThis.fetch = async () => new Response("unauthorized", { status: 401 });

    await assert.rejects(() => run(syncHevy({ db, userId: "user-1", environment, force: true })));

    const state = await kysely
      .selectFrom("hevy_sync_state")
      .selectAll()
      .where("user_id", "=", "user-1")
      .executeTakeFirst();
    assert.equal(state?.last_error_code, "hevy_auth");
    assert.equal(state?.event_watermark, "2026-07-01T00:00:00.000Z");
    assert.equal(state?.lease_until, null);
  });
});
