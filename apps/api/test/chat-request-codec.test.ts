import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ChatStreamRequestSchema } from "../src/chat/request-codec.ts";

const request = {
  messages: [],
  config: { provider: "openai" as const, apiKey: "key", model: "gpt-5" },
};

describe("chat stream request codec", () => {
  it("accepts a stable client request identifier", () => {
    const decoded = Schema.decodeUnknownOption(ChatStreamRequestSchema)({
      ...request,
      requestId: "4e57ebd8-668b-4b12-902e-788dbfce52d0",
    });

    assert.equal(Option.isSome(decoded), true);
    if (Option.isSome(decoded)) {
      assert.equal(decoded.value.requestId, "4e57ebd8-668b-4b12-902e-788dbfce52d0");
    }
  });

  it("rejects malformed client request identifiers", () => {
    const decoded = Schema.decodeUnknownOption(ChatStreamRequestSchema)({
      ...request,
      requestId: "not-a-uuid",
    });

    assert.equal(Option.isNone(decoded), true);
  });
});
