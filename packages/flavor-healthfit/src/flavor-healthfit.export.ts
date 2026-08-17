import { healthFitAppDefinition } from "./app-definition.ts";
import { healthFitExtension } from "./core-extension.ts";
import { buildChatContext, renderContextPrompt, renderSystemContext } from "./chat/context.ts";
import type { ChatContext } from "./chat/context.ts";
import { estimateRecovery } from "./chat/recovery-estimate.ts";
import { fitnessCoachV1 } from "./chat/prompts/fitness-coach-v1.ts";
import {
  classifySessionFocus,
  getAnalyticsOverview,
  getDataSummary,
  getExerciseProgress,
  getGoalProgress,
  getIngestedDataExport,
  getIngestedDataExportSummary,
  getNextWorkout,
  getRecoveryTimeline,
  getSleepTrend,
  getTrainingLoad,
  getWorkoutDetails,
  getWorkoutHistory,
  getWorkoutStreak,
  getWorkouts,
  resolveSessionTemplate,
} from "./db/fitness.ts";
import type {
  DataSummary,
  ExerciseProgressSet,
  WorkoutHistoryItem,
  WorkoutSession,
  WorkoutSet,
} from "./db/fitness.ts";
import {
  bodyMetrics,
  dailyActivity,
  healthWorkouts,
  hevyConnections,
  hevySessions,
  hevySets,
  hevySyncState,
  privacyPreferences,
  sleepSessions,
  syncCursors,
} from "./db/schema.ts";
import type {
  BodyMetricRow,
  DailyActivityRow,
  HealthfitDatabaseSchema,
  HealthWorkoutRow,
  HevySessionRow,
  HevySetRow,
  SleepSessionRow,
} from "./db/schema.ts";
import {
  deleteIngestedSource,
  getRawUploadRetentionDays,
  insertHealthWorkouts,
  updateRawUploadRetentionDays,
  updateSyncCursor,
  upsertBodyMetrics,
  upsertDailyActivity,
  upsertHevySessions,
  upsertHevySets,
  upsertSleepSessions,
} from "./db/ingested-data.ts";
import {
  importIngestedData,
  ingestedDataExportSchema,
  previewIngestedDataImport,
} from "./ingest/data-transfer.ts";
import type { IngestedDataExport } from "./ingest/data-transfer.ts";
import { assignYears, parseHealthExport } from "./ingest/health.ts";
import { parseHevyCsv, parseHevyDate } from "./ingest/hevy.ts";
import {
  decryptHevyApiKey,
  encryptHevyApiKey,
  resolveHevyEncryptionKey,
  HevyCredentialConfigError,
  HevyCredentialCryptoError,
} from "./integrations/hevy/credential-crypto.ts";
import type { HevyCredentialEnvelope } from "./integrations/hevy/credential-crypto.ts";
import {
  createHevyClient,
  HEVY_API_BASE_URL,
  HevyHttpError,
  HevyNetworkError,
} from "./integrations/hevy/hevy-client.ts";
import type {
  HevyClient,
  HevyClientError,
  HevyPaginatedWorkoutEvents,
  HevyUserInfoResponse,
  HevyWorkout,
} from "./integrations/hevy/hevy-client.ts";
import {
  attachProviderIdToSession,
  deleteHevyConnection,
  deleteHevyWorkoutByProviderId,
  findUnlinkedSessionForReconciliation,
  getHevyConnection,
  getHevySyncState,
  markHevySyncFailure,
  markHevySyncSuccess,
  releaseHevySyncLease,
  replaceHevyWorkoutRows,
  tryAcquireHevySyncLease,
  upsertHevyConnection,
  writeHevyWorkoutPages,
} from "./integrations/hevy/hevy-store.ts";
import type { HevyConnectionRow, HevySyncStateRow } from "./integrations/hevy/hevy-store.ts";
import {
  connectHevy,
  disconnectHevy,
  ensureHevyFresh,
  requireHevyFresh,
  getHevyIntegrationStatus,
  isExpectedHevyFreshFailure,
  syncHevy,
  HEVY_FRESHNESS_MS,
  HevyNotConnectedError,
  HevySyncBusyError,
} from "./integrations/hevy/hevy-sync.ts";
import type { HevySyncSummary } from "./integrations/hevy/hevy-sync.ts";
import {
  hevySessionIdForProviderWorkout,
  mapHevyWorkoutToRows,
} from "./integrations/hevy/map-workout.ts";
import { executeTool, tools } from "./tools/api.ts";
import type { HealthfitToolsDatabaseSchema, ToolDefinition } from "./tools/api.ts";

export class HealthFit {
  static readonly app = {
    definition: healthFitAppDefinition,
    extension: healthFitExtension,
  } as const;

  static readonly chat = {
    buildContext: buildChatContext,
    estimateRecovery,
    fitnessCoachV1,
    renderContextPrompt,
    renderSystemContext,
  } as const;

  static readonly data = {
    classifySessionFocus,
    getAnalyticsOverview,
    getDataSummary,
    getExerciseProgress,
    getGoalProgress,
    getIngestedDataExport,
    getIngestedDataExportSummary,
    getNextWorkout,
    getRawUploadRetentionDays,
    getRecoveryTimeline,
    getSleepTrend,
    getTrainingLoad,
    getWorkoutDetails,
    getWorkoutHistory,
    getWorkoutStreak,
    getWorkouts,
    resolveSessionTemplate,
  } as const;

  static readonly ingest = {
    assignYears,
    deleteIngestedSource,
    importIngestedData,
    ingestedDataExportSchema,
    parseHealthExport,
    parseHevyCsv,
    parseHevyDate,
    previewIngestedDataImport,
    updateRawUploadRetentionDays,
    updateSyncCursor,
  } as const;

  static readonly storage = {
    tables: {
      bodyMetrics,
      dailyActivity,
      healthWorkouts,
      hevyConnections,
      hevySessions,
      hevySets,
      hevySyncState,
      privacyPreferences,
      sleepSessions,
      syncCursors,
    } as const,
    insertHealthWorkouts,
    upsertBodyMetrics,
    upsertDailyActivity,
    upsertHevySessions,
    upsertHevySets,
    upsertSleepSessions,
  } as const;

  static readonly hevy = {
    attachProviderIdToSession,
    connect: connectHevy,
    createClient: createHevyClient,
    decryptApiKey: decryptHevyApiKey,
    deleteConnection: deleteHevyConnection,
    deleteWorkoutByProviderId: deleteHevyWorkoutByProviderId,
    disconnect: disconnectHevy,
    encryptApiKey: encryptHevyApiKey,
    ensureFresh: ensureHevyFresh,
    requireFresh: requireHevyFresh,
    findUnlinkedSessionForReconciliation,
    getConnection: getHevyConnection,
    getIntegrationStatus: getHevyIntegrationStatus,
    getSyncState: getHevySyncState,
    isExpectedFreshFailure: isExpectedHevyFreshFailure,
    mapWorkoutToRows: mapHevyWorkoutToRows,
    markSyncFailure: markHevySyncFailure,
    markSyncSuccess: markHevySyncSuccess,
    releaseSyncLease: releaseHevySyncLease,
    replaceWorkoutRows: replaceHevyWorkoutRows,
    resolveEncryptionKey: resolveHevyEncryptionKey,
    sessionIdForProviderWorkout: hevySessionIdForProviderWorkout,
    sync: syncHevy,
    tryAcquireSyncLease: tryAcquireHevySyncLease,
    upsertConnection: upsertHevyConnection,
    writeWorkoutPages: writeHevyWorkoutPages,
    constants: {
      apiBaseUrl: HEVY_API_BASE_URL,
      freshnessMs: HEVY_FRESHNESS_MS,
    } as const,
    errors: {
      CredentialConfig: HevyCredentialConfigError,
      CredentialCrypto: HevyCredentialCryptoError,
      Http: HevyHttpError,
      Network: HevyNetworkError,
      NotConnected: HevyNotConnectedError,
      SyncBusy: HevySyncBusyError,
    } as const,
  } as const;

  static readonly tools = {
    execute: executeTool,
    definitions: tools,
  } as const;
}

export type {
  BodyMetricRow,
  ChatContext,
  DataSummary,
  DailyActivityRow,
  ExerciseProgressSet,
  HealthfitDatabaseSchema,
  HealthfitToolsDatabaseSchema,
  HealthWorkoutRow,
  HevyClient,
  HevyClientError,
  HevyConnectionRow,
  HevyCredentialEnvelope,
  HevyPaginatedWorkoutEvents,
  HevySessionRow,
  HevySetRow,
  HevySyncStateRow,
  HevySyncSummary,
  HevyUserInfoResponse,
  HevyWorkout,
  IngestedDataExport,
  SleepSessionRow,
  ToolDefinition,
  WorkoutHistoryItem,
  WorkoutSession,
  WorkoutSet,
};
