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
    return {
      reader: {
        list: (options) =>
          MemoryDatabase.getMemories(db, userId, options).pipe(
            Effect.map((memories) => memories.map(withRank)),
          ),
        search: (query, options) =>
          MemoryDatabase.searchMemories(db, userId, query, options).pipe(
            Effect.map((memories) => memories.map(withRank)),
          ),
        listIdsForMessage: (messageId) =>
          MemoryDatabase.listMemoryIdsForMessage(db, userId, messageId),
      },
      writer: {
        insertMany: (inputs) => MemoryDatabase.insertMemories(db, userId, [...inputs]),
        insert: (input) =>
          MemoryDatabase.insertMemory(
            db,
            userId,
            input.content,
            input.source,
            input.threadId,
            input.messageId,
          ),
        delete: (memoryId) => MemoryDatabase.deleteMemory(db, userId, memoryId),
        deleteByMessage: (messageId) =>
          MemoryDatabase.deleteMemoriesByMessage(db, userId, messageId),
      },
      summary: {
        get: () => MemoryDatabase.getMemorySummary(db, userId),
        upsert: ({ content, memoryCount }) =>
          MemoryDatabase.upsertMemorySummary(db, userId, content, memoryCount),
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
