import { sendTo, setup } from "xstate";

import { chatSessionMachine, type ChatSessionEvent } from "../chat-session-machine.ts";
import {
  chatTransportActor,
  type ChatTransportActorEvent,
  type ChatTransportActorInput,
} from "./chat-transport-actor.ts";

export interface GenericChatAppInput extends Pick<
  ChatTransportActorInput,
  "api" | "createId" | "fetch"
> {}

export type GenericChatAppEvent =
  | { type: "session-event"; event: ChatSessionEvent }
  | { type: "transport-event"; event: ChatTransportActorEvent }
  | { type: "transport-session-event"; event: ChatSessionEvent };

export const genericChatAppMachine = setup({
  types: {
    context: {} as GenericChatAppInput,
    input: {} as GenericChatAppInput,
    events: {} as GenericChatAppEvent,
  },
  actors: {
    session: chatSessionMachine,
    transport: chatTransportActor,
  },
  actions: {
    forwardSessionEvent: sendTo("session", ({ event }) =>
      event.type === "session-event" ? event.event : { type: "fresh-started" },
    ),
    forwardTransportEvent: sendTo("transport", ({ event }) =>
      event.type === "transport-event" ? event.event : { type: "stream-cancelled" },
    ),
    forwardTransportSessionEvent: sendTo("session", ({ event }) =>
      event.type === "transport-session-event" ? event.event : { type: "fresh-started" },
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
  ],
  on: {
    "session-event": { actions: "forwardSessionEvent" },
    "transport-event": { actions: "forwardTransportEvent" },
    "transport-session-event": { actions: "forwardTransportSessionEvent" },
  },
});
