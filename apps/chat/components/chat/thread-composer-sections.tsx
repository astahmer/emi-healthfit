"use client";

import { useState } from "react";
import {
  ArrowUpIcon,
  BookmarkIcon,
  BrainIcon,
  GlobeIcon,
  GhostIcon,
  LoaderCircleIcon,
  PaperclipIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChatRuntimeValue } from "@/app/chat/chat-runtime-context";
import { useActionFeedback } from "@/app/action-feedback";
import type { ComposerControls } from "./thread-types";

export const ComposerAttachments = ({ runtime }: { runtime: ChatRuntimeValue }) => (
  <>
    {runtime.files.length > 0 && (
      <div className="flex flex-wrap gap-2 px-2 pb-2">
        {runtime.files.map((file, index) => (
          <div
            key={`${file.url}-${index}`}
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
  </>
);

export const ComposerQueue = ({ runtime }: { runtime: ChatRuntimeValue }) => {
  if (runtime.queuedFollowUps.length === 0) return null;
  return (
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
  );
};

export const ComposerError = ({ runtime }: { runtime: ChatRuntimeValue }) => {
  if (runtime.error === null || runtime.errorMessageId !== undefined) return null;
  const hasUserMessages = runtime.messages.some((message) => message.role === "user");
  return (
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
        hasUserMessages && (
          <button
            type="button"
            className="ms-auto cursor-pointer font-medium underline disabled:cursor-not-allowed disabled:opacity-50"
            disabled={runtime.isRetrying || runtime.isStreaming}
            onClick={() => {
              const lastMessage = runtime.messages.at(-1);
              if (lastMessage !== undefined) void runtime.revise({ messageId: lastMessage.id });
            }}
          >
            {runtime.isRetrying ? "Retrying…" : "Retry last turn"}
          </button>
        )
      )}
      <button
        type="button"
        className={hasUserMessages || runtime.orphanMessageId !== undefined ? "" : "ms-auto"}
        onClick={runtime.clearError}
      >
        Dismiss
      </button>
    </div>
  );
};

export const ComposerToolbar = ({
  composerControls,
  runtime,
}: {
  composerControls: ComposerControls;
  runtime: ChatRuntimeValue;
}) => {
  const feedback = useActionFeedback();
  const [isKeepingTemporary, setIsKeepingTemporary] = useState(false);
  const canKeepTemporary = composerControls.temporary && runtime.messages.length > 0;
  return (
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
                    if (event.target.files !== null) void runtime.addFiles(event.target.files);
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
                feedback.show({ kind: "error", message: "Could not keep temporary chat." });
              })
              .finally(() => setIsKeepingTemporary(false));
            return;
          }
          composerControls.onTemporaryChange(!composerControls.temporary);
        }}
      >
        {canKeepTemporary ? <BookmarkIcon className="size-4" /> : <GhostIcon className="size-4" />}{" "}
        <span className="hidden sm:inline">{canKeepTemporary ? "Keep" : "Temporary"}</span>
      </Button>
      <TooltipIconButton
        tooltip={
          runtime.editingQueuedId !== null
            ? "Update queued message"
            : runtime.isSending
              ? "Sending…"
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
        disabled={runtime.isSending}
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
            : runtime.isSending
              ? "Sending…"
              : runtime.isStreaming && runtime.draft.trim() === "" && runtime.files.length === 0
                ? "Stop generating"
                : runtime.isStreaming
                  ? "Send after reply"
                  : "Send message"
        }
      >
        {runtime.isSending ? (
          <LoaderCircleIcon className="size-4 animate-spin" />
        ) : runtime.isStreaming && runtime.draft.trim() === "" && runtime.files.length === 0 ? (
          <SquareIcon className="size-4" />
        ) : (
          <ArrowUpIcon className="size-4" />
        )}
      </TooltipIconButton>
    </div>
  );
};
