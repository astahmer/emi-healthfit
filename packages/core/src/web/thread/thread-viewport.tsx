"use client";

import type { ReactNode } from "react";
import { cn } from "../cn.ts";
import type { ThreadViewportProps } from "./types.ts";

export const ThreadViewport = ({
  scrollId,
  empty,
  messages,
  composer,
  contextSummary,
  scrollRef,
  className,
}: ThreadViewportProps): ReactNode => (
  <div className={cn("flex h-full min-h-0 flex-col", className)} data-testid="thread-viewport">
    <div
      id={scrollId}
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto"
      data-testid="thread-messages"
    >
      {empty}
      {contextSummary}
      {messages}
    </div>
    <div className="shrink-0 border-t" data-testid="thread-composer">
      {composer}
    </div>
  </div>
);
