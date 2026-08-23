import { assign, setup } from "xstate";

export interface MessageEditorContext {
  messageId: string | null;
  draft: string;
}

export type MessageEditorEvent =
  | { type: "edit.start"; messageId: string; draft: string }
  | { type: "edit.change"; draft: string }
  | { type: "edit.cancel" };

export const messageEditorMachine = setup({
  types: {
    context: {} as MessageEditorContext,
    events: {} as MessageEditorEvent,
  },
}).createMachine({
  initial: "idle",
  context: { messageId: null, draft: "" },
  states: {
    idle: {
      on: {
        "edit.start": {
          target: "editing",
          actions: assign(({ event }) => ({ messageId: event.messageId, draft: event.draft })),
        },
      },
    },
    editing: {
      on: {
        "edit.change": { actions: assign(({ event }) => ({ draft: event.draft })) },
        "edit.cancel": {
          target: "idle",
          actions: assign({ messageId: () => null, draft: () => "" }),
        },
      },
    },
  },
});
