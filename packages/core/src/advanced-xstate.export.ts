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
import { genericChatAppMachine as chatRuntimeMachine } from "./web/chat-runtime/generic-chat-app-machine.ts";
import type {
  GenericChatAppEvent,
  GenericChatAppInput,
} from "./web/chat-runtime/generic-chat-app-machine.ts";

export {
  assign,
  chatRuntimeMachine,
  createActor,
  createChatRuntimeActor,
  createMachine,
  fromCallback,
  fromPromise,
  sendTo,
  setup,
  spawnChild,
  stopChild,
};

export type {
  ActorRef,
  ActorRefFrom,
  AnyActorLogic,
  AnyStateMachine,
  EventFrom,
  GenericChatAppEvent,
  GenericChatAppInput,
  SnapshotFrom,
};
