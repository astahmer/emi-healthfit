import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { MemoryInput, MemorySearchResult, MemorySummary } from "../db/memories.ts";

export type MemoryRecord = MemorySearchResult;

export interface MemoryReaderShape<TEnvironment = never> {
  readonly list: (options?: {
    readonly limit?: number;
  }) => Effect.Effect<ReadonlyArray<MemoryRecord>, never, TEnvironment>;
  readonly search: (
    query: string,
    options?: { readonly limit?: number },
  ) => Effect.Effect<ReadonlyArray<MemoryRecord>, never, TEnvironment>;
  readonly listIdsForMessage: (
    messageId: string,
  ) => Effect.Effect<ReadonlyArray<string>, never, TEnvironment>;
}

export interface MemoryWriterShape<TEnvironment = never> {
  readonly insertMany: (
    inputs: ReadonlyArray<MemoryInput>,
  ) => Effect.Effect<ReadonlyArray<string>, never, TEnvironment>;
  readonly insert: (input: MemoryInput) => Effect.Effect<string | null, never, TEnvironment>;
  readonly delete: (memoryId: string) => Effect.Effect<void, never, TEnvironment>;
  readonly deleteByMessage: (messageId: string) => Effect.Effect<void, never, TEnvironment>;
}

export interface MemorySummaryStoreShape<TEnvironment = never> {
  readonly get: () => Effect.Effect<MemorySummary | undefined, never, TEnvironment>;
  readonly upsert: (input: {
    readonly content: string;
    readonly memoryCount: number;
  }) => Effect.Effect<void, never, TEnvironment>;
}

export class MemoryReader extends Context.Service<MemoryReader, MemoryReaderShape>()(
  "@emi/core/server/MemoryReader",
) {}

export class MemoryWriter extends Context.Service<MemoryWriter, MemoryWriterShape>()(
  "@emi/core/server/MemoryWriter",
) {}

export class MemorySummaryStore extends Context.Service<
  MemorySummaryStore,
  MemorySummaryStoreShape
>()("@emi/core/server/MemorySummaryStore") {}
