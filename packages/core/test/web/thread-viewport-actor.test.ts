import { createActor } from "xstate";
import { describe, expect, it } from "vitest";

import {
  threadViewportActor,
  threadViewportNeedsInitialPosition,
} from "../../src/web/thread/thread-viewport-actor.ts";

describe("thread viewport actor", () => {
  it("owns session positioning and derived scroll policy", () => {
    const actor = createActor(threadViewportActor, {
      input: { sessionKey: "conversation-1", messageCount: 2 },
    }).start();

    expect(threadViewportNeedsInitialPosition(actor.getSnapshot().context)).toBe(true);
    actor.send({ type: "position-applied" });
    actor.send({
      type: "viewport-measured",
      scrollTop: 40,
      scrollHeight: 1_000,
      clientHeight: 600,
      canScrollToPreviousUserMessage: true,
    });

    expect(actor.getSnapshot().context).toMatchObject({
      positionedForSessionKey: "conversation-1",
      isAwayFromTop: true,
      isAwayFromBottom: true,
      canScrollToPreviousUserMessage: true,
    });
    actor.stop();
  });

  it("resets policy when the route changes and repositions once", () => {
    const actor = createActor(threadViewportActor, {
      input: { sessionKey: "conversation-1", messageCount: 2 },
    }).start();
    actor.send({ type: "position-applied" });
    actor.send({
      type: "viewport-measured",
      scrollTop: 50,
      scrollHeight: 900,
      clientHeight: 500,
      canScrollToPreviousUserMessage: true,
    });
    actor.send({ type: "route-synced", sessionKey: "conversation-2", messageCount: 1 });

    expect(threadViewportNeedsInitialPosition(actor.getSnapshot().context)).toBe(true);
    expect(actor.getSnapshot().context).toMatchObject({
      isAwayFromTop: false,
      isAwayFromBottom: false,
      canScrollToPreviousUserMessage: false,
    });
    actor.send({ type: "position-applied" });
    expect(threadViewportNeedsInitialPosition(actor.getSnapshot().context)).toBe(false);
    actor.stop();
  });

  it("clears policy for an empty viewport", () => {
    const actor = createActor(threadViewportActor, {
      input: { sessionKey: "conversation-1", messageCount: 2 },
    }).start();
    actor.send({ type: "position-applied" });
    actor.send({
      type: "viewport-measured",
      scrollTop: 40,
      scrollHeight: 900,
      clientHeight: 500,
      canScrollToPreviousUserMessage: true,
    });
    actor.send({ type: "route-synced", sessionKey: "new", messageCount: 0 });
    actor.send({ type: "empty-viewport-positioned" });

    expect(actor.getSnapshot().context).toMatchObject({
      positionedForSessionKey: null,
      isAwayFromTop: false,
      isAwayFromBottom: false,
      canScrollToPreviousUserMessage: false,
    });
    actor.stop();
  });
});
