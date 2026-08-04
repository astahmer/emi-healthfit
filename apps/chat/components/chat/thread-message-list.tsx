"use client";

import { useState } from "react";
import type { UIMessage } from "ai";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMachine } from "@xstate/react";
import { assign, setup } from "xstate";
import {
  ChatThreadScroll,
  MessageRail,
  SuggestionChips,
  ThreadMessage,
  useThreadViewportScroll,
  type ThreadMessageValue,
} from "@emi/core/web";
import { Button } from "@/components/ui/button";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button";
import { useChatRuntime } from "@/app/chat/chat-runtime-context";
import { fetchSuggestions } from "@/app/suggestions";
import { useSettings } from "@/app/settings-store";
import { useUsage } from "@/app/usage-context";
import { chatModels } from "@/app/models";
import { queryKeys } from "@/app/query-cache";
import { MemoryDomain } from "@/app/memories";
import { notifyMemoriesChanged } from "@/app/memory-events";
import { useActionFeedback } from "@/app/action-feedback";
import { ToolResultContent } from "@/components/chat/tool-result-content";

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

const hasVisibleContent = (message: UIMessage): boolean =>
  message.parts.some((part) => {
    if (part.type === "text" || part.type === "reasoning") {
      return typeof part.text === "string" && part.text.trim() !== "";
    }
    return true;
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

export const ThreadMessageList = ({
  contextSummary,
  onForkMessage,
  onReferenceMessage,
}: {
  contextSummary?: string;
  onForkMessage?: (messageId: string) => void;
  onReferenceMessage?: (messageId: string) => void;
}) => {
  const runtime = useChatRuntime();
  const settings = useSettings((state) => state.settings);
  const feedback = useActionFeedback();
  const [editorState, sendEditor] = useMachine(messageEditorMachine);
  const [memoryMessageId, setMemoryMessageId] = useState<string | null>(null);
  const usage = useUsage();
  const userRailMessages = runtime.messages.flatMap((message) =>
    message.role === "user"
      ? [
          {
            id: message.id,
            text: getText(message),
            createdAt: usage.metaByMessageId.get(message.id)?.createdAt,
          },
        ]
      : [],
  );
  const visibleMessages = runtime.messages.flatMap((message, index) => {
    const isLiveEmptyAssistant =
      runtime.isStreaming && index === runtime.messages.length - 1 && message.role === "assistant";
    if (message.role === "assistant" && !hasVisibleContent(message) && !isLiveEmptyAssistant) {
      return [];
    }
    return [{ message, index }];
  });
  const lastVisibleMessage = visibleMessages.at(-1)?.message;
  const lastMessage = runtime.messages.at(-1);
  const lastUserMessageId = runtime.messages.findLast((message) => message.role === "user")?.id;
  const incompleteUserMessage =
    !runtime.isStreaming &&
    lastVisibleMessage?.role === "user" &&
    (lastMessage === undefined ||
      lastMessage.id === lastVisibleMessage.id ||
      (lastMessage.role === "assistant" && !hasVisibleContent(lastMessage)))
      ? lastVisibleMessage
      : undefined;
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
  const { data: conversationMemories = [] } = useQuery({
    queryKey: queryKeys.memories.messageSources,
    queryFn: () => MemoryDomain.list(),
    enabled: runtime.sessionId !== undefined,
  });
  const savedMemoryMessageIds = new Set(
    conversationMemories.flatMap((memory) => {
      const messageId = MemoryDomain.provenance(memory).messageId;
      return messageId === undefined ? [] : [messageId];
    }),
  );

  const rememberMessage = async (message: UIMessage) => {
    const text = getText(message).trim();
    if (text === "") return;
    setMemoryMessageId(message.id);
    try {
      if (savedMemoryMessageIds.has(message.id)) {
        await MemoryDomain.removeByMessage({ messageId: message.id });
        feedback.show({ kind: "success", message: "Removed message memories." });
        return;
      }
      const ids = await MemoryDomain.extract({
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
    <>
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
            {visibleMessages.length === 0 && contextSummary === undefined ? (
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
                {visibleMessages.map(({ message, index }) => (
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
                    onRegenerate={
                      message.role === "assistant" || message.id === lastUserMessageId
                        ? (messageId) => void runtime.revise({ messageId })
                        : undefined
                    }
                    regenerateLabel={
                      message.role === "user" ? "Regenerate from this message" : undefined
                    }
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
                {incompleteUserMessage !== undefined && (
                  <ThreadMessage
                    message={{
                      id: `${incompleteUserMessage.id}-coach-recovery`,
                      role: "assistant",
                      parts: [
                        {
                          type: "text",
                          text: "Coach did not finish this reply.",
                        },
                      ],
                    }}
                    isStreaming={false}
                    assistantLabel="Coach"
                    onRegenerate={() =>
                      void runtime.revise({ messageId: incompleteUserMessage.id })
                    }
                    regenerateLabel="Retry coach response"
                    regenerateText="Retry coach response"
                    retryDisabled={runtime.isRetrying || runtime.isStreaming}
                  />
                )}
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
    </>
  );
};
