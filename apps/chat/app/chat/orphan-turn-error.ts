import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const orphanTurnResponseSchema = Schema.Struct({
  code: Schema.Literal("ORPHAN_USER_TURN"),
  orphanMessageId: Schema.String.check(Schema.isUUID()),
});

const generationAlreadyRunningSchema = Schema.Struct({
  error: Schema.Literal("A generation is already running"),
  generationId: Schema.String,
});

export class OrphanTurnError extends Error {
  readonly orphanMessageId: string;

  constructor({ orphanMessageId }: { orphanMessageId: string }) {
    super("Your previous request did not receive a response.");
    this.name = "OrphanTurnError";
    this.orphanMessageId = orphanMessageId;
  }
}

export class GenerationAlreadyRunningError extends Error {
  readonly generationId: string;

  constructor({ generationId }: { generationId: string }) {
    super("A reply is already in progress elsewhere. Wait for it to finish, or stop it there.");
    this.name = "GenerationAlreadyRunningError";
    this.generationId = generationId;
  }
}

export const parseChatConflictError = async (
  response: Response,
): Promise<OrphanTurnError | GenerationAlreadyRunningError | undefined> => {
  if (response.status !== 409) return undefined;
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => undefined);
  const orphan = Schema.decodeUnknownOption(orphanTurnResponseSchema)(body);
  if (Option.isSome(orphan)) {
    return new OrphanTurnError({ orphanMessageId: orphan.value.orphanMessageId });
  }
  const running = Schema.decodeUnknownOption(generationAlreadyRunningSchema)(body);
  if (Option.isSome(running)) {
    return new GenerationAlreadyRunningError({ generationId: running.value.generationId });
  }
  return undefined;
};

/** @deprecated Use parseChatConflictError */
export const parseOrphanTurnError = parseChatConflictError;
