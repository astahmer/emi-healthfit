import { assign, fromCallback, setup } from "xstate";

import type { ChatSessionEvent } from "../chat-session-machine.ts";
import type { SettingsStorage } from "./settings-actor.ts";

export interface BrowserStateAdapter {
  online: () => boolean;
  subscribeOnline: (listener: (online: boolean) => void) => () => void;
  storage: Pick<SettingsStorage, "getItem" | "setItem"> & { removeItem: (key: string) => void };
}

export interface BrowserStateActorInput {
  browser: BrowserStateAdapter;
  draftStorageKey: string;
  sendSession: (event: ChatSessionEvent) => void;
}

export interface BrowserStateContext extends BrowserStateActorInput {
  online: boolean;
  draftHydrated: boolean;
  error: string | undefined;
}

export type BrowserStateActorEvent =
  | { type: "online-changed"; online: boolean }
  | { type: "draft-persist-requested"; draft: string }
  | { type: "draft-restored"; draft: string }
  | { type: "draft-hydrated" }
  | { type: "browser-state-failed"; error: string };

const errorMessage = ({ cause }: { cause: unknown }): string =>
  cause instanceof Error ? cause.message : "Unable to update browser state.";

const browserStateOperations = fromCallback<BrowserStateActorEvent, BrowserStateActorInput>(
  ({ input, receive, sendBack }) => {
    try {
      const draft = input.browser.storage.getItem(input.draftStorageKey);
      if (draft !== null) sendBack({ type: "draft-restored", draft });
      sendBack({ type: "draft-hydrated" });
    } catch (cause) {
      sendBack({ type: "browser-state-failed", error: errorMessage({ cause }) });
      sendBack({ type: "draft-hydrated" });
    }

    const unsubscribe = input.browser.subscribeOnline((online) => {
      sendBack({ type: "online-changed", online });
    });

    receive((event) => {
      if (event.type !== "draft-persist-requested") return;
      try {
        if (event.draft === "") input.browser.storage.removeItem(input.draftStorageKey);
        else input.browser.storage.setItem(input.draftStorageKey, event.draft);
      } catch (cause) {
        sendBack({ type: "browser-state-failed", error: errorMessage({ cause }) });
      }
    });

    return unsubscribe;
  },
);

export const browserStateActor = setup({
  types: {
    context: {} as BrowserStateContext,
    input: {} as BrowserStateActorInput,
    events: {} as BrowserStateActorEvent,
  },
  actors: { operations: browserStateOperations },
  actions: {
    changeOnline: assign(({ event }) =>
      event.type === "online-changed" ? { online: event.online } : {},
    ),
    markDraftHydrated: assign(({ event }) =>
      event.type === "draft-hydrated" ? { draftHydrated: true } : {},
    ),
    restoreDraft: ({ context, event }) => {
      if (event.type === "draft-restored")
        context.sendSession({ type: "draft-changed", draft: event.draft });
    },
    persistDraft: ({ context, event }) => {
      if (event.type === "draft-persist-requested") {
        if (event.draft === "") context.browser.storage.removeItem(context.draftStorageKey);
        else context.browser.storage.setItem(context.draftStorageKey, event.draft);
      }
    },
    reportFailure: assign(({ event }) =>
      event.type === "browser-state-failed" ? { error: event.error } : {},
    ),
  },
}).createMachine({
  id: "browserState",
  context: ({ input }) => ({
    ...input,
    online: input.browser.online(),
    draftHydrated: false,
    error: undefined,
  }),
  invoke: { id: "operations", src: "operations", input: ({ context }) => context },
  on: {
    "online-changed": { actions: "changeOnline" },
    "draft-persist-requested": { actions: "persistDraft" },
    "draft-restored": { actions: "restoreDraft" },
    "draft-hydrated": { actions: "markDraftHydrated" },
    "browser-state-failed": { actions: "reportFailure" },
  },
});
