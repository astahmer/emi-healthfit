// @ts-ignore R0 target entrypoint is implemented in a later packet.
import { createChatRuntime } from "@emi/core/runtime";
// @ts-ignore R0 target entrypoint is implemented in a later packet.
import type { ChatRuntimeOptions, Selector } from "@emi/core/runtime";

declare const options: ChatRuntimeOptions;
const runtime = createChatRuntime(options);
const activeThread: Selector<unknown> = runtime.selectors.activeThread;

runtime.start();
runtime.actions.sendMessage({ text: "hello" });
runtime.actions.selectConversation({ conversationId: "conversation-1" });
runtime.actions.stop();
runtime.dispose();
void activeThread;
