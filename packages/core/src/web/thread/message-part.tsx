"use client";

import type { ReactNode } from "react";
import { MarkdownText } from "./markdown-text.tsx";
import { isSafeAttachmentUrl } from "./markdown-url-policy.ts";
import { ToolPart, type MessagePartValue } from "./tool-part.tsx";

export const MessagePart = ({
  part,
  onReferenceMessage,
  isStreaming,
  renderToolResult,
}: {
  part: MessagePartValue;
  onReferenceMessage?: (messageId: string) => void;
  isStreaming: boolean;
  renderToolResult?: (args: { toolName: string; result: unknown }) => ReactNode;
}): ReactNode => {
  if (part.type === "text" && typeof part.text === "string") {
    return <MarkdownText text={part.text} onReferenceMessage={onReferenceMessage} />;
  }
  if (part.type === "file" && typeof part.url === "string") {
    const mediaType = typeof part.mediaType === "string" ? part.mediaType : "";
    if (!isSafeAttachmentUrl({ href: part.url, mediaType })) {
      return <span className="text-muted-foreground">[attachment blocked]</span>;
    }
    if (mediaType.startsWith("image/")) {
      return (
        <img
          src={part.url}
          alt={typeof part.filename === "string" ? part.filename : "Attachment"}
          className="max-h-80 rounded-lg object-contain"
        />
      );
    }
    return (
      <a
        href={part.url}
        download={typeof part.filename === "string" ? part.filename : undefined}
        className="text-primary underline underline-offset-4"
      >
        {typeof part.filename === "string" ? part.filename : "Attachment"}
      </a>
    );
  }
  if (part.type === "reasoning" && typeof part.text === "string") {
    return (
      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer">Reasoning</summary>
        <div className="mt-2 whitespace-pre-wrap">{part.text}</div>
      </details>
    );
  }
  return <ToolPart part={part} isStreaming={isStreaming} renderToolResult={renderToolResult} />;
};
