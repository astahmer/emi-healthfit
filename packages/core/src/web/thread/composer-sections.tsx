"use client";

import type { FC } from "react";

export interface ComposerQueueItem {
  readonly id: string;
  readonly text: string;
  readonly files: ReadonlyArray<unknown>;
}

export interface ComposerQueueProps {
  queuedFollowUps: ReadonlyArray<ComposerQueueItem>;
  editingQueuedId: string | null;
  beginEditingQueuedFollowUp: (id: string) => void;
  forceSendQueued: (id: string) => Promise<void> | void;
  removeQueuedFollowUp: (id: string) => void;
  clearQueuedFollowUps: () => void;
}

export const ComposerQueue: FC<ComposerQueueProps> = ({
  queuedFollowUps,
  editingQueuedId,
  beginEditingQueuedFollowUp,
  forceSendQueued,
  removeQueuedFollowUp,
  clearQueuedFollowUps,
}) => {
  if (queuedFollowUps.length === 0) return null;
  return (
    <div className="mx-2 mb-2 space-y-1.5" aria-label="Queued follow-ups">
      {queuedFollowUps.map((item, index) => (
        <div
          key={item.id}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
            editingQueuedId === item.id
              ? "bg-primary/10 text-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <span className="min-w-0 flex-1 truncate">
            {index + 1}.{" "}
            {item.text.trim() === ""
              ? `${item.files.length} attachment${item.files.length === 1 ? "" : "s"}`
              : item.text}
            {editingQueuedId === item.id ? " (editing)" : ""}
          </span>
          <button
            type="button"
            className="shrink-0 font-medium underline"
            aria-label={`Edit queued message ${index + 1}`}
            onClick={() => beginEditingQueuedFollowUp(item.id)}
          >
            Edit
          </button>
          <button
            type="button"
            className="shrink-0 font-medium underline"
            aria-label={`Send queued message ${index + 1} now`}
            onClick={() => void forceSendQueued(item.id)}
          >
            Send now
          </button>
          <button
            type="button"
            className="shrink-0 font-medium underline"
            aria-label={`Cancel queued message ${index + 1}`}
            onClick={() => removeQueuedFollowUp(item.id)}
          >
            Cancel
          </button>
        </div>
      ))}
      <div className="flex justify-end px-1">
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground underline"
          onClick={clearQueuedFollowUps}
        >
          Clear queue
        </button>
      </div>
    </div>
  );
};

export interface ComposerErrorProps {
  error: { message: string } | null;
  errorMessageId?: string;
  orphanMessageId?: string;
  hasUserMessages: boolean;
  isRetrying: boolean;
  isStreaming: boolean;
  retryOrphan: () => Promise<void> | void;
  reviseLastTurn: () => Promise<void> | void;
  clearError: () => void;
}

export const ComposerError: FC<ComposerErrorProps> = ({
  error,
  errorMessageId,
  orphanMessageId,
  hasUserMessages,
  isRetrying,
  isStreaming,
  retryOrphan,
  reviseLastTurn,
  clearError,
}) => {
  if (error === null || errorMessageId !== undefined) return null;
  return (
    <div className="mx-2 mb-2 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <span>{error.message}</span>
      {orphanMessageId !== undefined ? (
        <button
          type="button"
          className="ms-auto cursor-pointer font-medium underline disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isRetrying || isStreaming}
          onClick={() => void retryOrphan()}
        >
          {isRetrying ? "Retrying…" : "Retry previous request"}
        </button>
      ) : (
        hasUserMessages && (
          <button
            type="button"
            className="ms-auto cursor-pointer font-medium underline disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isRetrying || isStreaming}
            onClick={() => void reviseLastTurn()}
          >
            {isRetrying ? "Retrying…" : "Retry last turn"}
          </button>
        )
      )}
      <button
        type="button"
        className={hasUserMessages || orphanMessageId !== undefined ? "" : "ms-auto"}
        onClick={clearError}
      >
        Dismiss
      </button>
    </div>
  );
};
