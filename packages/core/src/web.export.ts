import {
  AttachmentValidationError,
  prepareAttachmentParts,
  prepareAttachments,
  validateAttachments,
} from "./web/attachments/attachments.ts";
import { attachmentPreparationMachine } from "./web/attachments/attachment-preparation-actor.ts";
import type {
  AttachmentPreparationContext,
  AttachmentPreparationEvent,
  AttachmentPreparationInput,
} from "./web/attachments/attachment-preparation-actor.ts";
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
import {
  createConversationClient,
  type Conversation,
  type ConversationClient,
  type ConversationThread,
  type Memory,
} from "./web/chat-runtime/conversation-client.ts";
import type {
  ChatMessageEncoder,
  ChatStreamDecoder,
  ChatTransportErrorDecoder,
} from "./web/chat-runtime/transport-types.ts";
import type { MemorySummary } from "./protocol/resources.ts";
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
import {
  createBrowserFollowUpQueueSyncAdapter,
  FOLLOW_UP_QUEUE_CHANNEL,
  FOLLOW_UP_QUEUE_STORAGE_MAX_CHARS,
  FOLLOW_UP_QUEUE_STORAGE_PREFIX,
  followUpQueueStorageKey,
  parseFollowUpQueueChannelMessage,
  parseFollowUpQueueSync,
  parseFollowUpQueueSyncJson,
  readStoredFollowUpQueue,
  serializeFollowUpQueue,
  stripHeavyQueueAttachments,
  writeStoredFollowUpQueue,
} from "./web/chat-runtime/browser-queue-sync.ts";
import {
  resolveQueueEditTarget,
  shouldHandleQueueArrowKey,
} from "./web/chat-runtime/follow-up-queue-navigation.ts";
import {
  GenerationAlreadyRunningError,
  OrphanTurnError,
  parseChatConflictError,
} from "./web/chat-conflict-errors.ts";
import type { QueueEditNavigationState } from "./web/chat-runtime/follow-up-queue-navigation.ts";
import type {
  SessionMessage,
  SessionMessageUsage,
  SessionThread,
} from "./web/session-cache.ts";
import {
  decodeConversationRow,
  decodeConversationSnapshot,
  decodeThreadRow,
} from "./web/conversation-snapshot.ts";
import { FallbackResult } from "./web/thread/tool-result-content.tsx";
import {
  chatMessageText,
  hasVisibleChatContent,
  toThreadMessageValue,
} from "./web/thread/chat-message-adapter.ts";
import {
  ComposerError,
  ComposerQueue,
} from "./web/thread/composer-sections.tsx";
import {
  messageEditorMachine,
  type MessageEditorContext,
  type MessageEditorEvent,
} from "./web/thread/message-editor-machine.ts";
import type {
  ChatConversation,
  ChatMessageNode,
  ChatThreadView,
  ConversationSnapshotData,
} from "./web/conversation-snapshot.ts";
import { conversationMachine } from "./web/conversation/conversation-machine.ts";
import type {
  CompactConversationConfig,
  ConversationContext,
  ConversationEvent,
  ConversationLoadOutput,
  ConversationMachineInput,
  ViewMode,
} from "./web/conversation/conversation-machine.ts";
import { sidebarItemMachine } from "./web/sidebar/sidebar-item-machine.ts";
import type {
  SidebarItemContext,
  SidebarItemEvent,
  SidebarItemInput,
} from "./web/sidebar/sidebar-item-machine.ts";
import { createDefaultChatErrorDecoder } from "./web/chat-runtime/default-error-decoder.ts";
import {
  clearSessionCache,
  deleteCachedThread,
  getCachedConversationSnapshot,
  getCachedMessages,
  getCachedThreads,
  mergeCachedThreads,
  setCachedConversation,
  setCachedConversationSnapshot,
  setCachedThreads,
  updateCachedThread,
} from "./web/session-cache.ts";
import type {
  ComposerControls,
  ComposerModelOption,
  ThreadViewportProps,
} from "./web/thread/types.ts";
import {
  threadViewportActor,
  threadViewportNeedsInitialPosition,
} from "./web/thread/thread-viewport-actor.ts";
import {
  isSafeAttachmentUrl,
  isSafeMarkdownHref,
  shouldRenderMarkdownImage,
} from "./web/thread/markdown-url-policy.ts";

export {
  ChatThreadScroll,
  createBrowserFollowUpQueueSyncAdapter,
  AttachmentValidationError,
  attachmentPreparationMachine,
  type AttachmentPreparationContext,
  type AttachmentPreparationEvent,
  type AttachmentPreparationInput,
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
  threadViewportActor,
  threadViewportNeedsInitialPosition,
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
  FOLLOW_UP_QUEUE_CHANNEL,
  FOLLOW_UP_QUEUE_STORAGE_MAX_CHARS,
  FOLLOW_UP_QUEUE_STORAGE_PREFIX,
  followUpQueueStorageKey,
  parseFollowUpQueueChannelMessage,
  parseFollowUpQueueSync,
  parseFollowUpQueueSyncJson,
  readStoredFollowUpQueue,
  serializeFollowUpQueue,
  stripHeavyQueueAttachments,
  writeStoredFollowUpQueue,
  resolveQueueEditTarget,
  shouldHandleQueueArrowKey,
  GenerationAlreadyRunningError,
  OrphanTurnError,
  parseChatConflictError,
  createDefaultChatErrorDecoder,
  clearSessionCache,
  deleteCachedThread,
  getCachedConversationSnapshot,
  getCachedMessages,
  getCachedThreads,
  mergeCachedThreads,
  setCachedConversation,
  setCachedConversationSnapshot,
  setCachedThreads,
  updateCachedThread,
  sidebarItemMachine,
  decodeConversationSnapshot,
  decodeConversationRow,
  decodeThreadRow,
  conversationMachine,
  FallbackResult,
  chatMessageText,
  hasVisibleChatContent,
  toThreadMessageValue,
  messageEditorMachine,
  ComposerError,
  ComposerQueue,
};

export type {
  MessageEditorContext,
  MessageEditorEvent,
  CompactConversationConfig,
  ConversationContext,
  ConversationEvent,
  ConversationLoadOutput,
  ConversationMachineInput,
  ViewMode,
  QueueEditNavigationState,
  ChatConversation,
  ChatMessageNode,
  ChatThreadView,
  ConversationSnapshotData,
  SidebarItemContext,
  SidebarItemEvent,
  SidebarItemInput,
  SessionMessage,
  SessionMessageUsage,
  SessionThread,
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
  ChatStreamDecoder,
  ChatTransportErrorDecoder,
  ChatMessageEncoder,
  Conversation,
  ConversationClient,
  ConversationThread,
  Memory,
  MemorySummary,
};
