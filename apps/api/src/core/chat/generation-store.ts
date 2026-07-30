import {
  appendGenerationChunk as appendCoreGenerationChunk,
  appendGenerationChunks as appendCoreGenerationChunks,
  cancelRunningGenerations as cancelCoreRunningGenerations,
  cleanupGenerationHistory as cleanupCoreGenerationHistory,
  createGeneration as createCoreGeneration,
  expireStaleGenerations as expireCoreStaleGenerations,
  finishGeneration as finishCoreGeneration,
  getGeneration as getCoreGeneration,
  getGenerationByRequestId as getCoreGenerationByRequestId,
  getGenerationChunks as getCoreGenerationChunks,
  getResumableGeneration as getCoreResumableGeneration,
  getRunningGeneration as getCoreRunningGeneration,
  markGenerationStreaming as markCoreGenerationStreaming,
  reconcileFinishedGenerations as reconcileCoreFinishedGenerations,
  recordChatEvent as recordCoreChatEvent,
  updateGenerationMetadata as updateCoreGenerationMetadata,
  type ConversationDatabaseSchema,
} from "@emi/core/server";
import { narrowQueryDatabaseClient, type QueryDatabaseClient } from "../../platform/db/client.ts";

export {
  decodeGenerationChunk,
  GenerationAlreadyActiveError,
  isGenerationStale,
  isUniqueConstraintError,
  type ChatGeneration,
  type StoredGenerationChunk,
} from "@emi/core/server";

type CoreOptions<Options> = Options extends { db: unknown }
  ? Omit<Options, "db"> & { db: QueryDatabaseClient }
  : never;

const withCoreDatabase = <Options extends { db: QueryDatabaseClient }>(options: Options) => ({
  ...options,
  db: narrowQueryDatabaseClient<ConversationDatabaseSchema>(options.db),
});

export const createGeneration = (
  options: CoreOptions<Parameters<typeof createCoreGeneration>[0]>,
) => createCoreGeneration(withCoreDatabase(options));

export const markGenerationStreaming = (
  options: CoreOptions<Parameters<typeof markCoreGenerationStreaming>[0]>,
) => markCoreGenerationStreaming(withCoreDatabase(options));

export const updateGenerationMetadata = (
  options: CoreOptions<Parameters<typeof updateCoreGenerationMetadata>[0]>,
) => updateCoreGenerationMetadata(withCoreDatabase(options));

export const appendGenerationChunk = (
  options: CoreOptions<Parameters<typeof appendCoreGenerationChunk>[0]>,
) => appendCoreGenerationChunk(withCoreDatabase(options));

export const appendGenerationChunks = (
  options: CoreOptions<Parameters<typeof appendCoreGenerationChunks>[0]>,
) => appendCoreGenerationChunks(withCoreDatabase(options));

export const finishGeneration = (
  options: CoreOptions<Parameters<typeof finishCoreGeneration>[0]>,
) => finishCoreGeneration(withCoreDatabase(options));

export const cancelRunningGenerations = (
  options: CoreOptions<Parameters<typeof cancelCoreRunningGenerations>[0]>,
) => cancelCoreRunningGenerations(withCoreDatabase(options));

export const recordChatEvent = (options: CoreOptions<Parameters<typeof recordCoreChatEvent>[0]>) =>
  recordCoreChatEvent(withCoreDatabase(options));

export const expireStaleGenerations = (
  options: CoreOptions<Parameters<typeof expireCoreStaleGenerations>[0]>,
) => expireCoreStaleGenerations(withCoreDatabase(options));

export const reconcileFinishedGenerations = (
  options: CoreOptions<Parameters<typeof reconcileCoreFinishedGenerations>[0]>,
) => reconcileCoreFinishedGenerations(withCoreDatabase(options));

export const cleanupGenerationHistory = (
  options: CoreOptions<Parameters<typeof cleanupCoreGenerationHistory>[0]>,
) => cleanupCoreGenerationHistory(withCoreDatabase(options));

export const getRunningGeneration = (
  options: CoreOptions<Parameters<typeof getCoreRunningGeneration>[0]>,
) => getCoreRunningGeneration(withCoreDatabase(options));

export const getResumableGeneration = (
  options: CoreOptions<Parameters<typeof getCoreResumableGeneration>[0]>,
) => getCoreResumableGeneration(withCoreDatabase(options));

export const getGeneration = (options: CoreOptions<Parameters<typeof getCoreGeneration>[0]>) =>
  getCoreGeneration(withCoreDatabase(options));

export const getGenerationByRequestId = (
  options: CoreOptions<Parameters<typeof getCoreGenerationByRequestId>[0]>,
) => getCoreGenerationByRequestId(withCoreDatabase(options));

export const getGenerationChunks = (
  options: CoreOptions<Parameters<typeof getCoreGenerationChunks>[0]>,
) => getCoreGenerationChunks(withCoreDatabase(options));
