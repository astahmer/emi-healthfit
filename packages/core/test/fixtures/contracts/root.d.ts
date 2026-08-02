import type {
  ChatActions as RuntimeChatActions,
  ChatRuntime as RuntimeChatRuntime,
  ChatRuntimeOptions as RuntimeChatRuntimeOptions,
  ChatSelectors as RuntimeChatSelectors,
  Selector as RuntimeSelector,
} from "./runtime";
import { createChatRuntime as createRuntime } from "./runtime";
import type {
  ChatMessage as ProtocolChatMessage,
  MessagePart as ProtocolMessagePart,
} from "./protocol";

export const createChatRuntime: typeof createRuntime;
export type ChatActions = RuntimeChatActions;
export type ChatRuntime = RuntimeChatRuntime;
export type ChatRuntimeOptions = RuntimeChatRuntimeOptions;
export type ChatSelectors = RuntimeChatSelectors;
export type Selector = RuntimeSelector;
export type ChatMessage = ProtocolChatMessage;
export type MessagePart = ProtocolMessagePart;
