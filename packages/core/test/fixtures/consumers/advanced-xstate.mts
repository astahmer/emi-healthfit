// @ts-ignore R0 target entrypoint is implemented in a later packet.
import { chatRuntimeMachine, createChatRuntimeActor } from "@emi/core/advanced/xstate";
// @ts-ignore R0 target entrypoint is implemented in a later packet.
import type { ChatRuntimeActorRef } from "@emi/core/advanced/xstate";
// @ts-ignore R0 target entrypoint is implemented in a later packet.
import type { ChatRuntimeOptions } from "@emi/core/runtime";

declare const options: ChatRuntimeOptions;
const actor: ChatRuntimeActorRef = createChatRuntimeActor(options);
actor.send({ type: "chat.start" });
void chatRuntimeMachine;
