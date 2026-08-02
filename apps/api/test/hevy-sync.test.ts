import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Effect } from "effect";
import { makeSqliteDatabase, run } from "./sqlite.ts";
import { HealthFit, type HealthfitDatabaseSchema } from "@emi/flavor-healthfit";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";

const {
  connect: connectHevy,
  encryptApiKey: encryptHevyApiKey,
  getIntegrationStatus: getHevyIntegrationStatus,
  mapWorkoutToRows: mapHevyWorkoutToRows,
  sync: syncHevy,
  upsertConnection: upsertHevyConnection,
} = HealthFit.hevy;

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("mapHevyWorkoutToRows", () => {
  it("maps provider workout id and distance meters", () => {
    const mapped = mapHevyWorkoutToRows({
      id: "w-1",
      title: "Push",
      start_time: "2026-07-01T10:00:00Z",
      end_time: "2026-07-01T11:00:00Z",
      updated_at: "2026-07-01T11:00:00Z",
      exercises: [
        {
          index: 0,
          title: "Bench",
          exercise_template_id: "ex-1",
          sets: [{ index: 1, weight_kg: 60, reps: 8, distance_meters: 1500 }],
        },
      ],
    });
    assert.ok(mapped);
    assert.equal(mapped.session.session_id, "hevy:w-1");
    assert.equal(mapped.session.provider_workout_id, "w-1");
    assert.equal(mapped.sets[0]?.distance_km, 1.5);
    assert.equal(mapped.sets[0]?.exercise_index, 0);
  });
});

describe("Hevy sync service", () => {
  it("connects, imports workouts, and skips fresh sync", async () => {
    const { db } = makeSqliteDatabase();
    const environment = { HEVY_CREDENTIAL_ENCRYPTION_KEY: "a".repeat(64) };
    let workoutListCalls = 0;

    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/v1/user/info")) {
        return Response.json({ data: { id: "u1", name: "Ada" } });
      }
      if (url.includes("/v1/workouts/events")) {
        return Response.json({ page: 1, page_count: 1, events: [] });
      }
      if (url.includes("/v1/workouts?") || new URL(url).pathname.endsWith("/v1/workouts")) {
        workoutListCalls += 1;
        return Response.json({
          page: 1,
          page_count: 1,
          workouts: [
            {
              id: "w-1",
              title: "Push",
              start_time: "2026-07-01T10:00:00.000Z",
              end_time: "2026-07-01T11:00:00.000Z",
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

    const connected = await run(
      connectHevy({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
        apiKey: "hevy-test-key",
        environment,
      }),
    );
    assert.equal(connected.mode, "initial");
    assert.equal(connected.imported, 1);
    assert.equal(connected.providerUserName, "Ada");
    assert.equal(workoutListCalls, 1);

    const status = await run(
      getHevyIntegrationStatus({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
      }),
    );
    assert.equal(status.connected, true);
    assert.equal(status.fresh, true);

    const skipped = await run(
      syncHevy({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
        environment,
        force: false,
      }),
    );
    assert.equal(skipped.mode, "skipped_fresh");
    assert.equal(workoutListCalls, 1);
  });

  it("applies incremental update and delete events", async () => {
    const { db } = makeSqliteDatabase();
    const keyBytes = new Uint8Array(32).fill(0xaa);
    const environment = {
      HEVY_CREDENTIAL_ENCRYPTION_KEY: Buffer.from(keyBytes).toString("hex"),
    };

    const envelope = await Effect.runPromise(
      encryptHevyApiKey({ apiKey: "hevy-test-key", userId: "user-1", keyBytes }),
    );
    await run(
      upsertHevyConnection({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
        providerUserId: "u1",
        envelope,
        status: "connected",
      }),
    );

    const kysely = await run(db.kysely);
    await kysely
      .insertInto("hevy_sync_state")
      .values({
        user_id: "user-1",
        event_watermark: "2026-07-01T00:00:00.000Z",
        last_checked_at: "2026-07-01T00:00:00.000Z",
        last_success_at: "2026-07-01T00:00:00.000Z",
        last_data_change_at: null,
        lease_until: null,
        last_error_code: null,
        last_error_at: null,
      })
      .execute();
    await kysely
      .insertInto("hevy_sessions")
      .values({
        user_id: "user-1",
        session_id: "hevy:w-gone",
        provider_workout_id: "w-gone",
        source_updated_at: null,
        title: "Gone",
        start_time: "2026-06-01T10:00:00",
        end_time: null,
        duration_sec: null,
        total_volume_kg: null,
      })
      .execute();

    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/v1/workouts/events")) {
        return Response.json({
          page: 1,
          page_count: 1,
          events: [
            {
              type: "updated",
              workout: {
                id: "w-2",
                title: "Pull",
                start_time: "2026-07-02T10:00:00.000Z",
                updated_at: "2026-07-02T12:00:00.000Z",
                exercises: [],
              },
            },
            { type: "deleted", id: "w-gone", deleted_at: "2026-07-02T13:00:00.000Z" },
          ],
        });
      }
      if (url.includes("/v1/workouts/w-2")) {
        return Response.json({
          id: "w-2",
          title: "Pull",
          start_time: "2026-07-02T10:00:00.000Z",
          updated_at: "2026-07-02T12:00:00.000Z",
          exercises: [
            {
              index: 0,
              title: "Row",
              sets: [{ index: 1, weight_kg: 40, reps: 10 }],
            },
          ],
        });
      }
      return new Response("not found", { status: 404 });
    };

    const summary = await run(
      syncHevy({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
        environment,
        force: true,
      }),
    );
    assert.equal(summary.mode, "incremental");
    assert.equal(summary.updated, 1);
    assert.equal(summary.deleted, 1);

    const remaining = await kysely
      .selectFrom("hevy_sessions")
      .selectAll()
      .where("user_id", "=", "user-1")
      .execute();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]?.provider_workout_id, "w-2");
  });
});
