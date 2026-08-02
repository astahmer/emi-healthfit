"use client";

import { useState, type FormEvent } from "react";
import type { UIMessage } from "ai";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookmarkIcon,
  BrainIcon,
  GlobeIcon,
  GhostIcon,
  PaperclipIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMachine } from "@xstate/react";
import { assign, setup } from "xstate";
import {
  ChatThreadScroll,
  MessageRail,
  SuggestionChips,
  ThreadMessage,
  useThreadViewportScroll,
  type ComposerControls as CoreComposerControls,
  type ThreadMessageValue,
} from "@emi/core/web";
import { Button } from "@/components/ui/button";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useChatRuntime } from "@/app/chat/chat-runtime-context";
import { resolveQueueEditTarget, shouldHandleQueueArrowKey } from "@/app/chat/follow-up-queue";
import type { ChatModel } from "@/app/models";
import { fetchSuggestions } from "@/app/suggestions";
import { useSettings } from "@/app/settings-store";
import { useUsage } from "@/app/usage-context";
import { chatModels } from "@/app/models";
import { queryKeys } from "@/app/query-cache";
import {
  deleteMemoriesByMessage,
  extractMemories,
  fetchMemories,
  memoryProvenance,
} from "@/app/memories";
import { notifyMemoriesChanged } from "@/app/memory-events";
import { useActionFeedback } from "@/app/action-feedback";
import { ToolResultContent } from "@/components/chat/tool-result-content";

export type ComposerControls = Omit<CoreComposerControls, "onKeepTemporary" | "models"> & {
  onKeepTemporary: (messages: UIMessage[]) => Promise<void>;
  models: ChatModel[];
};

const suggestions = [
  "How is my recovery today?",
  "Summarize my last workout.",
  "What's my current workout streak?",
  "Show my progress on bench press over the last 8 weeks.",
];

const messageEditorMachine = setup({
  types: {
    context: {} as { messageId: string | null; draft: string },
    events: {} as
      | { type: "edit.start"; messageId: string; draft: string }
      | { type: "edit.change"; draft: string }
      | { type: "edit.cancel" },
  },
}).createMachine({
  initial: "idle",
  context: { messageId: null, draft: "" },
  states: {
    idle: {
      on: {
        "edit.start": {
          target: "editing",
          actions: assign(({ event }) => ({ messageId: event.messageId, draft: event.draft })),
        },
      },
    },
    editing: {
      on: {
        "edit.change": { actions: assign(({ event }) => ({ draft: event.draft })) },
        "edit.cancel": {
          target: "idle",
          actions: assign({ messageId: () => null, draft: () => "" }),
        },
      },
    },
  },
});

const getText = (message: UIMessage | undefined): string =>
  message?.parts.reduce(
    (text, part) => (part.type === "text" ? `${text}${text === "" ? "" : "\n"}${part.text}` : text),
    "",
  ) ?? "";

const toThreadMessage = (message: UIMessage): ThreadMessageValue => ({
  id: message.id,
  role: message.role,
  parts: message.parts,
});

const StreamingIndicator = () => (
  <span
    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
    role="status"
    aria-label="Assistant is working"
  >
    <span>Thinking</span>
    <span className="typing-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  </span>
);

const FollowUpSuggestions = () => {
  const runtime = useChatRuntime();
  const settings = useSettings((state) => state.settings);
  const lastAssistantIndex = runtime.messages.findLastIndex(
    (message) => message.role === "assistant",
  );
  const lastAssistant = runtime.messages[lastAssistantIndex];
  const lastUser = runtime.messages
    .slice(0, lastAssistantIndex)
    .findLast((message) => message.role === "user");
  const lastAssistantText = getText(lastAssistant);
  const query = useQuery({
    queryKey: queryKeys.suggestions.message({
      assistantId: lastAssistant?.id,
      assistantText: lastAssistantText,
      userText: getText(lastUser),
    }),
    queryFn: () =>
      fetchSuggestions({
        threadId: runtime.sessionId,
        messageId: lastAssistant?.id,
        lastAssistantText,
        lastUserText: getText(lastUser),
        config: {
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl || undefined,
          model: settings.model,
        },
      }),
    enabled: !runtime.isStreaming && lastAssistantText !== "",
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (query.data === undefined || query.data.length === 0) return null;
  return (
    <div className="pl-3">
      <SuggestionChips
        suggestions={query.data}
        disabled={runtime.isStreaming}
        onSelect={(suggestion) => void runtime.submit(suggestion)}
      />
    </div>
  );
};

export const Thread = ({
  composerControls,
  contextSummary,
  onForkMessage,
  onReferenceMessage,
}: {
  composerControls: ComposerControls;
  contextSummary?: string;
  onForkMessage?: (messageId: string) => void;
  onReferenceMessage?: (messageId: string) => void;
}) => {
  const runtime = useChatRuntime();
  const settings = useSettings((state) => state.settings);
  const feedback = useActionFeedback();
  const [editorState, sendEditor] = useMachine(messageEditorMachine);
  const [memoryMessageId, setMemoryMessageId] = useState<string | null>(null);
  const [isKeepingTemporary, setIsKeepingTemporary] = useState(false);
  const usage = useUsage();
  const userRailMessages = runtime.messages
    .filter((message) => message.role === "user")
    .map((message) => ({
      id: message.id,
      text: getText(message),
      createdAt: usage.metaByMessageId.get(message.id)?.createdAt,
    }));
  const {
    viewportRef,
    isAwayFromTop,
    isAwayFromBottom,
    canScrollToPreviousUserMessage,
    scrollToTop,
    scrollToBottom,
    scrollToMessage,
    scrollToPreviousUserMessage,
  } = useThreadViewportScroll({
    sessionId: runtime.sessionId,
    messageCount: runtime.messages.length,
    userMessageIds: userRailMessages.map((message) => message.id),
  });
  const canKeepTemporary = composerControls.temporary && runtime.messages.length > 0;
  const { data: conversationMemories = [] } = useQuery({
    queryKey: queryKeys.memories.messageSources,
    queryFn: () => fetchMemories(),
    enabled: runtime.sessionId !== undefined,
  });
  const savedMemoryMessageIds = new Set(
    conversationMemories.flatMap((memory) => {
      const messageId = memoryProvenance(memory).messageId;
      return messageId === undefined ? [] : [messageId];
    }),
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void runtime.submit();
  };
  const rememberMessage = async (message: UIMessage) => {
    const text = getText(message).trim();
    if (text === "") return;
    setMemoryMessageId(message.id);
    try {
      if (savedMemoryMessageIds.has(message.id)) {
        await deleteMemoriesByMessage(message.id);
        feedback.show({ kind: "success", message: "Removed message memories." });
        return;
      }
      const ids = await extractMemories({
        text,
        threadId: runtime.sessionId,
        messageId: message.id,
        source: "manual",
        config: {
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl || undefined,
          model: settings.model,
        },
      });
      feedback.show({
        kind: "success",
        message:
          ids.length === 0
            ? "Nothing new to save to memory."
            : `Saved ${ids.length} memor${ids.length === 1 ? "y" : "ies"}.`,
      });
    } catch {
      feedback.show({ kind: "error", message: "Could not save memories." });
    } finally {
      setMemoryMessageId(null);
      notifyMemoriesChanged();
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
      {runtime.isStreaming && (
        <div className="sr-only" role="status" aria-live="polite">
          Assistant is responding
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <MessageRail
          messages={userRailMessages}
          onSelect={(messageId) => scrollToMessage({ messageId })}
          canScrollToPreviousUserMessage={canScrollToPreviousUserMessage}
          onScrollToPreviousUserMessage={scrollToPreviousUserMessage}
        />
        {(isAwayFromTop || isAwayFromBottom) && (
          <div className="pointer-events-none absolute right-3 bottom-3 z-10 flex flex-col gap-2 sm:right-4">
            {isAwayFromTop && (
              <TooltipIconButton
                tooltip="Scroll to oldest"
                side="left"
                type="button"
                data-testid="scroll-to-top"
                className="pointer-events-auto size-8 rounded-full border bg-background/95 shadow-sm"
                onClick={scrollToTop}
              >
                <ArrowUpIcon className="size-4" />
              </TooltipIconButton>
            )}
            {isAwayFromBottom && (
              <TooltipIconButton
                tooltip="Scroll to newest"
                side="left"
                type="button"
                data-testid="scroll-to-bottom"
                className="pointer-events-auto size-8 rounded-full border bg-background/95 shadow-sm"
                onClick={scrollToBottom}
              >
                <ArrowDownIcon className="size-4" />
              </TooltipIconButton>
            )}
          </div>
        )}
        <div
          ref={viewportRef}
          className="h-full overflow-y-auto"
          role="log"
          aria-relevant="additions"
          data-testid="chat-thread-viewport"
          data-scroll-restoration-id={ChatThreadScroll.elementId}
        >
          <div className="mx-auto flex min-h-full w-full min-w-0 max-w-4xl flex-col gap-6 px-3 py-6 sm:px-6 sm:py-8">
            {contextSummary !== undefined && (
              <aside
                className="rounded-xl border bg-muted/40 px-4 py-3 text-sm"
                aria-label="Compacted context"
              >
                <p className="font-medium">Compacted context</p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{contextSummary}</p>
              </aside>
            )}
            {runtime.messages.length === 0 && contextSummary === undefined ? (
              <div className="my-auto space-y-6 text-center">
                <div>
                  <h1 className="text-2xl font-semibold">What are we working on?</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Ask about training, recovery, sleep, or progress.
                  </p>
                </div>
                <div className="mx-auto grid max-w-xl gap-2 sm:grid-cols-2">
                  {suggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      className="h-auto justify-start whitespace-normal p-3 text-left"
                      onClick={() => void runtime.submit(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {runtime.messages.map((message, index) => (
                  <ThreadMessage
                    key={message.id}
                    message={toThreadMessage(message)}
                    isStreaming={
                      runtime.isStreaming &&
                      index === runtime.messages.length - 1 &&
                      message.role === "assistant"
                    }
                    assistantLabel="Coach"
                    metadata={{
                      modelLabel: chatModels.find(
                        (candidate) =>
                          candidate.id === usage.metaByMessageId.get(message.id)?.model,
                      )?.label,
                      totalTokens: usage.usageByMessageId.get(message.id)?.totalTokens ?? undefined,
                      createdAt: usage.metaByMessageId.get(message.id)?.createdAt,
                    }}
                    onFork={onForkMessage}
                    onRemember={(selectedMessage) => {
                      const source = runtime.messages.find(
                        (candidate) => candidate.id === selectedMessage.id,
                      );
                      if (source !== undefined) return rememberMessage(source);
                    }}
                    isRemembered={savedMemoryMessageIds.has(message.id)}
                    isRemembering={memoryMessageId === message.id}
                    editingDraft={
                      editorState.context.messageId === message.id
                        ? editorState.context.draft
                        : undefined
                    }
                    onEditStart={(selectedMessage) => {
                      const source = runtime.messages.find(
                        (candidate) => candidate.id === selectedMessage.id,
                      );
                      if (source === undefined) return;
                      sendEditor({
                        type: "edit.start",
                        messageId: source.id,
                        draft: getText(source),
                      });
                    }}
                    onEditChange={(draft) => sendEditor({ type: "edit.change", draft })}
                    onEditCancel={() => sendEditor({ type: "edit.cancel" })}
                    onEditSubmit={() => {
                      void runtime.revise({
                        messageId: message.id,
                        text: editorState.context.draft,
                      });
                      sendEditor({ type: "edit.cancel" });
                    }}
                    onRegenerate={(messageId) => void runtime.revise({ messageId })}
                    onReferenceMessage={onReferenceMessage}
                    error={
                      runtime.errorMessageId === message.id
                        ? (runtime.error ?? undefined)
                        : undefined
                    }
                    onRetry={(messageId) => void runtime.revise({ messageId })}
                    retryDisabled={runtime.isRetrying || runtime.isStreaming}
                    onCopyResult={({ ok }) => {
                      feedback.show(
                        ok
                          ? { kind: "success", message: "Message copied." }
                          : { kind: "error", message: "Could not copy message." },
                      );
                    }}
                    renderToolResult={({ toolName, result }) => (
                      <ToolResultContent toolName={toolName} result={result} className="mt-2" />
                    )}
                  />
                ))}
                {runtime.isStreaming && runtime.messages.at(-1)?.role !== "assistant" && (
                  <Message align="start" aria-live="polite" className="py-1">
                    <MessageContent>
                      <Bubble align="start" variant="ghost">
                        <BubbleContent>
                          <StreamingIndicator />
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                )}
              </>
            )}
            <FollowUpSuggestions />
          </div>
        </div>
      </div>

      <div className="min-w-0 bg-gradient-to-t from-background via-background to-transparent px-2 pt-3 pb-[calc(.5rem+env(safe-area-inset-bottom))] sm:px-3 sm:pt-5 sm:pb-3">
        <form
          onSubmit={submit}
          className="mx-auto w-full min-w-0 max-w-4xl rounded-[1.2rem] border bg-background/95 p-1.5 shadow-[0_12px_40px_-18px_color-mix(in_oklab,var(--foreground)_28%,transparent)] backdrop-blur-xl focus-within:border-ring/50 focus-within:ring-4 focus-within:ring-ring/10 sm:rounded-[1.35rem] sm:p-2"
        >
          {runtime.files.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2 pb-2">
              {runtime.files.map((file) => (
                <div
                  key={file.url}
                  className="flex max-w-56 items-center gap-2 rounded-md border bg-background p-1 text-xs"
                >
                  {file.mediaType.startsWith("image/") && (
                    <img src={file.url} alt="" className="size-10 rounded object-cover" />
                  )}
                  <span className="truncate">{file.filename ?? "Attachment"}</span>
                  <button
                    type="button"
                    onClick={() => runtime.removeFile(file.url)}
                    aria-label={`Remove ${file.filename ?? "attachment"}`}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {runtime.isPreparingAttachments && (
            <p className="px-3 pb-2 text-xs text-muted-foreground">Optimizing attachments…</p>
          )}
          {runtime.attachmentError !== null && (
            <p className="px-3 pb-2 text-xs text-destructive">{runtime.attachmentError}</p>
          )}
          {runtime.queuedFollowUps.length > 0 && (
            <div className="mx-2 mb-2 space-y-1.5" aria-label="Queued follow-ups">
              {runtime.queuedFollowUps.map((item, index) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
                    runtime.editingQueuedId === item.id
                      ? "bg-primary/10 text-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {index + 1}.{" "}
                    {item.text.trim() === ""
                      ? `${item.files.length} attachment${item.files.length === 1 ? "" : "s"}`
                      : item.text}
                    {runtime.editingQueuedId === item.id ? " (editing)" : ""}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 font-medium underline"
                    aria-label={`Edit queued message ${index + 1}`}
                    onClick={() => runtime.beginEditingQueuedFollowUp(item.id)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="shrink-0 font-medium underline"
                    aria-label={`Send queued message ${index + 1} now`}
                    onClick={() => void runtime.forceSendQueued(item.id)}
                  >
                    Send now
                  </button>
                  <button
                    type="button"
                    className="shrink-0 font-medium underline"
                    aria-label={`Cancel queued message ${index + 1}`}
                    onClick={() => runtime.removeQueuedFollowUp(item.id)}
                  >
                    Cancel
                  </button>
                </div>
              ))}
              <div className="flex justify-end px-1">
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground underline"
                  onClick={runtime.clearQueuedFollowUps}
                >
                  Clear queue
                </button>
              </div>
            </div>
          )}
          <textarea
            value={runtime.draft}
            onChange={(event) => runtime.setDraft(event.target.value)}
            onPaste={(event) => {
              if (
                Array.from(event.clipboardData.files).some((file) => file.type.startsWith("image/"))
              ) {
                void runtime.addFiles(event.clipboardData.files);
              }
            }}
            onKeyDown={(event) => {
              if (
                shouldHandleQueueArrowKey({
                  key: event.key,
                  draft: runtime.draft,
                  selectionStart: event.currentTarget.selectionStart,
                  queueLength: runtime.queuedFollowUps.length,
                  editingQueuedId: runtime.editingQueuedId,
                })
              ) {
                event.preventDefault();
                const target = resolveQueueEditTarget({
                  queuedFollowUps: runtime.queuedFollowUps,
                  editingQueuedId: runtime.editingQueuedId,
                  direction: event.key === "ArrowUp" ? "up" : "down",
                });
                if (target === null) {
                  runtime.clearQueuedFollowUpEdit();
                  return;
                }
                runtime.beginEditingQueuedFollowUp(target.id);
                return;
              }
              if (event.key === "Escape" && runtime.editingQueuedId !== null) {
                event.preventDefault();
                runtime.clearQueuedFollowUpEdit();
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void runtime.submit();
                return;
              }
              if (event.key === "Enter" && event.shiftKey && runtime.isStreaming) {
                event.preventDefault();
                void runtime.submit(undefined, { interrupt: true });
              }
            }}
            placeholder={
              runtime.editingQueuedId !== null
                ? "Edit queued message…"
                : runtime.isStreaming
                  ? "Queue a follow-up, or Shift+Enter to send now…"
                  : "Send a message..."
            }
            aria-label="Message input"
            rows={1}
            className="max-h-48 min-h-11 w-full min-w-0 resize-none bg-transparent px-2.5 py-2 text-base leading-relaxed outline-none sm:min-h-14 sm:px-3"
          />
          {runtime.error !== null && runtime.errorMessageId === undefined && (
            <div className="mx-2 mb-2 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span>{runtime.error.message}</span>
              {runtime.orphanMessageId !== undefined ? (
                <button
                  type="button"
                  className="ms-auto cursor-pointer font-medium underline disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={runtime.isRetrying || runtime.isStreaming}
                  onClick={() => void runtime.retryOrphan()}
                >
                  {runtime.isRetrying ? "Retrying…" : "Retry previous request"}
                </button>
              ) : (
                runtime.messages.some((message) => message.role === "user") && (
                  <button
                    type="button"
                    className="ms-auto cursor-pointer font-medium underline disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={runtime.isRetrying || runtime.isStreaming}
                    onClick={() => {
                      const lastMessage = runtime.messages.at(-1);
                      if (lastMessage !== undefined)
                        void runtime.revise({ messageId: lastMessage.id });
                    }}
                  >
                    {runtime.isRetrying ? "Retrying…" : "Retry last turn"}
                  </button>
                )
              )}
              <button
                type="button"
                className={
                  runtime.messages.some((message) => message.role === "user") ||
                  runtime.orphanMessageId !== undefined
                    ? ""
                    : "ms-auto"
                }
                onClick={runtime.clearError}
              >
                Dismiss
              </button>
            </div>
          )}
          <div className="flex min-w-0 items-center gap-0.5 sm:flex-wrap sm:gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" size="icon-sm" variant="ghost" asChild>
                    <label aria-label="Add attachments" className="cursor-pointer">
                      <PaperclipIcon className="size-4" />
                      <input
                        type="file"
                        multiple
                        className="sr-only"
                        onChange={(event) => {
                          if (event.target.files !== null)
                            void runtime.addFiles(event.target.files);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Add attachments</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Select value={composerControls.model} onValueChange={composerControls.onModelChange}>
              <SelectTrigger className="h-8 min-w-0 max-w-32 border-0 bg-transparent px-2 text-xs shadow-none sm:max-w-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {composerControls.models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant={composerControls.coachMode ? "secondary" : "ghost"}
              className="shrink-0 px-2 sm:px-3"
              onClick={composerControls.onCoachModeChange}
            >
              <BrainIcon className="size-4" /> <span className="hidden sm:inline">Coach</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={composerControls.webSearch ? "secondary" : "ghost"}
              className="hidden shrink-0 sm:inline-flex"
              disabled={!composerControls.canWebSearch}
              onClick={() => composerControls.onWebSearchChange(!composerControls.webSearch)}
            >
              <GlobeIcon className="size-4" /> Web
            </Button>
            <Button
              type="button"
              size="sm"
              variant={composerControls.temporary ? "secondary" : "ghost"}
              className="shrink-0 px-2 sm:px-3"
              disabled={runtime.isStreaming || isKeepingTemporary}
              onClick={() => {
                if (canKeepTemporary) {
                  setIsKeepingTemporary(true);
                  void composerControls
                    .onKeepTemporary(runtime.messages)
                    .catch(() => {
                      feedback.show({
                        kind: "error",
                        message: "Could not keep temporary chat.",
                      });
                    })
                    .finally(() => setIsKeepingTemporary(false));
                  return;
                }
                composerControls.onTemporaryChange(!composerControls.temporary);
              }}
            >
              {canKeepTemporary ? (
                <BookmarkIcon className="size-4" />
              ) : (
                <GhostIcon className="size-4" />
              )}{" "}
              <span className="hidden sm:inline">{canKeepTemporary ? "Keep" : "Temporary"}</span>
            </Button>
            <TooltipIconButton
              tooltip={
                runtime.editingQueuedId !== null
                  ? "Update queued message"
                  : runtime.isStreaming && runtime.draft.trim() === "" && runtime.files.length === 0
                    ? "Stop generating"
                    : runtime.isStreaming
                      ? "Send after reply"
                      : "Send message"
              }
              side="top"
              type={
                runtime.isStreaming &&
                runtime.draft.trim() === "" &&
                runtime.files.length === 0 &&
                runtime.editingQueuedId === null
                  ? "button"
                  : "submit"
              }
              variant="default"
              className="ms-auto size-9 shrink-0 rounded-full"
              onClick={
                runtime.isStreaming &&
                runtime.draft.trim() === "" &&
                runtime.files.length === 0 &&
                runtime.editingQueuedId === null
                  ? runtime.stop
                  : undefined
              }
              aria-label={
                runtime.editingQueuedId !== null
                  ? "Update queued message"
                  : runtime.isStreaming && runtime.draft.trim() === "" && runtime.files.length === 0
                    ? "Stop generating"
                    : runtime.isStreaming
                      ? "Send after reply"
                      : "Send message"
              }
            >
              {runtime.isStreaming && runtime.draft.trim() === "" && runtime.files.length === 0 ? (
                <SquareIcon className="size-4" />
              ) : (
                <ArrowUpIcon className="size-4" />
              )}
            </TooltipIconButton>
          </div>
        </form>
      </div>
    </div>
  );
};
