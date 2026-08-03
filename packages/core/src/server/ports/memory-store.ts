import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { MemoryInput, MemorySearchResult, MemorySummary } from "../db/memories.ts";
import type { DatabaseQueryError } from "../db/query-database.ts";

type DatabaseEffect<Value, Error = never, Environment = never> = Effect.Effect<
  Value,
  Error | DatabaseQueryError,
  Environment
>;

export type MemoryRecord = MemorySearchResult;

export interface MemoryReaderShape<TEnvironment = never> {
  readonly count: () => DatabaseEffect<number, never, TEnvironment>;
  readonly list: (options?: {
    readonly limit?: number;
  }) => DatabaseEffect<ReadonlyArray<MemoryRecord>, never, TEnvironment>;
  readonly search: (
    query: string,
    options?: { readonly limit?: number },
  ) => DatabaseEffect<ReadonlyArray<MemoryRecord>, never, TEnvironment>;
  readonly listIdsForMessage: (
    messageId: string,
  ) => DatabaseEffect<ReadonlyArray<string>, never, TEnvironment>;
}

export interface MemoryWriterShape<TEnvironment = never> {
  readonly insertMany: (
    inputs: ReadonlyArray<MemoryInput>,
  ) => DatabaseEffect<ReadonlyArray<string>, never, TEnvironment>;
  readonly insert: (input: MemoryInput) => DatabaseEffect<string | null, never, TEnvironment>;
  readonly delete: (memoryId: string) => DatabaseEffect<void, never, TEnvironment>;
  readonly deleteByMessage: (messageId: string) => DatabaseEffect<void, never, TEnvironment>;
}

export interface MemorySummaryStoreShape<TEnvironment = never> {
  readonly get: () => DatabaseEffect<MemorySummary | undefined, never, TEnvironment>;
  readonly upsert: (input: {
    readonly content: string;
    readonly memoryCount: number;
  }) => DatabaseEffect<void, never, TEnvironment>;
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
