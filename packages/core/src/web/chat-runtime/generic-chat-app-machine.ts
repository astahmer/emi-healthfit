import { sendTo, setup } from "xstate";

import { chatSessionMachine, type ChatSessionEvent } from "../chat-session-machine.ts";
import {
  chatTransportActor,
  type ChatTransportActorEvent,
  type ChatTransportActorInput,
} from "./chat-transport-actor.ts";
import {
  conversationStoreActor,
  type ConversationStoreActorEvent,
  type ConversationStoreActorInput,
} from "./conversation-store-actor.ts";
import {
  browserStateActor,
  type BrowserStateActorEvent,
  type BrowserStateActorInput,
} from "./browser-state-actor.ts";
import { chatUiActor, type ChatUiActorEvent } from "./chat-ui-actor.ts";
import {
  settingsActor,
  type SettingsActorEvent,
  type SettingsActorInput,
} from "./settings-actor.ts";
import {
  suggestionsActor,
  type SuggestionsActorEvent,
  type SuggestionsActorInput,
} from "./suggestions-actor.ts";

const invalidForwardingEvent = (): never => {
  throw new Error("Generic chat app received an invalid forwarding event.");
};

export interface GenericChatAppInput
  extends
    Pick<ChatTransportActorInput, "api" | "createId" | "fetch" | "now">,
    Pick<ConversationStoreActorInput, "client">,
    Pick<SettingsActorInput, "storage" | "storageKey" | "defaults">,
    Pick<BrowserStateActorInput, "browser" | "draftStorageKey"> {
  readonly features?: {
    readonly suggestions?: boolean;
  };
}

export type GenericChatAppEvent =
  | { type: "session-event"; event: ChatSessionEvent }
  | { type: "transport-event"; event: ChatTransportActorEvent }
  | { type: "conversation-store-event"; event: ConversationStoreActorEvent }
  | { type: "transport-session-event"; event: ChatSessionEvent }
  | { type: "conversation-store-session-event"; event: ChatSessionEvent }
  | { type: "conversation-store-transport-event"; event: ChatTransportActorEvent }
  | { type: "settings-event"; event: SettingsActorEvent }
  | { type: "browser-state-event"; event: BrowserStateActorEvent }
  | { type: "browser-state-session-event"; event: ChatSessionEvent }
  | { type: "chat-ui-event"; event: ChatUiActorEvent }
  | { type: "suggestions-event"; event: SuggestionsActorEvent };

export const genericChatAppMachine = setup({
  types: {
    context: {} as GenericChatAppInput,
    input: {} as GenericChatAppInput,
    events: {} as GenericChatAppEvent,
  },
  actors: {
    session: chatSessionMachine,
    transport: chatTransportActor,
    conversationStore: conversationStoreActor,
    settings: settingsActor,
    browserState: browserStateActor,
    chatUi: chatUiActor,
    suggestions: suggestionsActor,
  },
  actions: {
    forwardSessionEvent: sendTo("session", ({ event }) => {
      if (event.type === "session-event") return event.event;
      return invalidForwardingEvent();
    }),
    forwardSessionToBrowserState: sendTo("browserState", ({ event }) => {
      if (event.type === "session-event" && event.event.type === "draft-changed")
        return { type: "draft-persist-requested", draft: event.event.draft };
      return { type: "browser-noop" };
    }),
    forwardTransportEvent: sendTo("transport", ({ event }) => {
      if (event.type === "transport-event") return event.event;
      return invalidForwardingEvent();
    }),
    forwardConversationStoreEvent: sendTo("conversationStore", ({ event }) => {
      if (event.type === "conversation-store-event") return event.event;
      return invalidForwardingEvent();
    }),
    forwardConversationStoreTransportEvent: sendTo("transport", ({ event }) => {
      if (event.type === "conversation-store-transport-event") return event.event;
      return invalidForwardingEvent();
    }),
    forwardSettingsEvent: sendTo("settings", ({ event }) => {
      if (event.type === "settings-event") return event.event;
      return invalidForwardingEvent();
    }),
    forwardBrowserStateEvent: sendTo("browserState", ({ event }) => {
      if (event.type === "browser-state-event") return event.event;
      return invalidForwardingEvent();
    }),
    forwardChatUiEvent: sendTo("chatUi", ({ event }) => {
      if (event.type === "chat-ui-event") return event.event;
      return invalidForwardingEvent();
    }),
    forwardSuggestionsEvent: sendTo("suggestions", ({ event }) => {
      if (event.type === "suggestions-event") return event.event;
      return invalidForwardingEvent();
    }),
    forwardChildSessionEvent: sendTo("session", ({ event }) => {
      if (event.type === "transport-session-event") return event.event;
      if (event.type === "conversation-store-session-event") return event.event;
      return invalidForwardingEvent();
    }),
    forwardSessionToConversationStore: sendTo("conversationStore", ({ event }) => {
      if (event.type === "transport-session-event")
        return { type: "session-event", event: event.event };
      return invalidForwardingEvent();
    }),
  },
}).createMachine({
  id: "genericChatApp",
  context: ({ input }) => input,
  invoke: [
    { id: "session", src: "session" },
    {
      id: "transport",
      src: "transport",
      input: ({ context, self }) => ({
        ...context,
        sendSession: (event) => self.send({ type: "transport-session-event", event }),
        sendSuggestions: (event) =>
          self.send({
            type: "suggestions-event",
            event: { type: "suggestions-requested", ...event },
          }),
      }),
    },
    {
      id: "conversationStore",
      src: "conversationStore",
      input: ({ context, self }) => ({
        client: context.client,
        sendSession: (event) => self.send({ type: "conversation-store-session-event", event }),
        sendTransport: (event) => self.send({ type: "conversation-store-transport-event", event }),
      }),
    },
    {
      id: "settings",
      src: "settings",
      input: ({ context }) => ({
        storage: context.storage,
        storageKey: context.storageKey,
        defaults: context.defaults,
      }),
    },
    {
      id: "browserState",
      src: "browserState",
      input: ({ context, self }) => ({
        browser: context.browser,
        draftStorageKey: context.draftStorageKey,
        sendSession: (event) => self.send({ type: "browser-state-session-event", event }),
      }),
    },
    { id: "chatUi", src: "chatUi" },
    {
      id: "suggestions",
      src: "suggestions",
      input: ({ context }) =>
        ({
          client: context.client,
          enabled: context.features?.suggestions ?? false,
        }) satisfies SuggestionsActorInput,
    },
  ],
  on: {
    "session-event": { actions: ["forwardSessionEvent", "forwardSessionToBrowserState"] },
    "transport-event": { actions: "forwardTransportEvent" },
    "conversation-store-event": { actions: "forwardConversationStoreEvent" },
    "transport-session-event": {
      actions: ["forwardChildSessionEvent", "forwardSessionToConversationStore"],
    },
    "conversation-store-session-event": { actions: "forwardChildSessionEvent" },
    "conversation-store-transport-event": { actions: "forwardConversationStoreTransportEvent" },
    "settings-event": { actions: "forwardSettingsEvent" },
    "browser-state-event": { actions: "forwardBrowserStateEvent" },
    "browser-state-session-event": { actions: "forwardChildSessionEvent" },
    "chat-ui-event": { actions: "forwardChatUiEvent" },
    "suggestions-event": { actions: "forwardSuggestionsEvent" },
  },
});
