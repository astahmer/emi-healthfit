import {
  assign,
  createActor,
  createMachine,
  fromCallback,
  fromPromise,
  sendTo,
  setup,
  spawnChild,
  stopChild,
} from "xstate";
import type {
  ActorRef,
  ActorRefFrom,
  AnyActorLogic,
  AnyStateMachine,
  EventFrom,
  SnapshotFrom,
} from "xstate";
import { createChatRuntimeActor } from "./runtime/create-chat-runtime.ts";
import { chatSessionMachine } from "./web/chat-session-machine.ts";
import { browserStateActor } from "./web/chat-runtime/browser-state-actor.ts";
import { chatTransportActor } from "./web/chat-runtime/chat-transport-actor.ts";
import type {
  ChatTransportActorInput,
  ChatTransportRequest,
} from "./web/chat-runtime/transport-types.ts";
import { chatUiActor } from "./web/chat-runtime/chat-ui-actor.ts";
import { conversationStoreActor } from "./web/chat-runtime/conversation-store-actor.ts";
import { genericChatAppMachine as chatRuntimeMachine } from "./web/chat-runtime/generic-chat-app-machine.ts";
import { settingsActor } from "./web/chat-runtime/settings-actor.ts";
import type {
  GenericChatAppEvent,
  GenericChatAppInput,
} from "./web/chat-runtime/generic-chat-app-machine.ts";

export {
  assign,
  browserStateActor,
  chatRuntimeMachine,
  chatSessionMachine,
  chatTransportActor,
  chatUiActor,
  conversationStoreActor,
  createActor,
  createChatRuntimeActor,
  createMachine,
  fromCallback,
  fromPromise,
  sendTo,
  setup,
  settingsActor,
  spawnChild,
  stopChild,
};

export type {
  ActorRef,
  ActorRefFrom,
  AnyActorLogic,
  AnyStateMachine,
  ChatTransportActorInput,
  ChatTransportRequest,
  EventFrom,
  GenericChatAppEvent,
  GenericChatAppInput,
  SnapshotFrom,
};
