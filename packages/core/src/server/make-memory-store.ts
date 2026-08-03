import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
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

type MemoryDatabaseClient = QueryDatabaseClient<MemoryDatabaseSchema>;

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
  static effect({ requestContext }: { readonly requestContext: RequestContext }): Effect.Effect<
    {
      readonly reader: MemoryReaderShape;
      readonly writer: MemoryWriterShape;
      readonly summary: MemorySummaryStoreShape;
    },
    never,
    MemoryDatabase
  > {
    const userId = requestContext.userId;
    return Effect.gen(function* () {
    const database = yield* MemoryDatabase;
      return {
        reader: {
          count: () => database.countMemories({ userId }),
          list: (options) =>
            database
              .getMemories({ userId, options })
              .pipe(Effect.map((memories) => memories.map(withRank))),
          search: (query, options) =>
            database
              .searchMemories({ userId, query, options })
              .pipe(Effect.map((memories) => memories.map(withRank))),
          listIdsForMessage: (messageId) => database.listMemoryIdsForMessage({ userId, messageId }),
        },
        writer: {
          insertMany: (inputs) => database.insertMemories({ userId, inputs: [...inputs] }),
          insert: (input) => database.insertMemory({ userId, ...input }),
          delete: (memoryId) => database.deleteMemory({ userId, id: memoryId }),
          deleteByMessage: (messageId) => database.deleteMemoriesByMessage({ userId, messageId }),
        },
        summary: {
          get: () => database.getMemorySummary({ userId }),
          upsert: ({ content, memoryCount }) =>
            database.upsertMemorySummary({ userId, content, memoryCount }),
        },
      };
    });
  }

  static layer({
    db,
    requestContext,
  }: {
    readonly db: MemoryDatabaseClient;
    readonly requestContext: RequestContext;
  }): Layer.Layer<MemoryReader | MemoryWriter | MemorySummaryStore> {
    const databaseLayer = MemoryDatabase.layer({ db });
    const storeContext = this.effect({ requestContext }).pipe(
      Effect.map(({ reader, writer, summary }) =>
        Context.make(MemoryReader, reader).pipe(
          Context.add(MemoryWriter, writer),
          Context.add(MemorySummaryStore, summary),
        ),
      ),
      Effect.provide(databaseLayer),
    );
    return Layer.effectContext(storeContext);
  }
}
