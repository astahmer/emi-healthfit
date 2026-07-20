import { getShortestPaths } from "xstate/graph";
import { describe, expect, it } from "vitest";
import { chatJourneyMachine } from "./chat-journey-machine.ts";

describe("chatJourneyMachine paths", () => {
  const paths = getShortestPaths(chatJourneyMachine, {
    events: [
      { type: "SAVE_API_KEY" },
      { type: "OPEN_SESSION", sessionId: "one" },
      { type: "TYPE_DRAFT", text: "hello" },
      { type: "SEND" },
      { type: "CLICK_SUGGESTION", text: "Tell me more" },
      { type: "STOP" },
      { type: "STREAM_DONE" },
      { type: "STREAM_FAIL" },
      { type: "EDIT_START" },
      { type: "EDIT_SUBMIT", text: "edited" },
      { type: "REGENERATE" },
      { type: "FORK" },
      { type: "SEARCH", query: "hello" },
      { type: "TOGGLE_COACH" },
      { type: "SIDEBAR_PIN" },
      { type: "NEW_CHAT" },
    ],
    serializeState: (state) => JSON.stringify(state.value),
    limit: 200,
  });

  for (const path of paths) {
    it(`reaches ${JSON.stringify(path.state.value)}`, () => {
      expect(path.state.value).toBeDefined();
    });
  }
});
