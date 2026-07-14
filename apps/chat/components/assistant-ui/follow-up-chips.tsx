"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { fetchSuggestions } from "@/app/suggestions";
import { useSettings } from "@/app/settings-store";
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
  const queryClient = useQueryClient();
  const message = useAuiState((s) => s.message as MessageWithParts);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const messages = useAuiState((s) => asMessagesWithParts(s.thread.messages));
  const settings = useSettings((state) => state.settings);

  const isLastAssistant = (() => {
    const last = messages[messages.length - 1];
    return last !== undefined && last.role === "assistant" && last.id === message.id;
  })();

  const status = message.status?.type;

  const assistantText = getMessageText(message).trim();
  const lastUserMessage = [...messages]
    .reverse()
    .find((threadMessage) => threadMessage.role === "user");
  const lastUserText = lastUserMessage !== undefined ? getMessageText(lastUserMessage) : undefined;

  const {
    data: suggestions = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["suggestions", message.id],
    queryFn: () =>
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
      }),
    enabled: isLastAssistant && status === "complete" && !isRunning && assistantText !== "",
  });

  if (!isLastAssistant || status !== "complete" || isRunning) return null;

  const handleClick = (text: string) => {
    aui.thread().append({
      role: "user",
      content: [{ type: "text", text }],
    });
  };

  const handleRegenerate = () => {
    void queryClient.invalidateQueries({ queryKey: ["suggestions", message.id] });
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
      {isLoading && (
        <>
          <span className="bg-muted h-7 w-24 animate-pulse rounded-full" />
          <span className="bg-muted h-7 w-32 animate-pulse rounded-full" />
        </>
      )}
      {!isLoading && suggestions.length > 0 && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-foreground"
          aria-label="Regenerate suggestions"
          onClick={handleRegenerate}
        >
          <RefreshCwIcon className="size-3.5" />
        </Button>
      )}
      {error !== null && <span className="text-destructive text-xs">{error.message}</span>}
    </div>
  );
};
