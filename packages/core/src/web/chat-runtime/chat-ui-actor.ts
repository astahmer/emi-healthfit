import { assign, setup } from "xstate";

export interface ChatUiContext {
  conversationSearch: string;
  memorySearch: string;
  memoryDraft: string;
  memoryPanelOpen: boolean;
  sidebarOpen: boolean;
}

export type ChatUiActorEvent =
  | { type: "conversation-search-changed"; search: string }
  | { type: "memory-search-changed"; search: string }
  | { type: "memory-draft-changed"; draft: string }
  | { type: "memory-draft-cleared" }
  | { type: "memory-panel-changed"; open: boolean }
  | { type: "sidebar-open-changed"; open: boolean };

export const chatUiActor = setup({
  types: {
    context: {} as ChatUiContext,
    events: {} as ChatUiActorEvent,
  },
  actions: {
    changeConversationSearch: assign(({ event }) =>
      event.type === "conversation-search-changed" ? { conversationSearch: event.search } : {},
    ),
    changeMemorySearch: assign(({ event }) =>
      event.type === "memory-search-changed" ? { memorySearch: event.search } : {},
    ),
    changeMemoryDraft: assign(({ event }) =>
      event.type === "memory-draft-changed" ? { memoryDraft: event.draft } : {},
    ),
    clearMemoryDraft: assign(({ event }) =>
      event.type === "memory-draft-cleared" ? { memoryDraft: "" } : {},
    ),
    changeMemoryPanel: assign(({ event }) =>
      event.type === "memory-panel-changed" ? { memoryPanelOpen: event.open } : {},
    ),
    changeSidebar: assign(({ event }) =>
      event.type === "sidebar-open-changed" ? { sidebarOpen: event.open } : {},
    ),
  },
}).createMachine({
  id: "chatUi",
  initial: "ready",
  context: {
    conversationSearch: "",
    memorySearch: "",
    memoryDraft: "",
    memoryPanelOpen: false,
    sidebarOpen: true,
  },
  states: {
    ready: {
      on: {
        "conversation-search-changed": { actions: "changeConversationSearch" },
        "memory-search-changed": { actions: "changeMemorySearch" },
        "memory-draft-changed": { actions: "changeMemoryDraft" },
        "memory-draft-cleared": { actions: "clearMemoryDraft" },
        "memory-panel-changed": { actions: "changeMemoryPanel" },
        "sidebar-open-changed": { actions: "changeSidebar" },
      },
    },
  },
});
