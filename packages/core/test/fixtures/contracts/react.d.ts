import type { ReactNode } from "react";
import type { ChatActions, ChatRuntime, Selector } from "./runtime";

export declare const ChatProvider: (props: {
  readonly runtime: ChatRuntime;
  readonly children?: ReactNode;
}) => ReactNode;

export declare const useChatSelector: <Value>(selector: Selector<Value>) => Value;
export declare const useChatActions: () => ChatActions;
export declare const useChatRuntime: () => ChatRuntime;
