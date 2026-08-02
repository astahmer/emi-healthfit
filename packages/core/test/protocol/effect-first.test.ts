import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Effect } from "effect";
import { ChatProtocol, ProtocolDecodeError, type Conversation } from "../../src/protocol/index.ts";

const conversationDto = {
  id: "conversation-1",
  title: "Planning",
  status: "regular" as const,
  pinned: false,
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

describe("@emi/core/protocol Effect-first surface", () => {
  it("groups protocol schemas and mappers under one domain class", async () => {
    const publicProtocol = await import("@emi/core/protocol");

    assert.equal(typeof ChatProtocol, "function");
    assert.equal(typeof ChatProtocol.schemas.conversation, "object");
    assert.equal(typeof ChatProtocol.fromConversationDto, "function");
    assert.equal("ChatProtocol" in publicProtocol, true);
    assert.equal("fromConversationDto" in publicProtocol, false);
    assert.equal("protocolSchemas" in publicProtocol, false);

    const decoded: Effect.Effect<Conversation, ProtocolDecodeError> =
      ChatProtocol.fromConversationDto(conversationDto);

    assert.deepEqual(await Effect.runPromise(decoded), conversationDto);
    assert.deepEqual(await ChatProtocol.runPromise(decoded), conversationDto);
  });

  it("keeps invalid protocol values in the typed Effect error channel", async () => {
    const decoded = ChatProtocol.fromConversationDto({
      ...conversationDto,
      createdAt: "not-a-timestamp",
    });

    await assert.rejects(
      () => Effect.runPromise(decoded),
      (error: unknown) => error instanceof ProtocolDecodeError,
    );
  });
});
