import { createChatRuntime } from "@emi/core/runtime";
import type { ChatRuntimeOptions, Selector } from "@emi/core/runtime";

declare const options: ChatRuntimeOptions;
const runtime = createChatRuntime(options);
const activeThread: Selector<unknown> = runtime.selectors.activeThread;
const conversations: Selector<unknown> = runtime.selectors.conversations;

runtime.start();
runtime.actions.sendMessage({ text: "hello" });
runtime.actions.selectConversation({ conversationId: "conversation-1" });
runtime.actions.setDraft({ text: "draft" });
runtime.actions.startNewConversation();
runtime.actions.setSidebarOpen({ open: false });
void runtime.getState();
runtime.actions.stop();
runtime.dispose();
void activeThread;
void conversations;
