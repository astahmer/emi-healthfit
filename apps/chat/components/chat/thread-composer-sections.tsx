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
import {
  ComposerError as CoreComposerError,
  ComposerQueue as CoreComposerQueue,
} from "@emi/core/web";
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

export const ComposerQueue = ({ runtime }: { runtime: ChatRuntimeValue }) => (
  <CoreComposerQueue
    queuedFollowUps={runtime.queuedFollowUps}
    editingQueuedId={runtime.editingQueuedId}
    beginEditingQueuedFollowUp={runtime.beginEditingQueuedFollowUp}
    forceSendQueued={runtime.forceSendQueued}
    removeQueuedFollowUp={runtime.removeQueuedFollowUp}
    clearQueuedFollowUps={runtime.clearQueuedFollowUps}
  />
);

export const ComposerError = ({ runtime }: { runtime: ChatRuntimeValue }) => (
  <CoreComposerError
    error={runtime.error}
    errorMessageId={runtime.errorMessageId}
    orphanMessageId={runtime.orphanMessageId}
    hasUserMessages={runtime.messages.some((message) => message.role === "user")}
    isRetrying={runtime.isRetrying}
    isStreaming={runtime.isStreaming}
    retryOrphan={() => runtime.retryOrphan()}
    reviseLastTurn={() => {
      const lastMessage = runtime.messages.at(-1);
      if (lastMessage !== undefined) void runtime.revise({ messageId: lastMessage.id });
    }}
    clearError={runtime.clearError}
  />
);

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
  const awaitingFirstChunk = runtime.isSendGraceActive;
  const canStop =
    (runtime.isStreaming || runtime.isSending) &&
    runtime.draft.trim() === "" &&
    runtime.files.length === 0;
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
        data-testid="composer-send"
        tooltip={
          runtime.editingQueuedId !== null
            ? "Update queued message"
            : runtime.isSending || awaitingFirstChunk
              ? "Sending…"
              : canStop
                ? "Stop generating"
                : runtime.isStreaming
                  ? "Send after reply"
                  : "Send message"
        }
        side="top"
        type={canStop && runtime.editingQueuedId === null ? "button" : "submit"}
        variant="default"
        className="ms-auto size-9 shrink-0 rounded-full"
        disabled={runtime.isSending || awaitingFirstChunk}
        onClick={canStop && runtime.editingQueuedId === null ? runtime.stop : undefined}
        aria-label={
          runtime.editingQueuedId !== null
            ? "Update queued message"
            : runtime.isSending || awaitingFirstChunk
              ? "Sending…"
              : canStop
                ? "Stop generating"
                : runtime.isStreaming
                  ? "Send after reply"
                  : "Send message"
        }
      >
        {runtime.isSending || awaitingFirstChunk ? (
          <LoaderCircleIcon className="size-4 animate-spin" />
        ) : canStop ? (
          <SquareIcon className="size-4" />
        ) : (
          <ArrowUpIcon className="size-4" />
        )}
      </TooltipIconButton>
    </div>
  );
};
