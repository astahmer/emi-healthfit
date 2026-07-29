import { describe, expect, it } from "vitest";
import {
  GenerationAlreadyRunningError,
  OrphanTurnError,
  parseChatConflictError,
} from "./orphan-turn-error";

describe("parseChatConflictError", () => {
  it("parses orphan user turn conflicts", async () => {
    const orphanMessageId = "11111111-1111-4111-8111-111111111111";
    const response = new Response(JSON.stringify({ code: "ORPHAN_USER_TURN", orphanMessageId }), {
      status: 409,
    });

    const error = await parseChatConflictError(response);

    expect(error).toBeInstanceOf(OrphanTurnError);
    expect(error).toMatchObject({ orphanMessageId });
  });

  it("parses generation-already-running conflicts", async () => {
    const response = new Response(
      JSON.stringify({
        error: "A generation is already running",
        generationId: "generation-1",
      }),
      { status: 409 },
    );

    const error = await parseChatConflictError(response);

    expect(error).toBeInstanceOf(GenerationAlreadyRunningError);
    expect(error?.message).toContain("already in progress");
  });

  it("ignores non-conflict statuses", async () => {
    const response = new Response(JSON.stringify({ error: "nope" }), { status: 500 });
    expect(await parseChatConflictError(response)).toBeUndefined();
  });
});
