import { assign, setup } from "xstate";

/**
 * UI-observable chat journey model for Playwright path generation.
 * Deliberately separate from production machines — models what the user sees.
 */
export type ChatJourneyEvent =
  | { type: "SAVE_API_KEY" }
  | { type: "OPEN_SESSION"; sessionId: string }
  | { type: "NEW_CHAT" }
  | { type: "TYPE_DRAFT"; text: string }
  | { type: "SEND" }
  | { type: "CLICK_SUGGESTION"; text: string }
  | { type: "STOP" }
  | { type: "EDIT_START" }
  | { type: "EDIT_SUBMIT"; text: string }
  | { type: "REGENERATE" }
  | { type: "FORK" }
  | { type: "SEARCH"; query: string }
  | { type: "TOGGLE_COACH" }
  | { type: "TOGGLE_WEB" }
  | { type: "TOGGLE_TEMPORARY" }
  | { type: "SELECT_MODEL"; model: string }
  | { type: "SIDEBAR_RENAME"; title: string }
  | { type: "SIDEBAR_PIN" }
  | { type: "SIDEBAR_ARCHIVE" }
  | { type: "SIDEBAR_CLONE" }
  | { type: "SIDEBAR_DELETE" }
  | { type: "SIDEBAR_COPY" }
  | { type: "SIDEBAR_SHARE" }
  | { type: "SIDEBAR_DOWNLOAD" }
  | { type: "STREAM_DONE" }
  | { type: "STREAM_FAIL" };

export const chatJourneyMachine = setup({
  types: {
    context: {} as {
      draft: string;
      lastSuggestion: string | null;
      sessionId: string | null;
    },
    events: {} as ChatJourneyEvent,
  },
  actions: {
    setDraft: assign(({ event }) => {
      if (event.type !== "TYPE_DRAFT") return {};
      return { draft: event.text };
    }),
    setSession: assign(({ event }) => {
      if (event.type !== "OPEN_SESSION") return {};
      return { sessionId: event.sessionId };
    }),
    setSuggestion: assign(({ event }) => {
      if (event.type !== "CLICK_SUGGESTION") return {};
      return { lastSuggestion: event.text, draft: "" };
    }),
    clearSession: assign({ sessionId: () => null, draft: () => "" }),
  },
}).createMachine({
  id: "chatJourney",
  initial: "needsApiKey",
  context: {
    draft: "",
    lastSuggestion: null,
    sessionId: null,
  },
  states: {
    needsApiKey: {
      on: { SAVE_API_KEY: "emptyComposer" },
    },
    emptyComposer: {
      on: {
        OPEN_SESSION: { target: "idleWithMessages", actions: "setSession" },
        TYPE_DRAFT: { target: "drafting", actions: "setDraft" },
        TOGGLE_COACH: "composerConfigured",
        TOGGLE_WEB: "composerConfigured",
        TOGGLE_TEMPORARY: "composerConfigured",
        SELECT_MODEL: "composerConfigured",
      },
    },
    drafting: {
      on: {
        SEND: "streaming",
        TYPE_DRAFT: { actions: "setDraft" },
      },
    },
    streaming: {
      on: {
        STOP: "idleWithMessages",
        STREAM_DONE: "idleWithMessages",
        STREAM_FAIL: "error",
      },
    },
    idleWithMessages: {
      on: {
        TYPE_DRAFT: { target: "drafting", actions: "setDraft" },
        CLICK_SUGGESTION: { target: "streaming", actions: "setSuggestion" },
        EDIT_START: "editing",
        REGENERATE: "streaming",
        FORK: "branchFocused",
        SEARCH: "searching",
        NEW_CHAT: { target: "emptyComposer", actions: "clearSession" },
        SIDEBAR_RENAME: "sidebarMutating",
        SIDEBAR_PIN: "sidebarMutating",
        SIDEBAR_ARCHIVE: "sidebarMutating",
        SIDEBAR_CLONE: "sidebarMutating",
        SIDEBAR_DELETE: "sidebarMutating",
        SIDEBAR_COPY: "sidebarMutating",
        SIDEBAR_SHARE: "sidebarMutating",
        SIDEBAR_DOWNLOAD: "sidebarMutating",
        TOGGLE_COACH: "composerConfigured",
        TOGGLE_WEB: "composerConfigured",
        TOGGLE_TEMPORARY: "composerConfigured",
        SELECT_MODEL: "composerConfigured",
      },
    },
    editing: {
      on: {
        EDIT_SUBMIT: "streaming",
      },
    },
    searching: {
      on: {
        TYPE_DRAFT: { target: "drafting", actions: "setDraft" },
      },
    },
    branchFocused: {
      on: {
        TYPE_DRAFT: { target: "drafting", actions: "setDraft" },
        NEW_CHAT: { target: "emptyComposer", actions: "clearSession" },
      },
    },
    sidebarMutating: {
      on: {
        STREAM_DONE: "idleWithMessages",
      },
    },
    composerConfigured: {
      on: {
        TYPE_DRAFT: { target: "drafting", actions: "setDraft" },
        SEND: "streaming",
        OPEN_SESSION: { target: "idleWithMessages", actions: "setSession" },
      },
    },
    error: {
      on: {
        SEND: "streaming",
        TYPE_DRAFT: { target: "drafting", actions: "setDraft" },
      },
    },
  },
});
