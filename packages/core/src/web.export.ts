import { prepareAttachments, validateAttachments } from "./web/attachments/attachments.ts";
import { createAnonymousSessionFetch, startAnonymousSession } from "./web/auth/anonymous-session.ts";
import { ChatShell } from "./web/chat-shell.tsx";
import { chatSessionMachine, initialChatSession } from "./web/chat-session-machine.ts";
import {
  CoreWebProvider,
  useCoreWebContributions,
  useToolRenderer,
} from "./web/contributions.tsx";
import type {
  CoreWebContributions,
  NavContribution,
  PageContribution,
  ResolvedCoreWebContributions,
  ToolRendererContribution,
} from "./web/contributions.tsx";
import {
  conversationMarkdown,
} from "./web/conversation/conversation-markdown.ts";
import {
  getChildMessages,
  getConversationViewMessages,
  getMessageAncestors,
  getMessagePath,
  getMessageText,
  getRootMessages,
  getThreadMessages,
  searchMessages,
} from "./web/conversation/conversation-tree.ts";
import type {
  ConversationMessageNode,
  ConversationMessagePart,
  ConversationThreadView,
} from "./web/conversation/types.ts";
import { createChatRuntimeActor } from "./runtime/create-chat-runtime.ts";
import { conversationStoreActor } from "./web/chat-runtime/conversation-store-actor.ts";
import { createConversationClient } from "./web/chat-runtime/conversation-client.ts";
import { chatTransportActor } from "./web/chat-runtime/chat-transport-actor.ts";
import { genericChatAppMachine } from "./web/chat-runtime/generic-chat-app-machine.ts";
import { browserStateActor } from "./web/chat-runtime/browser-state-actor.ts";
import { chatUiActor } from "./web/chat-runtime/chat-ui-actor.ts";
import { settingsActor } from "./web/chat-runtime/settings-actor.ts";
import type {
  ChatTransportActorInput,
  ChatTransportRequest,
} from "./web/chat-runtime/chat-transport-actor.ts";
import type { GenericChatAppEvent, GenericChatAppInput } from "./web/chat-runtime/generic-chat-app-machine.ts";
import { MarkdownText } from "./web/thread/markdown-text.tsx";
import { MessagePart } from "./web/thread/message-part.tsx";
import { SuggestionChips } from "./web/thread/suggestion-chips.tsx";
import { ThreadViewport } from "./web/thread/thread-viewport.tsx";
import { ToolPart } from "./web/thread/tool-part.tsx";
import type { MessagePartValue } from "./web/thread/tool-part.tsx";
import { ToolResultContent } from "./web/thread/tool-result-content.tsx";
import type {
  ComposerControls,
  ComposerModelOption,
  ThreadViewportProps,
} from "./web/thread/types.ts";
import {
  isSafeAttachmentUrl,
  isSafeMarkdownHref,
  shouldRenderMarkdownImage,
} from "./web/thread/markdown-url-policy.ts";

export {
  browserStateActor,
  ChatShell,
  chatSessionMachine,
  chatTransportActor,
  chatUiActor,
  conversationMarkdown,
  conversationStoreActor,
  CoreWebProvider,
  createAnonymousSessionFetch,
  createChatRuntimeActor,
  createConversationClient,
  genericChatAppMachine,
  getChildMessages,
  getConversationViewMessages,
  getMessageAncestors,
  getMessagePath,
  getMessageText,
  getRootMessages,
  getThreadMessages,
  initialChatSession,
  isSafeAttachmentUrl,
  isSafeMarkdownHref,
  MarkdownText,
  MessagePart,
  prepareAttachments,
  searchMessages,
  settingsActor,
  shouldRenderMarkdownImage,
  startAnonymousSession,
  SuggestionChips,
  ThreadViewport,
  ToolPart,
  ToolResultContent,
  useCoreWebContributions,
  useToolRenderer,
  validateAttachments,
};

export type {
  ChatTransportActorInput,
  ChatTransportRequest,
  ComposerControls,
  ComposerModelOption,
  ConversationMessageNode,
  ConversationMessagePart,
  ConversationThreadView,
  CoreWebContributions,
  GenericChatAppEvent,
  GenericChatAppInput,
  MessagePartValue,
  NavContribution,
  PageContribution,
  ResolvedCoreWebContributions,
  ThreadViewportProps,
  ToolRendererContribution,
};
