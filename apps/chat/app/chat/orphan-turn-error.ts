import { z } from "zod";

const orphanTurnResponseSchema = z.object({
  code: z.literal("ORPHAN_USER_TURN"),
  orphanMessageId: z.string().uuid(),
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
  const parsed = orphanTurnResponseSchema.safeParse(body);
  if (!parsed.success) return undefined;
  return new OrphanTurnError({ orphanMessageId: parsed.data.orphanMessageId });
};
