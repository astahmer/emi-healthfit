"use client";

import { ThreadComposer } from "./thread-composer";
import { ThreadMessageList } from "./thread-message-list";
import type { ComposerControls as ThreadComposerControls } from "./thread-types";

export type ComposerControls = ThreadComposerControls;

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
}) => (
  <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
    <ThreadMessageList
      contextSummary={contextSummary}
      onForkMessage={onForkMessage}
      onReferenceMessage={onReferenceMessage}
    />
    <ThreadComposer composerControls={composerControls} />
  </div>
);
