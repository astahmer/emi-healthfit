// @ts-ignore R0 target entrypoint is implemented in a later packet.
import { ChatProvider, useChatActions, useChatSelector } from "@emi/core/react";
// @ts-ignore R0 target entrypoint is implemented in a later packet.
import type { ChatRuntime } from "@emi/core/runtime";

declare const runtime: ChatRuntime;

const Consumer = () => {
  const thread = useChatSelector((state: { activeThread: { id?: string } }) => state.activeThread);
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
