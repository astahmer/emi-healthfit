import { useState } from "react";
import { cn } from "@/lib/utils";
import { previewMessageText } from "@/lib/chat-thread-scroll";

export type MessageRailItem = {
  id: string;
  text: string;
};

export const MessageRail = ({
  messages,
  onSelect,
}: {
  messages: MessageRailItem[];
  onSelect: (messageId: string) => void;
}) => {
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

  if (messages.length === 0) return null;

  const hoveredMessage = messages.find((message) => message.id === hoveredMessageId);

  return (
    <nav
      aria-label="User messages"
      data-testid="message-rail"
      className="pointer-events-none absolute inset-y-3 left-1 z-10 flex w-10 flex-col justify-center sm:left-2"
      onMouseLeave={() => setHoveredMessageId(null)}
    >
      <div className="pointer-events-auto flex max-h-full flex-col items-start justify-center gap-1.5 overflow-y-auto py-2">
        {messages.map((message) => {
          const isHovered = hoveredMessageId === message.id;
          return (
            <button
              key={message.id}
              type="button"
              data-testid="message-rail-item"
              data-message-id={message.id}
              aria-label={`Jump to message: ${previewMessageText({ text: message.text, maxLength: 80 })}`}
              className={cn(
                "h-0.5 rounded-full bg-foreground/35 transition-[width,background-color,opacity] duration-150",
                "hover:bg-foreground/70 focus-visible:bg-foreground/70 focus-visible:outline-none",
                isHovered ? "w-7 bg-foreground/80" : "w-3",
              )}
              onMouseEnter={() => setHoveredMessageId(message.id)}
              onFocus={() => setHoveredMessageId(message.id)}
              onBlur={() => setHoveredMessageId(null)}
              onClick={() => onSelect(message.id)}
            />
          );
        })}
      </div>
      {hoveredMessage !== undefined && (
        <div
          role="tooltip"
          data-testid="message-rail-preview"
          className="pointer-events-none absolute top-1/2 left-10 z-20 w-56 -translate-y-1/2 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md sm:left-12 sm:w-64"
        >
          {previewMessageText({ text: hoveredMessage.text })}
        </div>
      )}
    </nav>
  );
};
