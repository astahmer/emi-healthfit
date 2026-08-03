"use client";

import { type FormEvent } from "react";
import { useChatRuntime } from "@/app/chat/chat-runtime-context";
import { resolveQueueEditTarget, shouldHandleQueueArrowKey } from "@/app/chat/follow-up-queue";
import type { ComposerControls } from "./thread-types";
import {
  ComposerAttachments,
  ComposerError,
  ComposerQueue,
  ComposerToolbar,
} from "./thread-composer-sections";

export const ThreadComposer = ({ composerControls }: { composerControls: ComposerControls }) => {
  const runtime = useChatRuntime();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void runtime.submit();
  };

  return (
    <div className="min-w-0 bg-gradient-to-t from-background via-background to-transparent px-2 pt-3 pb-[calc(.5rem+env(safe-area-inset-bottom))] sm:px-3 sm:pt-5 sm:pb-3">
      <form
        onSubmit={submit}
        className="mx-auto w-full min-w-0 max-w-4xl rounded-[1.2rem] border bg-background/95 p-1.5 shadow-[0_12px_40px_-18px_color-mix(in_oklab,var(--foreground)_28%,transparent)] backdrop-blur-xl focus-within:border-ring/50 focus-within:ring-4 focus-within:ring-ring/10 sm:rounded-[1.35rem] sm:p-2"
      >
        <ComposerAttachments runtime={runtime} />
        <ComposerQueue runtime={runtime} />
        <textarea
          value={runtime.draft}
          onChange={(event) => runtime.setDraft(event.target.value)}
          onPaste={(event) => {
            if (
              Array.from(event.clipboardData.files).some((file) => file.type.startsWith("image/"))
            )
              void runtime.addFiles(event.clipboardData.files);
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
        <ComposerError runtime={runtime} />
        <ComposerToolbar composerControls={composerControls} runtime={runtime} />
      </form>
    </div>
  );
};
