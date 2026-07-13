"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { fetchSuggestions } from "@/app/suggestions";
import { useEffect, useState } from "react";

interface TextPart {
  type: "text";
  text: string;
}

interface MessageWithParts {
  id: string;
  role: string;
  parts: readonly unknown[];
  status?: { type: string } | undefined;
}

const asMessagesWithParts = (messages: readonly unknown[]): MessageWithParts[] => {
  return messages as MessageWithParts[];
};

const getMessageText = (message: MessageWithParts): string => {
  return message.parts
    .filter((part): part is TextPart => {
      if (typeof part !== "object" || part === null) return false;
      const record = part as Record<string, unknown>;
      return record.type === "text" && typeof record.text === "string";
    })
    .map((part) => part.text)
    .join("");
};

export const FollowUpChips = () => {
  const aui = useAui();
  const message = useAuiState((s) => s.message as MessageWithParts);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const messages = useAuiState((s) => asMessagesWithParts(s.thread.messages));

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLastAssistant = (() => {
    const last = messages[messages.length - 1];
    return last !== undefined && last.role === "assistant" && last.id === message.id;
  })();

  useEffect(() => {
    const status = message.status?.type;
    if (!isLastAssistant || status !== "complete" || isRunning) return;

    const assistantText = getMessageText(message).trim();
    if (assistantText === "") return;

    const lastUserMessage = [...messages]
      .reverse()
      .find((threadMessage) => threadMessage.role === "user");

    const lastUserText =
      lastUserMessage !== undefined ? getMessageText(lastUserMessage) : undefined;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSuggestions({
      lastAssistantText: assistantText,
      lastUserText,
    })
      .then((items) => {
        if (!cancelled) setSuggestions(items);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLastAssistant, isRunning, message, messages]);

  const status = message.status?.type;
  if (!isLastAssistant || status !== "complete" || isRunning) return null;

  const handleClick = (text: string) => {
    aui.thread().append({
      role: "user",
      content: [{ type: "text", text }],
    });
  };

  if (loading) {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <div className="text-muted-foreground text-xs">Loading suggestions…</div>
      </div>
    );
  }

  if (error !== null || suggestions.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {suggestions.map((text, index) => (
        <Button
          key={`${text}-${index}`}
          variant="outline"
          size="sm"
          className="h-auto rounded-full px-3 py-1.5 text-xs font-normal"
          onClick={() => handleClick(text)}
        >
          {text}
        </Button>
      ))}
    </div>
  );
};
