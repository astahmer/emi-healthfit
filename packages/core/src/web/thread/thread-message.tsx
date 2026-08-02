"use client";

import {
  BookmarkIcon,
  CopyIcon,
  DownloadIcon,
  GitBranchIcon,
  LoaderIcon,
  PencilIcon,
  RefreshCwIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Bubble, BubbleContent } from "../styled/ui/bubble.tsx";
import { Button } from "../styled/ui/button.tsx";
import { Message, MessageContent, MessageFooter } from "../styled/ui/message.tsx";
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
  onReferenceMessage,
  error,
  onRetry,
  retryDisabled = false,
  onCopyResult,
  renderToolResult,
}: ThreadMessageProps): ReactNode => {
  const isUser = message.role === "user";
  const text = messageText(message);
  const canEdit = isUser && !isStreaming && editingDraft === undefined && onEditStart !== undefined;
  const canRegenerate =
    !isUser && !isStreaming && onRegenerate !== undefined && editingDraft === undefined;
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
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                  role="status"
                >
                  <span>Thinking</span>
                  <span className="animate-bounce">·</span>
                  <span className="animate-bounce [animation-delay:120ms]">·</span>
                  <span className="animate-bounce [animation-delay:240ms]">·</span>
                </span>
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
          {metadata?.modelLabel !== undefined && <span>{metadata.modelLabel}</span>}
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
              onClick={() => onEditStart(message)}
            >
              <PencilIcon className="size-3.5" />
            </Button>
          )}
          {canRegenerate && (
            <Button
              title="Regenerate response"
              type="button"
              aria-label="Regenerate response"
              size="xs"
              variant="ghost"
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
              onClick={() => onFork(message.id)}
            >
              <GitBranchIcon className="size-3.5" />
            </Button>
          )}
          {canRemember && (
            <Button
              title={isRemembered ? "Remove from memories" : "Save to memory"}
              type="button"
              aria-label={isRemembered ? "Remove message memories" : "Save message to memory"}
              size="xs"
              variant="ghost"
              onClick={() => void onRemember(message)}
              disabled={isRemembering}
            >
              {isRemembering ? (
                <LoaderIcon className="size-3.5 animate-spin" />
              ) : (
                <BookmarkIcon className={cn("size-3.5", isRemembered && "fill-current")} />
              )}
            </Button>
          )}
          {!isUser && !isStreaming && text.trim() !== "" && (
            <Button
              title="Export as Markdown"
              type="button"
              aria-label="Export message as Markdown"
              size="xs"
              variant="ghost"
              onClick={() => exportMessage(message)}
            >
              <DownloadIcon className="size-3.5" />
            </Button>
          )}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
};
