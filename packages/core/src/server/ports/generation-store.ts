import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export type GenerationStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "failed"
  | "timed_out"
  | "cancelled";

export interface GenerationRecord {
  readonly id: string;
  readonly conversationId: string;
  readonly requestId: string;
  readonly status: GenerationStatus;
  readonly error: string | null;
}

export interface GenerationChunkRecord {
  readonly sequence: number;
  readonly chunk: unknown;
}

export interface CreateGenerationInput {
  readonly generationId: string;
  readonly conversationId: string;
  readonly requestId: string;
  readonly model?: string;
}

export interface FinishGenerationInput {
  readonly generationId: string;
  readonly status: "completed" | "failed" | "timed_out" | "cancelled";
  readonly error?: string;
  readonly finishReason?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export class GenerationStoreError extends Schema.TaggedErrorClass<GenerationStoreError>()(
  "GenerationStoreError",
  { message: Schema.String },
) {}

export class GenerationConflictError extends Schema.TaggedErrorClass<GenerationConflictError>()(
  "GenerationConflictError",
  {
    conversationId: Schema.String,
    generationId: Schema.String,
    message: Schema.String,
  },
) {}

export type GenerationError = GenerationStoreError | GenerationConflictError;

export interface GenerationReaderShape<TEnvironment = never> {
  readonly get: (
    generationId: string,
  ) => Effect.Effect<GenerationRecord | null, GenerationStoreError, TEnvironment>;
  readonly getByRequestId: (input: {
    readonly conversationId: string;
    readonly requestId: string;
  }) => Effect.Effect<GenerationRecord | null, GenerationStoreError, TEnvironment>;
  readonly getResumable: (
    conversationId: string,
  ) => Effect.Effect<GenerationRecord | null, GenerationStoreError, TEnvironment>;
}

export interface GenerationWriterShape<TEnvironment = never> {
  readonly create: (
    input: CreateGenerationInput,
  ) => Effect.Effect<boolean, GenerationError, TEnvironment>;
  readonly markStreaming: (
    generationId: string,
  ) => Effect.Effect<void, GenerationStoreError, TEnvironment>;
  readonly finish: (
    input: FinishGenerationInput,
  ) => Effect.Effect<boolean, GenerationStoreError, TEnvironment>;
}

export interface GenerationChunkReaderShape<TEnvironment = never> {
  readonly getChunks: (input: {
    readonly generationId: string;
    readonly afterSequence: number;
  }) => Effect.Effect<ReadonlyArray<GenerationChunkRecord>, GenerationStoreError, TEnvironment>;
}

export interface GenerationChunkWriterShape<TEnvironment = never> {
  readonly append: (input: {
    readonly generationId: string;
    readonly sequence: number;
    readonly chunk: unknown;
  }) => Effect.Effect<boolean, GenerationStoreError, TEnvironment>;
}

export class GenerationReader extends Context.Service<GenerationReader, GenerationReaderShape>()(
  "@emi/core/server/GenerationReader",
) {}

export class GenerationWriter extends Context.Service<GenerationWriter, GenerationWriterShape>()(
  "@emi/core/server/GenerationWriter",
) {}

export class GenerationChunkReader extends Context.Service<
  GenerationChunkReader,
  GenerationChunkReaderShape
>()("@emi/core/server/GenerationChunkReader") {}

export class GenerationChunkWriter extends Context.Service<
  GenerationChunkWriter,
  GenerationChunkWriterShape
>()("@emi/core/server/GenerationChunkWriter") {}
