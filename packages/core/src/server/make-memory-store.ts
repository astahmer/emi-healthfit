import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { MemoryDatabase } from "./db/memories.ts";
import type { QueryDatabaseClient } from "./db/query-database.ts";
import type { MemoryDatabaseSchema } from "./db/schema.ts";
import type { RequestContext } from "./request-context.ts";
import { MemoryReader, MemorySummaryStore, MemoryWriter } from "./ports/memory-store.ts";
import type {
  MemoryReaderShape,
  MemorySummaryStoreShape,
  MemoryWriterShape,
} from "./ports/memory-store.ts";

type MemoryDatabaseClient<TEnvironment> = QueryDatabaseClient<MemoryDatabaseSchema, TEnvironment>;

const withRank = (memory: {
  readonly id: string;
  readonly content: string;
  readonly source: string | null;
  readonly thread_id: string | null;
  readonly created_at: string;
  readonly rank?: number;
}) => ({
  id: memory.id,
  content: memory.content,
  source: memory.source,
  thread_id: memory.thread_id,
  created_at: memory.created_at,
  rank: memory.rank ?? 0,
});

export class MemoryStoreLive {
  static shapes<TEnvironment>({
    db,
    requestContext,
  }: {
    readonly db: MemoryDatabaseClient<TEnvironment>;
    readonly requestContext: RequestContext;
  }): {
    readonly reader: MemoryReaderShape<TEnvironment>;
    readonly writer: MemoryWriterShape<TEnvironment>;
    readonly summary: MemorySummaryStoreShape<TEnvironment>;
  } {
    const userId = requestContext.userId;
    const databaseLayer = MemoryDatabase.layer({ db });
    const provideDatabase = <A>(effect: Effect.Effect<A, never, MemoryDatabase>) =>
      Effect.provide(effect, databaseLayer);
    return {
      reader: {
        list: (options) =>
          provideDatabase(MemoryDatabase.getMemories({ userId, options })).pipe(
            Effect.map((memories) => memories.map(withRank)),
          ),
        search: (query, options) =>
          provideDatabase(MemoryDatabase.searchMemories({ userId, query, options })).pipe(
            Effect.map((memories) => memories.map(withRank)),
          ),
        listIdsForMessage: (messageId) =>
          provideDatabase(MemoryDatabase.listMemoryIdsForMessage({ userId, messageId })),
      },
      writer: {
        insertMany: (inputs) =>
          provideDatabase(MemoryDatabase.insertMemories({ userId, inputs: [...inputs] })),
        insert: (input) => provideDatabase(MemoryDatabase.insertMemory({ userId, ...input })),
        delete: (memoryId) =>
          provideDatabase(MemoryDatabase.deleteMemory({ userId, id: memoryId })),
        deleteByMessage: (messageId) =>
          provideDatabase(MemoryDatabase.deleteMemoriesByMessage({ userId, messageId })),
      },
      summary: {
        get: () => provideDatabase(MemoryDatabase.getMemorySummary({ userId })),
        upsert: ({ content, memoryCount }) =>
          provideDatabase(MemoryDatabase.upsertMemorySummary({ userId, content, memoryCount })),
      },
    };
  }

  static layer({
    db,
    requestContext,
  }: {
    readonly db: MemoryDatabaseClient<never>;
    readonly requestContext: RequestContext;
  }): Layer.Layer<MemoryReader | MemoryWriter | MemorySummaryStore> {
    const shapes = this.shapes({ db, requestContext });
    return Layer.mergeAll(
      Layer.succeed(MemoryReader, shapes.reader),
      Layer.succeed(MemoryWriter, shapes.writer),
      Layer.succeed(MemorySummaryStore, shapes.summary),
    );
  }
}
