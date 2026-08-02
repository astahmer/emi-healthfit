import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  GenerationAlreadyActiveError,
  GenerationDatabase,
  type ChatGeneration,
} from "./db/generations.ts";
import type { QueryDatabaseClient } from "./db/query-database.ts";
import type { ConversationDatabaseSchema } from "./db/schema.ts";
import type { RequestContext } from "./request-context.ts";
import {
  GenerationChunkReader,
  GenerationChunkWriter,
  GenerationConflictError,
  GenerationReader,
  GenerationStoreError,
  GenerationWriter,
} from "./ports/generation-store.ts";
import type {
  GenerationChunkReaderShape,
  GenerationChunkWriterShape,
  GenerationReaderShape,
  GenerationWriterShape,
} from "./ports/generation-store.ts";

const toGenerationRecord = (generation: ChatGeneration) => ({
  id: generation.id,
  conversationId: generation.conversation_id,
  requestId: generation.request_id,
  status: generation.status,
  error: generation.error,
});

const toGenerationError = (cause: unknown) => {
  if (cause instanceof GenerationAlreadyActiveError) {
    return new GenerationConflictError({
      conversationId: cause.conversationId,
      generationId: cause.generationId,
      message: cause.message,
    });
  }
  return new GenerationStoreError({
    message: cause instanceof Error ? cause.message : String(cause),
  });
};

const toGenerationStoreError = (cause: unknown) =>
  new GenerationStoreError({
    message: cause instanceof Error ? cause.message : String(cause),
  });

const mapStoreError = <Value, Error, Environment>(
  effect: Effect.Effect<Value, Error, Environment>,
) => effect.pipe(Effect.mapError(toGenerationStoreError));

const mapGenerationError = <Value, Error, Environment>(
  effect: Effect.Effect<Value, Error, Environment>,
) => effect.pipe(Effect.mapError(toGenerationError));

export class GenerationStoreLive {
  static shapes<TEnvironment>({
    db,
    requestContext,
  }: {
    readonly db: QueryDatabaseClient<ConversationDatabaseSchema, TEnvironment>;
    readonly requestContext: RequestContext;
  }): {
    readonly reader: GenerationReaderShape<TEnvironment>;
    readonly writer: GenerationWriterShape<TEnvironment>;
    readonly chunkReader: GenerationChunkReaderShape<TEnvironment>;
    readonly chunkWriter: GenerationChunkWriterShape<TEnvironment>;
  } {
    const userId = requestContext.userId;
    return {
      reader: {
        get: (generationId) =>
          mapStoreError(GenerationDatabase.getGeneration({ db, userId, generationId })).pipe(
            Effect.map((generation) =>
              generation === null ? null : toGenerationRecord(generation),
            ),
          ),
        getByRequestId: ({ conversationId, requestId }) =>
          mapStoreError(
            GenerationDatabase.getGenerationByRequestId({
              db,
              userId,
              conversationId,
              requestId,
            }),
          ).pipe(
            Effect.map((generation) =>
              generation === null ? null : toGenerationRecord(generation),
            ),
          ),
        getResumable: (conversationId) =>
          mapStoreError(
            GenerationDatabase.getResumableGeneration({ db, userId, conversationId }),
          ).pipe(
            Effect.map((generation) =>
              generation === null ? null : toGenerationRecord(generation),
            ),
          ),
      },
      writer: {
        create: (input) => {
          const createGeneration = GenerationDatabase.createGeneration({
            db,
            userId,
            generationId: input.generationId,
            conversationId: input.conversationId,
            requestId: input.requestId,
            model: input.model,
          }).pipe(
            Effect.catchIf(
              (cause): cause is InstanceType<typeof GenerationAlreadyActiveError> =>
                cause instanceof GenerationAlreadyActiveError,
              (cause) => {
                return GenerationDatabase.getRunningGeneration({
                  db,
                  userId,
                  conversationId: input.conversationId,
                }).pipe(
                  Effect.flatMap((running) =>
                    Effect.fail(
                      new GenerationAlreadyActiveError({
                        conversationId: cause.conversationId,
                        generationId: running?.id ?? cause.generationId,
                      }),
                    ),
                  ),
                );
              },
            ),
          );
          return mapGenerationError(createGeneration);
        },
        markStreaming: (generationId) =>
          mapStoreError(GenerationDatabase.markGenerationStreaming({ db, userId, generationId })),
        finish: (input) =>
          mapStoreError(GenerationDatabase.finishGeneration({ db, userId, ...input })),
      },
      chunkReader: {
        getChunks: ({ generationId, afterSequence }) =>
          mapStoreError(
            GenerationDatabase.getGenerationChunks({ db, userId, generationId, afterSequence }),
          ).pipe(
            Effect.map((chunks) =>
              chunks.map((chunk) => ({ sequence: chunk.sequence, chunk: chunk.chunk })),
            ),
          ),
      },
      chunkWriter: {
        append: ({ generationId, sequence, chunk }) =>
          mapStoreError(
            GenerationDatabase.appendGenerationChunk({
              db,
              userId,
              generationId,
              sequence,
              chunk,
            }),
          ),
      },
    };
  }

  static layer({
    db,
    requestContext,
  }: {
    readonly db: QueryDatabaseClient<ConversationDatabaseSchema>;
    readonly requestContext: RequestContext;
  }): Layer.Layer<
    GenerationReader | GenerationWriter | GenerationChunkReader | GenerationChunkWriter
  > {
    const shapes = this.shapes({ db, requestContext });
    return Layer.mergeAll(
      Layer.succeed(GenerationReader, shapes.reader),
      Layer.succeed(GenerationWriter, shapes.writer),
      Layer.succeed(GenerationChunkReader, shapes.chunkReader),
      Layer.succeed(GenerationChunkWriter, shapes.chunkWriter),
    );
  }
}
