import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GenerationAlreadyRunningError,
  OrphanTurnError,
  parseChatConflictError,
} from "../../src/web/chat-conflict-errors.ts";

describe("parseChatConflictError", () => {
  it("parses orphan user turn conflicts", async () => {
    const orphanMessageId = "11111111-1111-4111-8111-111111111111";
    const response = new Response(JSON.stringify({ code: "ORPHAN_USER_TURN", orphanMessageId }), {
      status: 409,
    });

    const error = await parseChatConflictError(response);

    assert.ok(error instanceof OrphanTurnError);
    assert.equal(error.orphanMessageId, orphanMessageId);
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

    assert.ok(error instanceof GenerationAlreadyRunningError);
    assert.match(error.message, /already in progress/);
  });

  it("ignores non-conflict statuses", async () => {
    const response = new Response(JSON.stringify({ error: "nope" }), { status: 500 });
    assert.equal(await parseChatConflictError(response), undefined);
  });

  it("ignores conflict bodies that match neither schema", async () => {
    const response = new Response(JSON.stringify({ error: "different" }), { status: 409 });
    assert.equal(await parseChatConflictError(response), undefined);
  });

  it("ignores malformed JSON bodies", async () => {
    const response = new Response("{not json", { status: 409 });
    assert.equal(await parseChatConflictError(response), undefined);
  });
});
