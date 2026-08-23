import { describe, expect, it } from "vitest";
import {
  GenerationAlreadyRunningError,
  OrphanTurnError,
} from "../../src/web/chat-conflict-errors.ts";
import { createDefaultChatErrorDecoder } from "../../src/web/chat-runtime/default-error-decoder.ts";

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status });

describe("createDefaultChatErrorDecoder", () => {
  it("decodes orphan user turn conflicts with the orphan message id", async () => {
    const decode = createDefaultChatErrorDecoder();
    const decoded = await decode({
      response: jsonResponse(
        { code: "ORPHAN_USER_TURN", orphanMessageId: "11111111-1111-4111-8111-111111111111" },
        409,
      ),
    });

    expect(decoded).toMatchObject({
      message: new OrphanTurnError({ orphanMessageId: "x" }).message,
      messageId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("decodes generation-already-running conflicts without a message id", async () => {
    const decode = createDefaultChatErrorDecoder();
    const decoded = await decode({
      response: jsonResponse(
        { error: "A generation is already running", generationId: "generation-1" },
        409,
      ),
    });

    expect(decoded).toMatchObject({
      message: new GenerationAlreadyRunningError({ generationId: "generation-1" }).message,
    });
    expect(decoded?.messageId).toBeUndefined();
  });

  it("falls back to a plain error body field on other statuses", async () => {
    const decode = createDefaultChatErrorDecoder();
    const decoded = await decode({ response: jsonResponse({ error: "Model overloaded" }, 502) });

    expect(decoded).toEqual({ message: "Model overloaded" });
  });

  it("returns undefined for bodies that match neither shape", async () => {
    const decode = createDefaultChatErrorDecoder();
    expect(await decode({ response: jsonResponse({ detail: "nope" }, 500) })).toBeUndefined();
    expect(await decode({ response: new Response("{not json", { status: 409 }) })).toBeUndefined();
  });
});
