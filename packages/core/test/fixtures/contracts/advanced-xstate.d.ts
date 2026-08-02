import type { AnyActorLogic, ActorRef } from "xstate";
import type { ChatRuntimeOptions } from "./runtime";

export type ChatRuntimeActorRef = ActorRef<AnyActorLogic>;
export declare const chatRuntimeMachine: AnyActorLogic;
export declare const createChatRuntimeActor: (options: ChatRuntimeOptions) => ChatRuntimeActorRef;
