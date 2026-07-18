import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const orphanTurnResponseSchema = Schema.Struct({
  code: Schema.Literal("ORPHAN_USER_TURN"),
  orphanMessageId: Schema.String.check(Schema.isUUID()),
});

export class OrphanTurnError extends Error {
  readonly orphanMessageId: string;

  constructor({ orphanMessageId }: { orphanMessageId: string }) {
    super("Your previous request did not receive a response.");
    this.name = "OrphanTurnError";
    this.orphanMessageId = orphanMessageId;
  }
}

export const parseOrphanTurnError = async (
  response: Response,
): Promise<OrphanTurnError | undefined> => {
  if (response.status !== 409) return undefined;
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => undefined);
  const parsed = Schema.decodeUnknownOption(orphanTurnResponseSchema)(body);
  if (Option.isNone(parsed)) return undefined;
  return new OrphanTurnError({ orphanMessageId: parsed.value.orphanMessageId });
};
