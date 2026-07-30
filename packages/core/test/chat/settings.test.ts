import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Schema from "effect/Schema";
import { defaultGenericChatSettings, GenericChatSettingsSchema } from "../../src/chat/index.ts";

describe("generic chat settings", () => {
  it("defines complete local defaults and validates the persisted shape", () => {
    const decoded = Schema.decodeUnknownSync(GenericChatSettingsSchema)(defaultGenericChatSettings);

    assert.equal(decoded.provider, "openai");
    assert.equal(decoded.model, "gpt-4o-mini");
    assert.equal(decoded.titleModel, "gpt-4o-mini");
    assert.equal(decoded.systemPrompt, "");
    assert.equal(decoded.titlePrompt, "");
    assert.equal(decoded.theme, "light");
  });
});
