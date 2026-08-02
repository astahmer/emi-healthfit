import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
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
  GenerationError,
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

const mapGenerationError = <Value, ErrorType, Environment>(
  effect: Effect.Effect<Value, ErrorType, Environment>,
): Effect.Effect<Value, GenerationError, Environment> =>
  effect.pipe(Effect.mapError(toGenerationError));

export class GenerationStoreLive {
  static effect({ requestContext }: { readonly requestContext: RequestContext }): Effect.Effect<
    {
      readonly reader: GenerationReaderShape;
      readonly writer: GenerationWriterShape;
      readonly chunkReader: GenerationChunkReaderShape;
      readonly chunkWriter: GenerationChunkWriterShape;
    },
    never,
    GenerationDatabase
  > {
    const userId = requestContext.userId;
    return Effect.gen(function* () {
      const database = yield* GenerationDatabase;
      return {
        reader: {
          get: (generationId) =>
            mapStoreError(database.getGeneration({ userId, generationId })).pipe(
              Effect.map((generation) =>
                generation === null ? null : toGenerationRecord(generation),
              ),
            ),
          getByRequestId: ({ conversationId, requestId }) =>
            mapStoreError(
              database.getGenerationByRequestId({ userId, conversationId, requestId }),
            ).pipe(
              Effect.map((generation) =>
                generation === null ? null : toGenerationRecord(generation),
              ),
            ),
          getResumable: (conversationId) =>
            mapStoreError(database.getResumableGeneration({ userId, conversationId })).pipe(
              Effect.map((generation) =>
                generation === null ? null : toGenerationRecord(generation),
              ),
            ),
        },
        writer: {
          create: (input) => {
            const createGeneration = database
              .createGeneration({
                userId,
                generationId: input.generationId,
                conversationId: input.conversationId,
                requestId: input.requestId,
                model: input.model,
              })
              .pipe(
                Effect.catchTag("GenerationAlreadyActiveError", (cause) =>
                  database
                    .getRunningGeneration({
                      userId,
                      conversationId: input.conversationId,
                    })
                    .pipe(
                      Effect.flatMap((running) =>
                        Effect.fail(
                          new GenerationAlreadyActiveError({
                            conversationId: cause.conversationId,
                            generationId: running?.id ?? cause.generationId,
                          }),
                        ),
                      ),
                    ),
                ),
              );
            return mapGenerationError(createGeneration);
          },
          markStreaming: (generationId) =>
            mapStoreError(database.markGenerationStreaming({ userId, generationId })),
          finish: (input) => mapStoreError(database.finishGeneration({ userId, ...input })),
        },
        chunkReader: {
          getChunks: ({ generationId, afterSequence }) =>
            mapStoreError(
              database.getGenerationChunks({ userId, generationId, afterSequence }),
            ).pipe(
              Effect.map((chunks) =>
                chunks.map((chunk) => ({ sequence: chunk.sequence, chunk: chunk.chunk })),
              ),
            ),
        },
        chunkWriter: {
          append: ({ generationId, sequence, chunk }) =>
            mapStoreError(
              database.appendGenerationChunk({ userId, generationId, sequence, chunk }),
            ),
        },
      };
    });
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
    const databaseLayer = GenerationDatabase.layer({ db });
    const storeContext = this.effect({ requestContext }).pipe(
      Effect.map(({ reader, writer, chunkReader, chunkWriter }) =>
        Context.make(GenerationReader, reader).pipe(
          Context.add(GenerationWriter, writer),
          Context.add(GenerationChunkReader, chunkReader),
          Context.add(GenerationChunkWriter, chunkWriter),
        ),
      ),
      Effect.provide(databaseLayer),
    );
    return Layer.effectContext(storeContext);
  }
}
