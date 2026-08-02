import type { ReactNode } from "react";
import type { ChatMessage, MessagePart } from "./protocol";

export declare const Message: (props: {
  readonly message: ChatMessage;
  readonly renderPart?: (part: MessagePart) => ReactNode;
}) => ReactNode;

export declare const MessagePart: (props: { readonly part: MessagePart }) => ReactNode;
export declare const ThreadViewport: (props: {
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly children?: ReactNode;
}) => ReactNode;
export declare const Composer: (props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
}) => ReactNode;
export declare const ConversationList: (props: {
  readonly conversations: ReadonlyArray<{ readonly id: string; readonly title: string }>;
  readonly onSelect: (conversationId: string) => void;
}) => ReactNode;
export declare const Sidebar: (props: { readonly children?: ReactNode }) => ReactNode;
export declare const Dialog: (props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly children?: ReactNode;
}) => ReactNode;

export declare const ConnectedThread: () => ReactNode;
export declare const ConnectedComposer: () => ReactNode;
export declare const ConnectedSidebar: () => ReactNode;
