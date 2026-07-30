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

export interface GenericChatAppInput
  extends
    Pick<ChatTransportActorInput, "api" | "createId" | "fetch">,
    Pick<ConversationStoreActorInput, "client">,
    Pick<SettingsActorInput, "storage" | "storageKey" | "defaults">,
    Pick<BrowserStateActorInput, "browser" | "draftStorageKey"> {}

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
  | { type: "chat-ui-event"; event: ChatUiActorEvent };

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
  },
  actions: {
    forwardSessionEvent: sendTo("session", ({ event }) =>
      event.type === "session-event" ? event.event : { type: "fresh-started" },
    ),
    forwardSessionToBrowserState: sendTo("browserState", ({ event }) =>
      event.type === "session-event" && event.event.type === "draft-changed"
        ? { type: "draft-persist-requested", draft: event.event.draft }
        : { type: "browser-noop" },
    ),
    forwardTransportEvent: sendTo("transport", ({ event }) =>
      event.type === "transport-event" ? event.event : { type: "stream-cancelled" },
    ),
    forwardConversationStoreEvent: sendTo("conversationStore", ({ event }) =>
      event.type === "conversation-store-event" ? event.event : { type: "threads-cleared" },
    ),
    forwardConversationStoreTransportEvent: sendTo("transport", ({ event }) =>
      event.type === "conversation-store-transport-event"
        ? event.event
        : { type: "stream-cancelled" },
    ),
    forwardSettingsEvent: sendTo("settings", ({ event }) =>
      event.type === "settings-event"
        ? event.event
        : { type: "settings-patch-requested", patch: {} },
    ),
    forwardBrowserStateEvent: sendTo("browserState", ({ event }) =>
      event.type === "browser-state-event"
        ? event.event
        : { type: "draft-persist-requested", draft: "" },
    ),
    forwardChatUiEvent: sendTo("chatUi", ({ event }) =>
      event.type === "chat-ui-event" ? event.event : { type: "memory-draft-cleared" },
    ),
    forwardChildSessionEvent: sendTo("session", ({ event }) => {
      if (event.type === "transport-session-event") return event.event;
      if (event.type === "conversation-store-session-event") return event.event;
      return { type: "fresh-started" };
    }),
    forwardSessionToConversationStore: sendTo("conversationStore", ({ event }) =>
      event.type === "transport-session-event"
        ? { type: "session-event", event: event.event }
        : { type: "threads-cleared" },
    ),
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
  },
});
