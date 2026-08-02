import { ChatProvider, useChatActions, useChatSelector } from "@emi/core/react";
import type { ChatRuntime } from "@emi/core/runtime";

declare const runtime: ChatRuntime;

const Consumer = () => {
  const thread = useChatSelector((state) => state.activeThread);
  const actions = useChatActions();
  actions.sendMessage({ text: thread.id ?? "hello" });
  return null;
};

const tree = (
  <ChatProvider runtime={runtime}>
    <Consumer />
  </ChatProvider>
);

void tree;
