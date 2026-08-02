import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chatRuntimeMachine, createChatRuntimeActor } from "../../src/advanced/xstate/index.ts";

const options = {
  transport: { baseUrl: "/api", fetch: globalThis.fetch },
  storage: {
    settings: { get: () => null, set: () => undefined, remove: () => undefined },
    drafts: { get: () => null, set: () => undefined, remove: () => undefined },
  },
  browser: { online: true, subscribeOnline: () => () => undefined },
  identity: { createId: () => "test-id", now: () => "2026-01-01T00:00:00.000Z" },
};

describe("advanced XState entrypoint", () => {
  it("exposes the actor graph only through the explicit opt-in surface", () => {
    const actor = createChatRuntimeActor(options);
    actor.start();
    try {
      assert.equal(chatRuntimeMachine.id, "genericChatApp");
      assert.ok("session" in actor.getSnapshot().children);
    } finally {
      actor.stop();
    }
  });
});
