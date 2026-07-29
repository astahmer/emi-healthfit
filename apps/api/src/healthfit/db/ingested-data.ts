import type { HealthfitDatabaseSchema } from "@emi/flavor-healthfit";
import {
  deleteIngestedSource as deleteIngestedSourceFlavor,
  getRawUploadRetentionDays as getRawUploadRetentionDaysFlavor,
  insertHealthWorkouts as insertHealthWorkoutsFlavor,
  updateRawUploadRetentionDays as updateRawUploadRetentionDaysFlavor,
  updateSyncCursor as updateSyncCursorFlavor,
  upsertBodyMetrics as upsertBodyMetricsFlavor,
  upsertDailyActivity as upsertDailyActivityFlavor,
  upsertHevySessions as upsertHevySessionsFlavor,
  upsertHevySets as upsertHevySetsFlavor,
  upsertSleepSessions as upsertSleepSessionsFlavor,
} from "@emi/flavor-healthfit";
import { narrowQueryDatabaseClient, type QueryDatabaseClient } from "../../platform/db/client.ts";

const toFitnessDb = (db: QueryDatabaseClient) =>
  narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db);

export const upsertDailyActivity = (
  db: QueryDatabaseClient,
  userId: string,
  rows: Parameters<typeof upsertDailyActivityFlavor>[2],
) => upsertDailyActivityFlavor(toFitnessDb(db), userId, rows);

export const insertHealthWorkouts = (
  db: QueryDatabaseClient,
  userId: string,
  rows: Parameters<typeof insertHealthWorkoutsFlavor>[2],
) => insertHealthWorkoutsFlavor(toFitnessDb(db), userId, rows);

export const upsertHevySessions = (
  db: QueryDatabaseClient,
  userId: string,
  rows: Parameters<typeof upsertHevySessionsFlavor>[2],
) => upsertHevySessionsFlavor(toFitnessDb(db), userId, rows);

export const upsertHevySets = (
  db: QueryDatabaseClient,
  userId: string,
  rows: Parameters<typeof upsertHevySetsFlavor>[2],
) => upsertHevySetsFlavor(toFitnessDb(db), userId, rows);

export const upsertSleepSessions = (
  db: QueryDatabaseClient,
  userId: string,
  rows: Parameters<typeof upsertSleepSessionsFlavor>[2],
) => upsertSleepSessionsFlavor(toFitnessDb(db), userId, rows);

export const upsertBodyMetrics = (
  db: QueryDatabaseClient,
  userId: string,
  rows: Parameters<typeof upsertBodyMetricsFlavor>[2],
) => upsertBodyMetricsFlavor(toFitnessDb(db), userId, rows);

export const updateSyncCursor = (
  db: QueryDatabaseClient,
  userId: string,
  source: string,
  lastSync: string,
) => updateSyncCursorFlavor(toFitnessDb(db), userId, source, lastSync);

export const getRawUploadRetentionDays = ({
  db,
  userId,
}: {
  db: QueryDatabaseClient;
  userId: string;
}) => getRawUploadRetentionDaysFlavor({ db: toFitnessDb(db), userId });

export const updateRawUploadRetentionDays = ({
  db,
  userId,
  days,
}: {
  db: QueryDatabaseClient;
  userId: string;
  days: number;
}) => updateRawUploadRetentionDaysFlavor({ db: toFitnessDb(db), userId, days });

export const deleteIngestedSource = ({
  db,
  userId,
  source,
}: {
  db: QueryDatabaseClient;
  userId: string;
  source: "health" | "hevy";
}) => deleteIngestedSourceFlavor({ db: toFitnessDb(db), userId, source });
