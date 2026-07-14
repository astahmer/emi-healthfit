"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { fetchSuggestions } from "@/app/suggestions";
import { useSettings } from "@/app/settings-store";
import { useEffect, useRef, useState } from "react";
import { RefreshCwIcon } from "lucide-react";

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

const suggestionCache = new Map<string, string[]>();
const pendingFetches = new Map<string, Promise<string[]>>();

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
  const settings = useSettings((state) => state.settings);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenerateKey, setRegenerateKey] = useState(0);
  const fetchedRef = useRef<Set<string>>(new Set());

  const isLastAssistant = (() => {
    const last = messages[messages.length - 1];
    return last !== undefined && last.role === "assistant" && last.id === message.id;
  })();

  const status = message.status?.type;

  useEffect(() => {
    if (!isLastAssistant || status !== "complete" || isRunning) return;

    const assistantText = getMessageText(message).trim();
    if (assistantText === "") return;

    const skipCache = regenerateKey > 0;
    if (!skipCache) {
      const cached = suggestionCache.get(message.id);
      if (cached !== undefined) {
        setSuggestions(cached);
        setLoading(false);
        setError(null);
        return;
      }
    }

    if (fetchedRef.current.has(message.id) && !skipCache) return;
    fetchedRef.current.add(message.id);

    setSuggestions([]);
    setLoading(true);
    setError(null);

    const lastUserMessage = [...messages]
      .reverse()
      .find((threadMessage) => threadMessage.role === "user");
    const lastUserText =
      lastUserMessage !== undefined ? getMessageText(lastUserMessage) : undefined;

    const fetchPromise =
      pendingFetches.get(message.id) ??
      fetchSuggestions({
        messageId: message.id,
        lastAssistantText: assistantText,
        lastUserText,
        config: {
          provider: settings.provider,
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
          model: settings.model,
        },
      });

    if (!pendingFetches.has(message.id)) {
      pendingFetches.set(message.id, fetchPromise);
    }

    fetchPromise
      .then((items) => {
        suggestionCache.set(message.id, items);
        pendingFetches.delete(message.id);
        setSuggestions(items);
        setLoading(false);
      })
      .catch((err) => {
        pendingFetches.delete(message.id);
        fetchedRef.current.delete(message.id);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [isLastAssistant, isRunning, status, message, messages, settings, regenerateKey]);

  if (!isLastAssistant || status !== "complete" || isRunning) return null;

  const handleClick = (text: string) => {
    aui.thread().append({
      role: "user",
      content: [{ type: "text", text }],
    });
  };

  const handleRegenerate = () => {
    suggestionCache.delete(message.id);
    fetchedRef.current.delete(message.id);
    setRegenerateKey((key) => key + 1);
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {suggestions.map((text, index) => (
        <Button
          key={`${message.id}-${index}`}
          variant="outline"
          size="sm"
          className="h-auto max-w-[16rem] rounded-full px-3 py-1.5 text-xs font-normal"
          onClick={() => handleClick(text)}
        >
          {text}
        </Button>
      ))}
      {loading && (
        <>
          <span className="bg-muted h-7 w-24 animate-pulse rounded-full" />
          <span className="bg-muted h-7 w-32 animate-pulse rounded-full" />
        </>
      )}
      {!loading && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-foreground"
          aria-label="Regenerate suggestions"
          onClick={handleRegenerate}
        >
          <RefreshCwIcon />
        </Button>
      )}
      {error !== null && (
        <span className="text-destructive text-xs">{error}</span>
      )}
    </div>
  );
};
