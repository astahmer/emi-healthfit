"use client";

import {
  BookmarkIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  GitBranchIcon,
  LoaderIcon,
  PencilIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Bubble, BubbleContent } from "../../components/styled/internal/ui/bubble.tsx";
import { Button } from "../../components/styled/internal/ui/button.tsx";
import {
  Message,
  MessageContent,
  MessageFooter,
} from "../../components/styled/internal/ui/message.tsx";
import { cn } from "../cn.ts";
import { MessagePart } from "./message-part.tsx";
import type { MessagePartValue } from "./tool-part.tsx";

export interface ThreadMessageValue {
  readonly id: string;
  readonly role: string;
  readonly parts: ReadonlyArray<MessagePartValue>;
}

export interface ThreadMessageMetadata {
  readonly modelLabel?: string;
  readonly totalTokens?: number;
  readonly createdAt?: string;
}

export interface ThreadMessageProps {
  readonly message: ThreadMessageValue;
  readonly isStreaming: boolean;
  readonly metadata?: ThreadMessageMetadata;
  readonly assistantLabel?: string;
  readonly onFork?: (messageId: string) => void;
  readonly onRemember?: (message: ThreadMessageValue) => void | Promise<void>;
  readonly isRemembered?: boolean;
  readonly isRemembering?: boolean;
  readonly editingDraft?: string;
  readonly onEditStart?: (message: ThreadMessageValue) => void;
  readonly onEditChange?: (value: string) => void;
  readonly onEditCancel?: () => void;
  readonly onEditSubmit?: () => void;
  readonly onRegenerate?: (messageId: string) => void;
  readonly regenerateLabel?: string;
  readonly regenerateText?: string;
  readonly onReferenceMessage?: (messageId: string) => void;
  readonly error?: Error;
  readonly onRetry?: (messageId: string) => void;
  readonly retryDisabled?: boolean;
  readonly onCopyResult?: (result: {
    readonly message: ThreadMessageValue;
    readonly ok: boolean;
  }) => void;
  readonly renderToolResult?: (args: { toolName: string; result: unknown }) => ReactNode;
}

const messageText = (message: ThreadMessageValue): string =>
  message.parts
    .flatMap((part) => (part.type === "text" && typeof part.text === "string" ? [part.text] : []))
    .join("\n");

const messagePartKey = (part: MessagePartValue, index: number): string =>
  `${part.type}:${index}:${typeof part.text === "string" ? part.text.length : ""}`;

const exportMessage = (message: ThreadMessageValue): void => {
  const blob = new Blob([messageText(message)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `message-${message.id}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const copyMessage = async (message: ThreadMessageValue): Promise<void> => {
  await navigator.clipboard.writeText(messageText(message));
};

export const ThreadMessage = ({
  message,

  isStreaming,
  metadata,
  assistantLabel = "Assistant",
  onFork,
  onRemember,
  isRemembered = false,
  isRemembering = false,
  editingDraft,
  onEditStart,
  onEditChange,
  onEditCancel,
  onEditSubmit,
  onRegenerate,
  regenerateLabel = "Regenerate response",
  regenerateText,
  onReferenceMessage,
  error,
  onRetry,
  retryDisabled = false,
  onCopyResult,
  renderToolResult,
}: ThreadMessageProps): ReactNode => {
  if (message.role === "summary") {
    const summaryText = messageText(message).replace(
      /^Use this compacted summary of the previous conversation as context:\s*/i,
      "",
    );
    return (
      <Message id={`message-${message.id}`} align="start" className="scroll-mt-28 py-1">
        <div className="w-full space-y-4">
          <div className="h-px bg-border" aria-hidden="true" />
          <details
            open
            data-testid="compacted-summary"
            className="group rounded-xl border bg-muted/40"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground">
              <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" />
              Context compacted
            </summary>
            <p className="border-t px-4 py-3 text-sm whitespace-pre-wrap">{summaryText}</p>
          </details>
        </div>
      </Message>
    );
  }
  const isUser = message.role === "user";
  const text = messageText(message);
  const canEdit = isUser && !isStreaming && editingDraft === undefined && onEditStart !== undefined;
  const canRegenerate = !isStreaming && onRegenerate !== undefined && editingDraft === undefined;
  const canRemember = !isUser && !isStreaming && text.trim() !== "" && onRemember !== undefined;

  const handleCopy = async (): Promise<void> => {
    try {
      await copyMessage(message);
      onCopyResult?.({ message, ok: true });
    } catch {
      onCopyResult?.({ message, ok: false });
    }
  };

  return (
    <Message
      id={`message-${message.id}`}
      align={isUser ? "end" : "start"}
      aria-live={isStreaming ? "polite" : undefined}
      className="scroll-mt-28 py-1"
    >
      <MessageContent className={cn(!isUser && "gap-3")}>
        {editingDraft === undefined ? (
          <Bubble
            align={isUser ? "end" : "start"}
            variant={isUser ? "muted" : "ghost"}
            className={cn(isUser ? "max-w-[min(85%,42rem)] rounded-2xl rounded-br-md" : "w-full")}
          >
            <BubbleContent className={cn(!isUser && "w-full space-y-3")}>
              {message.parts.map((part, index) => (
                <div key={messagePartKey(part, index)}>
                  <MessagePart
                    part={part}
                    onReferenceMessage={onReferenceMessage}
                    isStreaming={isStreaming}
                    renderToolResult={renderToolResult}
                  />
                </div>
              ))}
              {isStreaming && (
                <span
                  aria-label="Assistant is working"
                  className="inline-flex animate-pulse items-center gap-1.5 text-sm font-medium text-foreground/80"
                  role="status"
                >
                  <span>Thinking</span>
                  <span aria-hidden="true">···</span>
                </span>
              )}
              {canRegenerate && regenerateText !== undefined && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={regenerateLabel}
                  onClick={() => onRegenerate(message.id)}
                  disabled={retryDisabled}
                >
                  {regenerateText}
                </Button>
              )}
            </BubbleContent>
          </Bubble>
        ) : (
          <form
            className="ms-auto flex w-full max-w-[85%] flex-col gap-2 rounded-xl border bg-muted/30 p-2"
            onSubmit={(event) => {
              event.preventDefault();
              onEditSubmit?.();
            }}
          >
            <textarea
              value={editingDraft}
              onChange={(event) => onEditChange?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") onEditCancel?.();
              }}
              aria-label="Edit message"
              className="min-h-20 resize-y bg-transparent p-2 outline-none"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => onEditCancel?.()}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={editingDraft.trim() === ""}>
                Update
              </Button>
            </div>
          </form>
        )}
        {isUser && error !== undefined && (
          <div className="ms-auto flex max-w-[85%] items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{error.message}</span>
            {onRetry !== undefined && (
              <button
                type="button"
                className="ms-auto cursor-pointer font-medium underline disabled:cursor-not-allowed disabled:opacity-50"
                disabled={retryDisabled}
                onClick={() => onRetry(message.id)}
              >
                {retryDisabled ? "Retrying…" : "Retry this request"}
              </button>
            )}
          </div>
        )}
        <MessageFooter className={cn("gap-1", !isUser && "px-2")}>
          <span className="me-1 font-medium text-foreground/70">
            {isUser ? "You" : assistantLabel}
          </span>
          {metadata?.modelLabel !== undefined &&
            (isUser ? <span>{metadata.modelLabel}</span> : <span>Replied with {metadata.modelLabel}</span>)}
          {typeof metadata?.totalTokens === "number" && metadata.totalTokens > 0 && (
            <span>{metadata.totalTokens.toLocaleString()} tokens</span>
          )}
          {metadata?.createdAt !== undefined && (
            <time
              dateTime={metadata.createdAt}
              title={new Date(metadata.createdAt).toLocaleString()}
            >
              {new Date(metadata.createdAt).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
          )}
          <Button
            title="Copy message"
            type="button"
            aria-label="Copy message"
            size="xs"
            variant="ghost"
            className="size-10"
            onClick={() => void handleCopy()}
          >
            <CopyIcon className="size-3.5" />
          </Button>
          {canEdit && (
            <Button
              title="Edit message"
              type="button"
              aria-label="Edit message"
              size="xs"
              variant="ghost"
              className="size-10"
              onClick={() => onEditStart(message)}
            >
              <PencilIcon className="size-3.5" />
            </Button>
          )}
          {canRegenerate && regenerateText === undefined && (
            <Button
              title={regenerateLabel}
              type="button"
              aria-label={regenerateLabel}
              size="xs"
              variant="ghost"
              className="size-10"
              disabled={retryDisabled}
              onClick={() => onRegenerate(message.id)}
            >
              <RefreshCwIcon className="size-3.5" />
            </Button>
          )}
          {onFork !== undefined && message.id !== "" && !isStreaming && (
            <Button
              title="Fork from this message"
              type="button"
              aria-label="Fork from message"
              size="xs"
              variant="ghost"
              className="size-10"
              onClick={() => onFork(message.id)}
            >
              <GitBranchIcon className="size-3.5" />
            </Button>
          )}
          {(canRemember || (!isUser && !isStreaming && text.trim() !== "")) && (
            <details className="relative">
              <summary
                title="More actions"
                aria-label="More actions"
                className="flex size-10 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground [&::-webkit-details-marker]:hidden"
              >
                <EllipsisVerticalIcon className="size-3.5" />
              </summary>
              <div className="absolute bottom-full z-50 mb-1 w-52 rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl">
                {canRemember && (
                  <button
                    type="button"
                    aria-label={isRemembered ? "Remove message memories" : "Save message to memory"}
                    className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent disabled:opacity-50"
                    onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      void onRemember(message);
                    }}
                    disabled={isRemembering}
                  >
                    {isRemembering ? (
                      <LoaderIcon className="size-3.5 animate-spin" />
                    ) : (
                      <BookmarkIcon className={cn("size-3.5", isRemembered && "fill-current")} />
                    )}
                    {isRemembered ? "Remove from memories" : "Save to memory"}
                  </button>
                )}
                {!isUser && !isStreaming && text.trim() !== "" && (
                  <button
                    type="button"
                    aria-label="Export message as Markdown"
                    className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
                    onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      exportMessage(message);
                    }}
                  >
                    <DownloadIcon className="size-3.5" />
                    Export as Markdown
                  </button>
                )}
              </div>
            </details>
          )}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
};
