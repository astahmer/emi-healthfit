import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { HealthFit, type HealthfitDatabaseSchema } from "@emi/flavor-healthfit";
import { narrowQueryDatabaseClient } from "../src/platform/db/client.ts";
import { makeSqliteDatabase, run } from "./sqlite.ts";
import { getDiagnosticBundle } from "../src/core/diagnostics/bundle.ts";
const {
  connect: connectHevy,
  getConnection: getHevyConnection,
  getIntegrationStatus: getHevyIntegrationStatus,
  sync: syncHevy,
} = HealthFit.hevy;
const { getIngestedDataExport, getWorkouts } = HealthFit.data;

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const SECRET_KEY = "hevy-secret-key-do-not-leak";

const assertNoSecretLeak = ({ value, secrets }: { value: unknown; secrets: string[] }) => {
  const serialized = JSON.stringify(value);
  for (const secret of secrets) {
    assert.equal(
      serialized.includes(secret),
      false,
      `response leaked secret fragment (${secret.slice(0, 8)}…)`,
    );
  }
};

const mockHevyApi = ({
  userId,
  userName,
  workouts,
}: {
  userId: string;
  userName: string;
  workouts: Array<{ id: string; title: string; updatedAt: string }>;
}) => {
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/v1/user/info")) {
      return Response.json({ data: { id: userId, name: userName } });
    }
    if (url.includes("/v1/workouts/events")) {
      return Response.json({ page: 1, page_count: 1, events: [] });
    }
    const pathname = new URL(url).pathname;
    if (url.includes("/v1/workouts?") || pathname.endsWith("/v1/workouts")) {
      return Response.json({
        page: 1,
        page_count: 1,
        workouts: workouts.map((entry) => ({
          id: entry.id,
          title: entry.title,
          start_time: entry.updatedAt,
          end_time: entry.updatedAt,
          updated_at: entry.updatedAt,
          exercises: [],
        })),
      });
    }
    return new Response("not found", { status: 404 });
  };
};

describe("Hevy secret hygiene and ownership", () => {
  it("never exposes the API key or ciphertext in connect/status/export/diagnostics", async () => {
    const { db } = makeSqliteDatabase();
    const environment = { HEVY_CREDENTIAL_ENCRYPTION_KEY: "a".repeat(64) };
    mockHevyApi({
      userId: "u1",
      userName: "Ada",
      workouts: [{ id: "w-1", title: "Push", updatedAt: "2026-07-01T10:00:00.000Z" }],
    });

    const connected = await run(
      connectHevy({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
        apiKey: SECRET_KEY,
        environment,
      }),
    );
    const status = await run(
      getHevyIntegrationStatus({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
      }),
    );
    const exported = await run(
      getIngestedDataExport({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
      }),
    );
    const diagnostics = await run(
      getDiagnosticBundle({
        db,
        userId: "user-1",
        conversationId: "missing",
      }),
    );

    const connection = await run(
      getHevyConnection({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "user-1",
      }),
    );
    assert.ok(connection);
    assert.notEqual(connection.encrypted_api_key, SECRET_KEY);
    assert.equal(connection.encrypted_api_key.includes(SECRET_KEY), false);

    const secrets = [SECRET_KEY, connection.encrypted_api_key, connection.encryption_iv];
    assertNoSecretLeak({ value: connected, secrets });
    assertNoSecretLeak({ value: status, secrets });
    assertNoSecretLeak({ value: exported, secrets });
    assertNoSecretLeak({ value: diagnostics, secrets });
    assert.equal("apiKey" in (connected as object), false);
    assert.equal("encrypted_api_key" in (status as object), false);
  });

  it("keeps connection, cursor, and workouts isolated per user", async () => {
    const { db } = makeSqliteDatabase();
    const environment = { HEVY_CREDENTIAL_ENCRYPTION_KEY: "b".repeat(64) };

    mockHevyApi({
      userId: "alice-hevy",
      userName: "Alice",
      workouts: [{ id: "w-alice", title: "Alice Push", updatedAt: "2026-07-01T10:00:00.000Z" }],
    });
    await run(
      connectHevy({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "alice",
        apiKey: "alice-key",
        environment,
      }),
    );

    mockHevyApi({
      userId: "bob-hevy",
      userName: "Bob",
      workouts: [{ id: "w-bob", title: "Bob Pull", updatedAt: "2026-07-02T10:00:00.000Z" }],
    });
    await run(
      connectHevy({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "bob",
        apiKey: "bob-key",
        environment,
      }),
    );

    const aliceStatus = await run(
      getHevyIntegrationStatus({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "alice",
      }),
    );
    const bobStatus = await run(
      getHevyIntegrationStatus({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "bob",
      }),
    );
    assert.equal(aliceStatus.providerUserId, "alice-hevy");
    assert.equal(bobStatus.providerUserId, "bob-hevy");

    const aliceWorkouts = await run(
      getWorkouts(narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db), "alice"),
    );
    const bobWorkouts = await run(
      getWorkouts(narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db), "bob"),
    );
    assert.deepEqual(
      aliceWorkouts.map((workout) => workout.title),
      ["Alice Push"],
    );
    assert.deepEqual(
      bobWorkouts.map((workout) => workout.title),
      ["Bob Pull"],
    );

    const aliceConnection = await run(
      getHevyConnection({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "alice",
      }),
    );
    const bobConnection = await run(
      getHevyConnection({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "bob",
      }),
    );
    assert.ok(aliceConnection);
    assert.ok(bobConnection);
    assert.notEqual(aliceConnection.encrypted_api_key, bobConnection.encrypted_api_key);

    const kysely = await run(db.kysely);
    const bobReadingAlice = await kysely
      .selectFrom("hevy_sessions")
      .selectAll()
      .where("user_id", "=", "bob")
      .where("provider_workout_id", "=", "w-alice")
      .execute();
    assert.equal(bobReadingAlice.length, 0);

    mockHevyApi({
      userId: "alice-hevy",
      userName: "Alice",
      workouts: [],
    });
    const aliceSync = await run(
      syncHevy({
        db: narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db),
        userId: "alice",
        environment,
        force: true,
      }),
    );
    assert.ok(aliceSync.mode === "incremental" || aliceSync.mode === "skipped_fresh");
    const bobAfterAliceSync = await run(
      getWorkouts(narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db), "bob"),
    );
    assert.equal(bobAfterAliceSync.length, 1);
    assert.equal(bobAfterAliceSync[0]?.title, "Bob Pull");
  });
});
