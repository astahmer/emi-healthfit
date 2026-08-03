import {
  AttachmentValidationError,
  prepareAttachmentParts,
  prepareAttachments,
  validateAttachments,
} from "./web/attachments/attachments.ts";
import { AnonymousSession } from "./web/auth/anonymous-session.ts";
import { AuthSession } from "./web/auth/auth-session.ts";
import { WebMcp } from "./web/webmcp.ts";
import type { WebMcpModelContext } from "./web/webmcp.ts";
import { ChatShell } from "./web/chat-shell.tsx";
import {
  CoreWebProvider,
  useComponentRenderer,
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
import { decodeDynamicComponent, DynamicComponentRenderer } from "./web/dynamic-components.tsx";
import type {
  ComponentRendererContribution,
  DynamicComponentRendererProps,
} from "./web/dynamic-components.tsx";
import { conversationMarkdown } from "./web/conversation/conversation-markdown.ts";
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
import { createConversationClient } from "./web/chat-runtime/conversation-client.ts";
import { MarkdownText } from "./web/thread/markdown-text.tsx";
import { MessagePart } from "./web/thread/message-part.tsx";
import { SuggestionChips } from "./web/thread/suggestion-chips.tsx";
import { ThreadViewport } from "./web/thread/thread-viewport.tsx";
import { ToolPart } from "./web/thread/tool-part.tsx";
import type { MessagePartValue } from "./web/thread/tool-part.tsx";
import { ToolResultContent } from "./web/thread/tool-result-content.tsx";
import { ThreadMessage } from "./web/thread/thread-message.tsx";
import type {
  ThreadMessageMetadata,
  ThreadMessageProps,
  ThreadMessageValue,
} from "./web/thread/thread-message.tsx";
import { useIsMobile } from "./web/use-mobile.ts";
import { ChatThreadScroll } from "./web/thread/chat-thread-scroll.ts";
import { MessageRail, formatMessageRailTime } from "./web/thread/message-rail.tsx";
import type { MessageRailItem } from "./web/thread/message-rail.tsx";
import {
  ThreadViewportScroll,
  useThreadViewportScroll,
} from "./web/thread/use-thread-viewport-scroll.ts";
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
  ChatThreadScroll,
  AttachmentValidationError,
  ChatShell,
  conversationMarkdown,
  CoreWebProvider,
  decodeDynamicComponent,
  DynamicComponentRenderer,
  AnonymousSession,
  AuthSession,
  createConversationClient,
  getChildMessages,
  getConversationViewMessages,
  getMessageAncestors,
  getMessagePath,
  getMessageText,
  getRootMessages,
  getThreadMessages,
  isSafeAttachmentUrl,
  isSafeMarkdownHref,
  MarkdownText,
  MessageRail,
  MessagePart,
  prepareAttachments,
  prepareAttachmentParts,
  searchMessages,
  shouldRenderMarkdownImage,
  SuggestionChips,
  ThreadMessage,
  ThreadViewport,
  ThreadViewportScroll,
  ToolPart,
  ToolResultContent,
  useCoreWebContributions,
  useComponentRenderer,
  useIsMobile,
  useThreadViewportScroll,
  useToolRenderer,
  formatMessageRailTime,
  validateAttachments,
  WebMcp,
};

export type {
  ComposerControls,
  ComponentRendererContribution,
  ComposerModelOption,
  ConversationMessageNode,
  ConversationMessagePart,
  ConversationThreadView,
  CoreWebContributions,
  MessagePartValue,
  MessageRailItem,
  ThreadMessageMetadata,
  ThreadMessageProps,
  ThreadMessageValue,
  NavContribution,
  PageContribution,
  ResolvedCoreWebContributions,
  ThreadViewportProps,
  ToolRendererContribution,
  DynamicComponentRendererProps,
  WebMcpModelContext,
};
