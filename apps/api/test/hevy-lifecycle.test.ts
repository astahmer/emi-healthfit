import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Effect } from "effect";
import { HealthFit, type HealthfitDatabaseSchema } from "@emi/flavor-healthfit";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";

const {
  connect: connectHevy,
  disconnect: disconnectHevy,
  encryptApiKey: encryptHevyApiKey,
  ensureFresh: ensureHevyFresh,
  getConnection: getHevyConnection,
  getIntegrationStatus: getHevyIntegrationStatus,
  getSyncState: getHevySyncState,
  requireFresh: requireHevyFresh,
  sync: syncHevy,
  upsertConnection: upsertHevyConnection,
} = HealthFit.hevy;
const { deleteIngestedSource } = HealthFit.ingest;
const { getWorkouts } = HealthFit.data;

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const seedConnectedUser = async ({
  db,
  userId,
  keyBytes,
}: {
  db: ReturnType<typeof makeSqliteDatabase>["db"];
  userId: string;
  keyBytes: Uint8Array;
}) => {
  const envelope = await Effect.runPromise(
    encryptHevyApiKey({ apiKey: "hevy-test-key", userId, keyBytes }),
  );
  await run(
    upsertHevyConnection({
      db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
      userId,
      providerUserId: "u1",
      envelope,
      status: "connected",
    }),
  );
};

describe("Hevy lifecycle", () => {
  it("disconnect removes credential but keeps workout history", async () => {
    const { db } = makeSqliteDatabase();
    const environment = { HEVY_CREDENTIAL_ENCRYPTION_KEY: "c".repeat(64) };

    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/v1/user/info")) {
        return Response.json({ data: { id: "u1", name: "Ada" } });
      }
      if (url.includes("/v1/workouts/events")) {
        return Response.json({ page: 1, page_count: 1, events: [] });
      }
      const pathname = new URL(url).pathname;
      if (url.includes("/v1/workouts?") || pathname.endsWith("/v1/workouts")) {
        return Response.json({
          page: 1,
          page_count: 1,
          workouts: [
            {
              id: "w-1",
              title: "Keep Me",
              start_time: "2026-07-01T10:00:00.000Z",
              end_time: "2026-07-01T11:00:00.000Z",
              updated_at: "2026-07-01T11:00:00.000Z",
              exercises: [],
            },
          ],
        });
      }
      return new Response("not found", { status: 404 });
    };

    await run(
      connectHevy({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
        apiKey: "hevy-test-key",
        environment,
      }),
    );
    assert.equal(
      (await run(getWorkouts(narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db), "user-1")))
        .length,
      1,
    );

    await run(
      disconnectHevy({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
      }),
    );
    assert.equal(
      await run(
        getHevyConnection({
          db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
          userId: "user-1",
        }),
      ),
      undefined,
    );
    const status = await run(
      getHevyIntegrationStatus({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
      }),
    );
    assert.equal(status.connected, false);
    assert.equal(
      (await run(getWorkouts(narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db), "user-1")))
        .length,
      1,
    );
  });

  it("remove-data deletes sessions, sets, connection, and sync state", async () => {
    const { db } = makeSqliteDatabase();
    const environment = { HEVY_CREDENTIAL_ENCRYPTION_KEY: "d".repeat(64) };

    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/v1/user/info")) {
        return Response.json({ data: { id: "u1", name: "Ada" } });
      }
      if (url.includes("/v1/workouts/events")) {
        return Response.json({ page: 1, page_count: 1, events: [] });
      }
      const pathname = new URL(url).pathname;
      if (url.includes("/v1/workouts?") || pathname.endsWith("/v1/workouts")) {
        return Response.json({
          page: 1,
          page_count: 1,
          workouts: [
            {
              id: "w-1",
              title: "Wipe Me",
              start_time: "2026-07-01T10:00:00.000Z",
              updated_at: "2026-07-01T11:00:00.000Z",
              exercises: [
                {
                  index: 0,
                  title: "Bench",
                  sets: [{ index: 1, weight_kg: 60, reps: 5 }],
                },
              ],
            },
          ],
        });
      }
      return new Response("not found", { status: 404 });
    };

    await run(
      connectHevy({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
        apiKey: "hevy-test-key",
        environment,
      }),
    );

    await run(
      deleteIngestedSource({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
        source: "hevy",
      }),
    );

    const kysely = await run(db.kysely);
    assert.equal(
      (
        await kysely
          .selectFrom("hevy_sessions")
          .selectAll()
          .where("user_id", "=", "user-1")
          .execute()
      ).length,
      0,
    );
    assert.equal(
      (await kysely.selectFrom("hevy_sets").selectAll().where("user_id", "=", "user-1").execute())
        .length,
      0,
    );
    assert.equal(
      await run(
        getHevyConnection({
          db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
          userId: "user-1",
        }),
      ),
      undefined,
    );
    assert.equal(
      await run(
        getHevySyncState({
          db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
          userId: "user-1",
        }),
      ),
      undefined,
    );
  });

  it("zero-event incremental updates checked timestamps without changing workout rows", async () => {
    const { db } = makeSqliteDatabase();
    const keyBytes = new Uint8Array(32).fill(0xee);
    const environment = {
      HEVY_CREDENTIAL_ENCRYPTION_KEY: Buffer.from(keyBytes).toString("hex"),
    };
    await seedConnectedUser({ db, userId: "user-1", keyBytes });

    const kysely = await run(db.kysely);
    await kysely
      .insertInto("hevy_sync_state")
      .values({
        user_id: "user-1",
        event_watermark: "2026-07-01T00:00:00.000Z",
        last_checked_at: "2026-07-01T00:00:00.000Z",
        last_success_at: "2026-06-01T00:00:00.000Z",
        last_data_change_at: "2026-07-01T00:00:00.000Z",
        lease_until: null,
        last_error_code: null,
        last_error_at: null,
      })
      .execute();
    await kysely
      .insertInto("hevy_sessions")
      .values({
        user_id: "user-1",
        session_id: "hevy:w-1",
        provider_workout_id: "w-1",
        source_updated_at: "2026-07-01T00:00:00.000Z",
        title: "Existing",
        start_time: "2026-07-01T10:00:00",
        end_time: null,
        duration_sec: null,
        total_volume_kg: null,
      })
      .execute();

    let detailFetches = 0;
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/v1/workouts/events")) {
        return Response.json({ page: 1, page_count: 1, events: [] });
      }
      if (url.includes("/v1/workouts/")) {
        detailFetches += 1;
      }
      return new Response("not found", { status: 404 });
    };

    const before = await kysely
      .selectFrom("hevy_sessions")
      .selectAll()
      .where("user_id", "=", "user-1")
      .execute();
    const summary = await run(
      syncHevy({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
        environment,
        force: true,
      }),
    );
    assert.equal(summary.mode, "incremental");
    assert.equal(summary.updated, 0);
    assert.equal(summary.deleted, 0);
    assert.equal(detailFetches, 0);

    const after = await kysely
      .selectFrom("hevy_sessions")
      .selectAll()
      .where("user_id", "=", "user-1")
      .execute();
    assert.deepEqual(after, before);

    const state = await run(
      getHevySyncState({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
      }),
    );
    assert.ok(state);
    assert.equal(state.event_watermark, "2026-07-01T00:00:00.000Z");
    assert.ok(state.last_checked_at !== null);
    assert.ok(Date.parse(state.last_checked_at ?? "") > Date.parse("2026-07-01T00:00:00.000Z"));
    assert.equal(state.last_data_change_at, "2026-07-01T00:00:00.000Z");
  });

  it("ensureHevyFresh keeps last D1 workouts when Hevy is unavailable", async () => {
    const { db } = makeSqliteDatabase();
    const keyBytes = new Uint8Array(32).fill(0xff);
    const environment = {
      HEVY_CREDENTIAL_ENCRYPTION_KEY: Buffer.from(keyBytes).toString("hex"),
    };
    await seedConnectedUser({ db, userId: "user-1", keyBytes });

    const kysely = await run(db.kysely);
    await kysely
      .insertInto("hevy_sync_state")
      .values({
        user_id: "user-1",
        event_watermark: "2026-07-01T00:00:00.000Z",
        last_checked_at: "2026-07-01T00:00:00.000Z",
        last_success_at: "2026-06-01T00:00:00.000Z",
        last_data_change_at: "2026-07-01T00:00:00.000Z",
        lease_until: null,
        last_error_code: null,
        last_error_at: null,
      })
      .execute();
    await kysely
      .insertInto("hevy_sessions")
      .values({
        user_id: "user-1",
        session_id: "hevy:w-cached",
        provider_workout_id: "w-cached",
        source_updated_at: "2026-07-01T00:00:00.000Z",
        title: "Cached",
        start_time: "2026-07-01T10:00:00",
        end_time: null,
        duration_sec: null,
        total_volume_kg: 100,
      })
      .execute();

    globalThis.fetch = async () => new Response("down", { status: 503 });

    const result = await run(
      ensureHevyFresh({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
        environment,
      }),
    );
    assert.equal(result, null);

    const workouts = await run(
      getWorkouts(narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db), "user-1"),
    );
    assert.equal(workouts.length, 1);
    assert.equal(workouts[0]?.title, "Cached");
  });

  it("requireHevyFresh fails instead of allowing stale D1 workouts", async () => {
    const { db } = makeSqliteDatabase();
    const keyBytes = new Uint8Array(32).fill(0xaa);
    const environment = {
      HEVY_CREDENTIAL_ENCRYPTION_KEY: Buffer.from(keyBytes).toString("hex"),
    };
    await seedConnectedUser({ db, userId: "user-1", keyBytes });

    globalThis.fetch = async () => new Response("down", { status: 503 });

    await assert.rejects(
      () =>
        run(
          requireHevyFresh({
            db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
            userId: "user-1",
            environment,
          }),
        ),
      /status 503/,
    );
  });

  it("requireHevyFresh checks Hevy even when the cache timestamp is recent", async () => {
    const { db } = makeSqliteDatabase();
    const keyBytes = new Uint8Array(32).fill(0xab);
    const environment = {
      HEVY_CREDENTIAL_ENCRYPTION_KEY: Buffer.from(keyBytes).toString("hex"),
    };
    await seedConnectedUser({ db, userId: "user-1", keyBytes });

    const kysely = await run(db.kysely);
    const now = new Date().toISOString();
    await kysely
      .insertInto("hevy_sync_state")
      .values({
        user_id: "user-1",
        event_watermark: "2026-07-01T00:00:00.000Z",
        last_checked_at: now,
        last_success_at: now,
        last_data_change_at: now,
        lease_until: null,
        last_error_code: null,
        last_error_at: null,
      })
      .execute();

    let eventCalls = 0;
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/v1/workouts/events")) {
        eventCalls += 1;
        return Response.json({ page: 1, page_count: 1, events: [] });
      }
      return new Response("not found", { status: 404 });
    };

    const result = await run(
      requireHevyFresh({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
        environment,
      }),
    );
    assert.equal(result?.mode, "incremental");
    assert.equal(eventCalls, 1);
  });
});
