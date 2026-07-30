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

export interface GenericChatAppInput
  extends
    Pick<ChatTransportActorInput, "api" | "createId" | "fetch">,
    Pick<ConversationStoreActorInput, "client"> {}

export type GenericChatAppEvent =
  | { type: "session-event"; event: ChatSessionEvent }
  | { type: "transport-event"; event: ChatTransportActorEvent }
  | { type: "conversation-store-event"; event: ConversationStoreActorEvent }
  | { type: "transport-session-event"; event: ChatSessionEvent }
  | { type: "conversation-store-session-event"; event: ChatSessionEvent }
  | { type: "conversation-store-transport-event"; event: ChatTransportActorEvent };

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
  },
  actions: {
    forwardSessionEvent: sendTo("session", ({ event }) =>
      event.type === "session-event" ? event.event : { type: "fresh-started" },
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
  ],
  on: {
    "session-event": { actions: "forwardSessionEvent" },
    "transport-event": { actions: "forwardTransportEvent" },
    "conversation-store-event": { actions: "forwardConversationStoreEvent" },
    "transport-session-event": {
      actions: ["forwardChildSessionEvent", "forwardSessionToConversationStore"],
    },
    "conversation-store-session-event": { actions: "forwardChildSessionEvent" },
    "conversation-store-transport-event": { actions: "forwardConversationStoreTransportEvent" },
  },
});
