import type { Compilable } from "kysely";
import * as Effect from "effect/Effect";
import { runTransaction, type QueryDatabaseClient } from "@emi/core/server/legacy";
import type { HevySessionRow, HevySetRow, HealthfitDatabaseSchema } from "../../db/schema.ts";
import { upsertHevySessions, upsertHevySets } from "../../db/ingested-data.ts";
import type { HevyCredentialEnvelope } from "./credential-crypto.ts";

type HevyDb = QueryDatabaseClient<HealthfitDatabaseSchema>;

const nowIso = () => new Date().toISOString();

export type HevyConnectionRow = {
  user_id: string;
  provider_user_id: string | null;
  encrypted_api_key: string;
  encryption_iv: string;
  encryption_version: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type HevySyncStateRow = {
  user_id: string;
  event_watermark: string | null;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_data_change_at: string | null;
  lease_until: string | null;
  last_error_code: string | null;
  last_error_at: string | null;
};

export const getHevyConnection = Effect.fn("hevy.store.getConnection")(function* ({
  db,
  userId,
}: {
  db: HevyDb;
  userId: string;
}) {
  const kysely = yield* db.kysely;
  return yield* Effect.promise(() =>
    kysely
      .selectFrom("hevy_connections")
      .selectAll()
      .where("user_id", "=", userId)
      .executeTakeFirst(),
  );
});

export const getHevySyncState = Effect.fn("hevy.store.getSyncState")(function* ({
  db,
  userId,
}: {
  db: HevyDb;
  userId: string;
}) {
  const kysely = yield* db.kysely;
  return yield* Effect.promise(() =>
    kysely
      .selectFrom("hevy_sync_state")
      .selectAll()
      .where("user_id", "=", userId)
      .executeTakeFirst(),
  );
});

export const upsertHevyConnection = Effect.fn("hevy.store.upsertConnection")(function* ({
  db,
  userId,
  providerUserId,
  envelope,
  status,
}: {
  db: HevyDb;
  userId: string;
  providerUserId: string | null;
  envelope: HevyCredentialEnvelope;
  status: string;
}) {
  const kysely = yield* db.kysely;
  const timestamp = nowIso();
  yield* Effect.promise(() =>
    kysely
      .insertInto("hevy_connections")
      .values({
        user_id: userId,
        provider_user_id: providerUserId,
        encrypted_api_key: envelope.ciphertext,
        encryption_iv: envelope.iv,
        encryption_version: envelope.version,
        status,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .onConflict((conflict) =>
        conflict.column("user_id").doUpdateSet({
          provider_user_id: providerUserId,
          encrypted_api_key: envelope.ciphertext,
          encryption_iv: envelope.iv,
          encryption_version: envelope.version,
          status,
          updated_at: timestamp,
        }),
      )
      .execute(),
  );
});

export const deleteHevyConnection = Effect.fn("hevy.store.deleteConnection")(function* ({
  db,
  userId,
}: {
  db: HevyDb;
  userId: string;
}) {
  const kysely = yield* db.kysely;
  yield* runTransaction(db, [
    kysely.deleteFrom("hevy_connections").where("user_id", "=", userId),
    kysely.deleteFrom("hevy_sync_state").where("user_id", "=", userId),
  ]);
});

export const tryAcquireHevySyncLease = Effect.fn("hevy.store.tryAcquireLease")(function* ({
  db,
  userId,
  leaseMs,
}: {
  db: HevyDb;
  userId: string;
  leaseMs: number;
}) {
  const kysely = yield* db.kysely;
  const now = Date.now();
  const existing = yield* Effect.promise(() =>
    kysely
      .selectFrom("hevy_sync_state")
      .selectAll()
      .where("user_id", "=", userId)
      .executeTakeFirst(),
  );

  const leaseUntilMs =
    existing?.lease_until !== undefined && existing.lease_until !== null
      ? Date.parse(existing.lease_until)
      : Number.NaN;
  if (Number.isFinite(leaseUntilMs) && leaseUntilMs > now) {
    return { acquired: false as const, state: existing };
  }

  const leaseUntil = new Date(now + leaseMs).toISOString();
  yield* Effect.promise(() =>
    kysely
      .insertInto("hevy_sync_state")
      .values({
        user_id: userId,
        event_watermark: existing?.event_watermark ?? null,
        last_checked_at: existing?.last_checked_at ?? null,
        last_success_at: existing?.last_success_at ?? null,
        last_data_change_at: existing?.last_data_change_at ?? null,
        lease_until: leaseUntil,
        last_error_code: existing?.last_error_code ?? null,
        last_error_at: existing?.last_error_at ?? null,
      })
      .onConflict((conflict) =>
        conflict.column("user_id").doUpdateSet({
          lease_until: leaseUntil,
        }),
      )
      .execute(),
  );

  return { acquired: true as const, leaseUntil };
});

export const releaseHevySyncLease = Effect.fn("hevy.store.releaseLease")(function* ({
  db,
  userId,
}: {
  db: HevyDb;
  userId: string;
}) {
  const kysely = yield* db.kysely;
  yield* Effect.promise(() =>
    kysely
      .updateTable("hevy_sync_state")
      .set({ lease_until: null })
      .where("user_id", "=", userId)
      .execute(),
  );
});

export const markHevySyncSuccess = Effect.fn("hevy.store.markSuccess")(function* ({
  db,
  userId,
  eventWatermark,
  dataChanged,
}: {
  db: HevyDb;
  userId: string;
  eventWatermark: string | null;
  dataChanged: boolean;
}) {
  const kysely = yield* db.kysely;
  const timestamp = nowIso();
  yield* Effect.promise(() =>
    kysely
      .insertInto("hevy_sync_state")
      .values({
        user_id: userId,
        event_watermark: eventWatermark,
        last_checked_at: timestamp,
        last_success_at: timestamp,
        last_data_change_at: dataChanged ? timestamp : null,
        lease_until: null,
        last_error_code: null,
        last_error_at: null,
      })
      .onConflict((conflict) =>
        conflict.column("user_id").doUpdateSet((expressionBuilder) => ({
          event_watermark: eventWatermark,
          last_checked_at: timestamp,
          last_success_at: timestamp,
          last_data_change_at: dataChanged
            ? timestamp
            : expressionBuilder.ref("hevy_sync_state.last_data_change_at"),
          lease_until: null,
          last_error_code: null,
          last_error_at: null,
        })),
      )
      .execute(),
  );

  yield* Effect.promise(() =>
    kysely
      .insertInto("sync_cursors")
      .values({ user_id: userId, source: "hevy", last_sync: timestamp })
      .onConflict((conflict) =>
        conflict.columns(["user_id", "source"]).doUpdateSet({ last_sync: timestamp }),
      )
      .execute(),
  );
});

export const markHevySyncFailure = Effect.fn("hevy.store.markFailure")(function* ({
  db,
  userId,
  errorCode,
}: {
  db: HevyDb;
  userId: string;
  errorCode: string;
}) {
  const kysely = yield* db.kysely;
  const timestamp = nowIso();
  yield* Effect.promise(() =>
    kysely
      .insertInto("hevy_sync_state")
      .values({
        user_id: userId,
        event_watermark: null,
        last_checked_at: timestamp,
        last_success_at: null,
        last_data_change_at: null,
        lease_until: null,
        last_error_code: errorCode,
        last_error_at: timestamp,
      })
      .onConflict((conflict) =>
        conflict.column("user_id").doUpdateSet({
          last_checked_at: timestamp,
          lease_until: null,
          last_error_code: errorCode,
          last_error_at: timestamp,
        }),
      )
      .execute(),
  );
});

export const replaceHevyWorkoutRows = Effect.fn("hevy.store.replaceWorkout")(function* ({
  db,
  userId,
  session,
  sets,
}: {
  db: HevyDb;
  userId: string;
  session: HevySessionRow;
  sets: ReadonlyArray<HevySetRow>;
}) {
  const kysely = yield* db.kysely;
  const statements: Array<Compilable<unknown>> = [
    kysely
      .deleteFrom("hevy_sets")
      .where("user_id", "=", userId)
      .where("session_id", "=", session.session_id),
  ];
  yield* runTransaction(db, statements);
  yield* upsertHevySessions(db, userId, [session]);
  yield* upsertHevySets(db, userId, sets);
});

export const deleteHevyWorkoutByProviderId = Effect.fn("hevy.store.deleteWorkout")(function* ({
  db,
  userId,
  providerWorkoutId,
}: {
  db: HevyDb;
  userId: string;
  providerWorkoutId: string;
}) {
  const kysely = yield* db.kysely;
  const session = yield* Effect.promise(() =>
    kysely
      .selectFrom("hevy_sessions")
      .select(["session_id"])
      .where("user_id", "=", userId)
      .where("provider_workout_id", "=", providerWorkoutId)
      .executeTakeFirst(),
  );
  if (session === undefined) return false;

  yield* runTransaction(db, [
    kysely
      .deleteFrom("hevy_sets")
      .where("user_id", "=", userId)
      .where("session_id", "=", session.session_id),
    kysely
      .deleteFrom("hevy_sessions")
      .where("user_id", "=", userId)
      .where("session_id", "=", session.session_id),
  ]);
  return true;
});

export const findLegacySessionForReconciliation = Effect.fn("hevy.store.findLegacy")(function* ({
  db,
  userId,
  title,
  startTime,
}: {
  db: HevyDb;
  userId: string;
  title: string | null;
  startTime: string;
}) {
  const kysely = yield* db.kysely;
  let query = kysely
    .selectFrom("hevy_sessions")
    .selectAll()
    .where("user_id", "=", userId)
    .where("provider_workout_id", "is", null)
    .where("start_time", "=", startTime);
  query = title === null ? query.where("title", "is", null) : query.where("title", "=", title);
  const matches = yield* Effect.promise(() => query.execute());
  if (matches.length !== 1) {
    return { kind: "ambiguous_or_none" as const, count: matches.length };
  }
  return { kind: "match" as const, session: matches[0]! };
});

export const attachProviderIdToSession = Effect.fn("hevy.store.attachProviderId")(function* ({
  db,
  userId,
  sessionId,
  providerWorkoutId,
  sourceUpdatedAt,
}: {
  db: HevyDb;
  userId: string;
  sessionId: string;
  providerWorkoutId: string;
  sourceUpdatedAt: string | null;
}) {
  const kysely = yield* db.kysely;
  yield* Effect.promise(() =>
    kysely
      .updateTable("hevy_sessions")
      .set({
        provider_workout_id: providerWorkoutId,
        source_updated_at: sourceUpdatedAt,
      })
      .where("user_id", "=", userId)
      .where("session_id", "=", sessionId)
      .execute(),
  );
});

export const writeHevyWorkoutPages = Effect.fn("hevy.store.writePages")(function* ({
  db,
  userId,
  sessions,
  sets,
}: {
  db: HevyDb;
  userId: string;
  sessions: ReadonlyArray<HevySessionRow>;
  sets: ReadonlyArray<HevySetRow>;
}) {
  if (sessions.length > 0) {
    yield* upsertHevySessions(db, userId, sessions);
  }
  if (sets.length > 0) {
    yield* upsertHevySets(db, userId, [...sets]);
  }
  return { sessions: sessions.length, sets: sets.length };
});
