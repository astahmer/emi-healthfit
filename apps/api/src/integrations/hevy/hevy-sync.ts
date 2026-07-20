import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { QueryDatabaseClient } from "../../db/client.ts";
import {
  decryptHevyApiKey,
  encryptHevyApiKey,
  resolveHevyEncryptionKey,
} from "./credential-crypto.ts";
import { HevyHttpError, HevyNetworkError, createHevyClient } from "./hevy-client.ts";
import {
  attachProviderIdToSession,
  deleteHevyConnection,
  deleteHevyWorkoutByProviderId,
  findLegacySessionForReconciliation,
  getHevyConnection,
  getHevySyncState,
  markHevySyncFailure,
  markHevySyncSuccess,
  releaseHevySyncLease,
  replaceHevyWorkoutRows,
  tryAcquireHevySyncLease,
  upsertHevyConnection,
  writeHevyWorkoutPages,
} from "./hevy-store.ts";
import { mapHevyWorkoutToRows } from "./map-workout.ts";

export const HEVY_FRESHNESS_MS = 15 * 60 * 1000;
const SYNC_LEASE_MS = 2 * 60 * 1000;
const EVENT_OVERLAP_MS = 60 * 1000;
const WORKOUT_PAGE_SIZE = 10;

export class HevySyncBusyError extends Schema.TaggedErrorClass<HevySyncBusyError>()(
  "HevySyncBusyError",
  { message: Schema.String },
) {}

export class HevyNotConnectedError extends Schema.TaggedErrorClass<HevyNotConnectedError>()(
  "HevyNotConnectedError",
  { message: Schema.String },
) {}

export type HevySyncSummary = {
  mode: "initial" | "incremental" | "skipped_fresh" | "skipped_busy";
  imported: number;
  updated: number;
  deleted: number;
  ambiguousLegacy: number;
  startedAt: string;
  completedAt: string;
  lastErrorCode: string | null;
};

const classifyError = (error: unknown) => {
  if (error instanceof HevyHttpError) {
    if (error.status === 401 || error.status === 403) return "hevy_auth";
    if (error.status === 429) return "hevy_rate_limit";
    return "hevy_http";
  }
  if (error instanceof HevyNetworkError) return "hevy_network";
  return "hevy_sync";
};

const subtractOverlap = (iso: string) => {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso;
  return new Date(time - EVENT_OVERLAP_MS).toISOString();
};

const loadClientForUser = Effect.fn("hevy.sync.loadClient")(function* ({
  db,
  userId,
  environment,
}: {
  db: QueryDatabaseClient;
  userId: string;
  environment: Record<string, unknown>;
}) {
  const connection = yield* getHevyConnection({ db, userId });
  if (connection === undefined) {
    return yield* new HevyNotConnectedError({ message: "Hevy is not connected" });
  }
  const keyBytes = yield* resolveHevyEncryptionKey({ environment });
  const apiKey = yield* decryptHevyApiKey({
    userId,
    keyBytes,
    envelope: {
      ciphertext: connection.encrypted_api_key,
      iv: connection.encryption_iv,
      version: connection.encryption_version,
    },
  });
  return { connection, client: createHevyClient({ apiKey }) };
});

const upsertMappedWorkout = Effect.fn("hevy.sync.upsertMapped")(function* ({
  db,
  userId,
  workout,
}: {
  db: QueryDatabaseClient;
  userId: string;
  workout: Parameters<typeof mapHevyWorkoutToRows>[0];
}) {
  const mapped = mapHevyWorkoutToRows(workout);
  if (mapped === null) return { updated: false, ambiguousLegacy: 0 };

  const legacy = yield* findLegacySessionForReconciliation({
    db,
    userId,
    title: mapped.session.title,
    startTime: mapped.session.start_time,
  });

  const providerWorkoutId = mapped.session.provider_workout_id;
  if (
    legacy.kind === "match" &&
    providerWorkoutId !== null &&
    legacy.session.session_id !== mapped.session.session_id
  ) {
    yield* attachProviderIdToSession({
      db,
      userId,
      sessionId: legacy.session.session_id,
      providerWorkoutId,
      sourceUpdatedAt: mapped.session.source_updated_at,
    });
    const sets = mapped.sets.map((set) => ({
      ...set,
      session_id: legacy.session.session_id,
    }));
    yield* replaceHevyWorkoutRows({
      db,
      userId,
      session: {
        ...mapped.session,
        session_id: legacy.session.session_id,
      },
      sets,
    });
    return { updated: true, ambiguousLegacy: 0 };
  }

  yield* replaceHevyWorkoutRows({
    db,
    userId,
    session: mapped.session,
    sets: mapped.sets,
  });
  return {
    updated: true,
    ambiguousLegacy: legacy.kind === "ambiguous_or_none" && legacy.count > 1 ? legacy.count : 0,
  };
});

const runInitialSync = Effect.fn("hevy.sync.initial")(function* ({
  db,
  userId,
  client,
}: {
  db: QueryDatabaseClient;
  userId: string;
  client: ReturnType<typeof createHevyClient>;
}) {
  let page = 1;
  let pageCount = 1;
  let imported = 0;
  let ambiguousLegacy = 0;
  let newestUpdatedAt: string | null = null;

  while (page <= pageCount) {
    const response = yield* client.listWorkouts({ page, pageSize: WORKOUT_PAGE_SIZE });
    pageCount = response.page_count ?? page;
    const workouts = response.workouts ?? [];

    const sessions = [];
    const sets = [];
    for (const workout of workouts) {
      const mapped = mapHevyWorkoutToRows(workout);
      if (mapped === null) continue;
      const legacy = yield* findLegacySessionForReconciliation({
        db,
        userId,
        title: mapped.session.title,
        startTime: mapped.session.start_time,
      });
      const providerWorkoutId = mapped.session.provider_workout_id;
      if (legacy.kind === "match" && providerWorkoutId !== null) {
        yield* attachProviderIdToSession({
          db,
          userId,
          sessionId: legacy.session.session_id,
          providerWorkoutId,
          sourceUpdatedAt: mapped.session.source_updated_at,
        });
        sessions.push({
          ...mapped.session,
          session_id: legacy.session.session_id,
        });
        for (const set of mapped.sets) {
          sets.push({ ...set, session_id: legacy.session.session_id });
        }
      } else {
        if (legacy.kind === "ambiguous_or_none" && legacy.count > 1) {
          ambiguousLegacy += legacy.count;
        }
        sessions.push(mapped.session);
        sets.push(...mapped.sets);
      }
      imported += 1;
      const updatedAt = workout.updated_at ?? workout.created_at;
      if (
        updatedAt !== undefined &&
        (newestUpdatedAt === null || Date.parse(updatedAt) > Date.parse(newestUpdatedAt))
      ) {
        newestUpdatedAt = updatedAt;
      }
    }

    yield* writeHevyWorkoutPages({ db, userId, sessions, sets });
    page += 1;
  }

  return { imported, ambiguousLegacy, newestUpdatedAt };
});

const runIncrementalSync = Effect.fn("hevy.sync.incremental")(function* ({
  db,
  userId,
  client,
  watermark,
}: {
  db: QueryDatabaseClient;
  userId: string;
  client: ReturnType<typeof createHevyClient>;
  watermark: string | null;
}) {
  let page = 1;
  let pageCount = 1;
  let updated = 0;
  let deleted = 0;
  let ambiguousLegacy = 0;
  let newestEventAt = watermark;
  const since = watermark === null ? undefined : subtractOverlap(watermark);
  const seen = new Set<string>();

  while (page <= pageCount) {
    const response = yield* client.listWorkoutEvents({
      page,
      pageSize: WORKOUT_PAGE_SIZE,
      since,
    });
    pageCount = response.page_count;
    const events = [...response.events].reverse();

    for (const event of events) {
      if (event.type === "deleted") {
        const id = "id" in event ? String(event.id) : "";
        if (id === "" || seen.has(`deleted:${id}`)) continue;
        seen.add(`deleted:${id}`);
        const removed = yield* deleteHevyWorkoutByProviderId({
          db,
          userId,
          providerWorkoutId: id,
        });
        if (removed) deleted += 1;
        const deletedAt = "deleted_at" in event ? event.deleted_at : undefined;
        if (
          deletedAt !== undefined &&
          (newestEventAt === null || Date.parse(deletedAt) > Date.parse(newestEventAt))
        ) {
          newestEventAt = deletedAt;
        }
        continue;
      }

      const workout = "workout" in event ? event.workout : undefined;
      const workoutId = workout?.id;
      if (workoutId === undefined || workoutId === "") continue;
      if (seen.has(`updated:${workoutId}`)) continue;
      seen.add(`updated:${workoutId}`);

      const detail = yield* client.getWorkout({ workoutId });
      const result = yield* upsertMappedWorkout({ db, userId, workout: detail });
      if (result.updated) updated += 1;
      ambiguousLegacy += result.ambiguousLegacy;
      const updatedAt = detail.updated_at ?? detail.created_at;
      if (
        updatedAt !== undefined &&
        (newestEventAt === null || Date.parse(updatedAt) > Date.parse(newestEventAt))
      ) {
        newestEventAt = updatedAt;
      }
    }

    page += 1;
  }

  return { updated, deleted, ambiguousLegacy, newestEventAt };
});

export const connectHevy = Effect.fn("hevy.connect")(function* ({
  db,
  userId,
  apiKey,
  environment,
}: {
  db: QueryDatabaseClient;
  userId: string;
  apiKey: string;
  environment: Record<string, unknown>;
}) {
  const startedAt = new Date().toISOString();
  const client = createHevyClient({ apiKey });
  const userInfo = yield* client.validateConnection();
  const keyBytes = yield* resolveHevyEncryptionKey({ environment });
  const envelope = yield* encryptHevyApiKey({ apiKey, userId, keyBytes });
  yield* upsertHevyConnection({
    db,
    userId,
    providerUserId: userInfo.data?.id ?? null,
    envelope,
    status: "connected",
  });

  const lease = yield* tryAcquireHevySyncLease({ db, userId, leaseMs: SYNC_LEASE_MS });
  if (!lease.acquired) {
    return {
      mode: "skipped_busy" as const,
      imported: 0,
      updated: 0,
      deleted: 0,
      ambiguousLegacy: 0,
      startedAt,
      completedAt: new Date().toISOString(),
      lastErrorCode: null,
      providerUserName: userInfo.data?.name ?? null,
    };
  }

  const initial = yield* runInitialSync({ db, userId, client }).pipe(
    Effect.tapError((error) =>
      Effect.gen(function* () {
        yield* markHevySyncFailure({ db, userId, errorCode: classifyError(error) });
        yield* releaseHevySyncLease({ db, userId });
      }),
    ),
  );
  yield* markHevySyncSuccess({
    db,
    userId,
    eventWatermark: initial.newestUpdatedAt ?? startedAt,
    dataChanged: initial.imported > 0,
  });
  return {
    mode: "initial" as const,
    imported: initial.imported,
    updated: 0,
    deleted: 0,
    ambiguousLegacy: initial.ambiguousLegacy,
    startedAt,
    completedAt: new Date().toISOString(),
    lastErrorCode: null,
    providerUserName: userInfo.data?.name ?? null,
  };
});

export const syncHevy = Effect.fn("hevy.sync")(function* ({
  db,
  userId,
  environment,
  force = false,
}: {
  db: QueryDatabaseClient;
  userId: string;
  environment: Record<string, unknown>;
  force?: boolean;
}) {
  const startedAt = new Date().toISOString();
  const state = yield* getHevySyncState({ db, userId });

  if (!force && state?.last_success_at !== undefined && state.last_success_at !== null) {
    const age = Date.now() - Date.parse(state.last_success_at);
    if (Number.isFinite(age) && age < HEVY_FRESHNESS_MS) {
      return {
        mode: "skipped_fresh" as const,
        imported: 0,
        updated: 0,
        deleted: 0,
        ambiguousLegacy: 0,
        startedAt,
        completedAt: new Date().toISOString(),
        lastErrorCode: state.last_error_code,
      } satisfies HevySyncSummary;
    }
  }

  const lease = yield* tryAcquireHevySyncLease({ db, userId, leaseMs: SYNC_LEASE_MS });
  if (!lease.acquired) {
    return {
      mode: "skipped_busy" as const,
      imported: 0,
      updated: 0,
      deleted: 0,
      ambiguousLegacy: 0,
      startedAt,
      completedAt: new Date().toISOString(),
      lastErrorCode: state?.last_error_code ?? null,
    } satisfies HevySyncSummary;
  }

  const syncEffect = Effect.gen(function* () {
    const { client } = yield* loadClientForUser({ db, userId, environment });
    const watermark = state?.event_watermark ?? null;

    if (
      watermark === null &&
      (state?.last_success_at === undefined || state.last_success_at === null)
    ) {
      const initial = yield* runInitialSync({ db, userId, client });
      yield* markHevySyncSuccess({
        db,
        userId,
        eventWatermark: initial.newestUpdatedAt ?? startedAt,
        dataChanged: initial.imported > 0,
      });
      return {
        mode: "initial" as const,
        imported: initial.imported,
        updated: 0,
        deleted: 0,
        ambiguousLegacy: initial.ambiguousLegacy,
        startedAt,
        completedAt: new Date().toISOString(),
        lastErrorCode: null,
      } satisfies HevySyncSummary;
    }

    const incremental = yield* runIncrementalSync({
      db,
      userId,
      client,
      watermark,
    });
    yield* markHevySyncSuccess({
      db,
      userId,
      eventWatermark: incremental.newestEventAt ?? watermark ?? startedAt,
      dataChanged: incremental.updated + incremental.deleted > 0,
    });
    return {
      mode: "incremental" as const,
      imported: 0,
      updated: incremental.updated,
      deleted: incremental.deleted,
      ambiguousLegacy: incremental.ambiguousLegacy,
      startedAt,
      completedAt: new Date().toISOString(),
      lastErrorCode: null,
    } satisfies HevySyncSummary;
  }).pipe(
    Effect.tapError((error) =>
      Effect.gen(function* () {
        yield* markHevySyncFailure({ db, userId, errorCode: classifyError(error) });
        yield* releaseHevySyncLease({ db, userId });
      }),
    ),
  );

  return yield* syncEffect;
});

export const ensureHevyFresh = Effect.fn("hevy.ensureFresh")(function* ({
  db,
  userId,
  environment,
}: {
  db: QueryDatabaseClient;
  userId: string;
  environment: Record<string, unknown>;
}) {
  const connection = yield* getHevyConnection({ db, userId });
  if (connection === undefined) return null;

  return yield* syncHevy({ db, userId, environment, force: false }).pipe(
    Effect.catch(() => Effect.succeed(null)),
  );
});

export const disconnectHevy = Effect.fn("hevy.disconnect")(function* ({
  db,
  userId,
}: {
  db: QueryDatabaseClient;
  userId: string;
}) {
  yield* deleteHevyConnection({ db, userId });
});

export const getHevyIntegrationStatus = Effect.fn("hevy.status")(function* ({
  db,
  userId,
}: {
  db: QueryDatabaseClient;
  userId: string;
}) {
  const connection = yield* getHevyConnection({ db, userId });
  const state = yield* getHevySyncState({ db, userId });
  if (connection === undefined) {
    return {
      connected: false as const,
      status: "disconnected" as const,
      providerUserId: null,
      lastCheckedAt: state?.last_checked_at ?? null,
      lastSuccessAt: state?.last_success_at ?? null,
      lastDataChangeAt: state?.last_data_change_at ?? null,
      lastErrorCode: state?.last_error_code ?? null,
      lastErrorAt: state?.last_error_at ?? null,
      fresh: false,
    };
  }

  const lastSuccessAt = state?.last_success_at ?? null;
  const fresh =
    lastSuccessAt !== null &&
    Number.isFinite(Date.parse(lastSuccessAt)) &&
    Date.now() - Date.parse(lastSuccessAt) < HEVY_FRESHNESS_MS;

  return {
    connected: true as const,
    status: connection.status,
    providerUserId: connection.provider_user_id,
    lastCheckedAt: state?.last_checked_at ?? null,
    lastSuccessAt,
    lastDataChangeAt: state?.last_data_change_at ?? null,
    lastErrorCode: state?.last_error_code ?? null,
    lastErrorAt: state?.last_error_at ?? null,
    fresh,
  };
});
