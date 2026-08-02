import { chatRuntimeMachine, createChatRuntimeActor } from "@emi/core/advanced/xstate";
import type { ChatRuntimeActorRef } from "@emi/core/advanced/xstate";
import type { ChatRuntimeOptions } from "@emi/core/runtime";

declare const options: ChatRuntimeOptions;
const actor: ChatRuntimeActorRef = createChatRuntimeActor(options);
actor.send({ type: "chat.start" });
void chatRuntimeMachine;
