"use client";

import { useEffect, useRef, type FormEvent } from "react";
import type { UIMessage } from "ai";
import {
  ArrowUpIcon,
  BookmarkIcon,
  BrainIcon,
  CopyIcon,
  DownloadIcon,
  GitBranchIcon,
  GlobeIcon,
  GhostIcon,
  LoaderIcon,
  PaperclipIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMachine } from "@xstate/react";
import { assign, setup } from "xstate";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToolResultContent } from "@/components/chat/tool-result-content";
import { cn } from "@/lib/utils";
import { useChatRuntime } from "@/app/chat/chat-runtime";
import type { ChatModel } from "@/app/models";
import { fetchSuggestions } from "@/app/suggestions";
import { useSettings } from "@/app/settings-store";
import { useUsage } from "@/app/usage-context";
import { chatModels } from "@/app/models";
import { extractMemories } from "@/app/memories";

export interface ComposerControls {
  model: string;
  onModelChange: (model: string) => void;
  coachMode: boolean;
  onCoachModeChange: () => void;
  webSearch: boolean;
  onWebSearchChange: (value: boolean) => void;
  temporary: boolean;
  onTemporaryChange: (value: boolean) => void;
  models: ChatModel[];
  canWebSearch: boolean;
}

const suggestions = [
  "How is my recovery today?",
  "Summarize my last workout.",
  "What's my current workout streak?",
  "Show my progress on bench press over the last 8 weeks.",
];

const messageEditorMachine = setup({
  types: {
    context: {} as { messageId: string | null; draft: string },
    events: {} as
      | { type: "edit.start"; messageId: string; draft: string }
      | { type: "edit.change"; draft: string }
      | { type: "edit.cancel" },
  },
}).createMachine({
  initial: "idle",
  context: { messageId: null, draft: "" },
  states: {
    idle: {
      on: {
        "edit.start": {
          target: "editing",
          actions: assign(({ event }) => ({ messageId: event.messageId, draft: event.draft })),
        },
      },
    },
    editing: {
      on: {
        "edit.change": { actions: assign(({ event }) => ({ draft: event.draft })) },
        "edit.cancel": {
          target: "idle",
          actions: assign({ messageId: () => null, draft: () => "" }),
        },
      },
    },
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

type MessagePartValue = UIMessage["parts"][number];

const ToolPart = ({ part, isStreaming }: { part: MessagePartValue; isStreaming: boolean }) => {
  if (!isRecord(part)) return null;
  const type = Reflect.get(part, "type");
  if (typeof type !== "string") return null;
  const isTool = type === "dynamic-tool" || type === "tool-call" || type.startsWith("tool-");
  if (!isTool) return null;

  const configuredToolName = Reflect.get(part, "toolName");
  const toolName =
    typeof configuredToolName === "string"
      ? configuredToolName
      : type.startsWith("tool-")
        ? type.slice(5)
        : "tool";
  const input =
    Reflect.get(part, "input") ?? Reflect.get(part, "args") ?? Reflect.get(part, "argsText");
  const output = Reflect.get(part, "output") ?? Reflect.get(part, "result");
  const hasOutput = output !== undefined || Reflect.get(part, "state") === "output-available";
  const isRunning = isStreaming && !hasOutput;

  return (
    <details className="group/tool rounded-lg border bg-muted/15" open={isRunning}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground marker:content-none">
        {isRunning ? (
          <LoaderIcon className="size-3.5 animate-spin" />
        ) : (
          <WrenchIcon className="size-3.5" />
        )}
        <span>{toolName.replaceAll("_", " ")}</span>
        <span className="ms-auto font-normal opacity-70">
          {isRunning ? "Running" : "Completed"}
        </span>
      </summary>
      <div className="border-t px-3 py-2">
        {input !== undefined && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Input</summary>
            <pre className="mt-1 overflow-auto whitespace-pre-wrap">
              {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
            </pre>
          </details>
        )}
        {hasOutput && <ToolResultContent toolName={toolName} result={output} className="mt-2" />}
      </div>
    </details>
  );
};

const MarkdownText = ({
  text,
  onReferenceMessage,
}: {
  text: string;
  onReferenceMessage?: (messageId: string) => void;
}) => (
  <div className="max-w-3xl text-[15px] leading-7 text-foreground/95">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children, href, ...props }) => {
          if (href?.startsWith("message:") === true) {
            const messageId = href.slice("message:".length);
            return (
              <button
                type="button"
                onClick={() => onReferenceMessage?.(messageId)}
                className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs font-medium text-foreground hover:bg-accent"
              >
                <GitBranchIcon className="size-3" /> {children}
              </button>
            );
          }
          return (
            <a
              {...props}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-4"
            >
              {children}
            </a>
          );
        },
        code: ({ className, children, ...props }) => (
          <code
            {...props}
            className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]", className)}
          >
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="my-3 overflow-x-auto rounded-lg border bg-muted/50 p-3 text-sm leading-6">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border bg-muted px-2 py-1 text-left">{children}</th>,
        td: ({ children }) => <td className="border px-2 py-1 align-top">{children}</td>,
        h1: ({ children }) => <h1 className="mt-6 mb-2 text-xl font-semibold">{children}</h1>,
        h2: ({ children }) => <h2 className="mt-5 mb-2 text-lg font-semibold">{children}</h2>,
        h3: ({ children }) => <h3 className="mt-4 mb-1.5 font-semibold">{children}</h3>,
        blockquote: ({ children }) => (
          <blockquote className="my-4 border-l-2 border-primary/30 pl-4 text-muted-foreground">
            {children}
          </blockquote>
        ),
        ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
        p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
        hr: () => <hr className="my-5 border-border/70" />,
      }}
    >
      {text.replace(
        /<message\s+id=["']([^"']+)["']\s*\/?\s*>/g,
        (_, messageId: string) => `[Referenced message](message:${messageId})`,
      )}
    </ReactMarkdown>
  </div>
);

const MessagePart = ({
  part,
  onReferenceMessage,
  isStreaming,
}: {
  part: MessagePartValue;
  onReferenceMessage?: (messageId: string) => void;
  isStreaming: boolean;
}) => {
  if (part.type === "text") {
    return <MarkdownText text={part.text} onReferenceMessage={onReferenceMessage} />;
  }
  if (part.type === "file") {
    if (part.mediaType.startsWith("image/")) {
      return (
        <img
          src={part.url}
          alt={part.filename ?? "Attachment"}
          className="max-h-80 rounded-lg object-contain"
        />
      );
    }
    return (
      <a
        href={part.url}
        download={part.filename}
        className="text-primary underline underline-offset-4"
      >
        {part.filename ?? "Attachment"}
      </a>
    );
  }
  if (part.type === "reasoning") {
    return (
      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer">Reasoning</summary>
        <div className="mt-2 whitespace-pre-wrap">{part.text}</div>
      </details>
    );
  }
  return <ToolPart part={part} isStreaming={isStreaming} />;
};

const getText = (message: UIMessage | undefined): string =>
  message?.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n") ?? "";

const FollowUpSuggestions = () => {
  const runtime = useChatRuntime();
  const settings = useSettings((state) => state.settings);
  const lastAssistantIndex = runtime.messages.findLastIndex(
    (message) => message.role === "assistant",
  );
  const lastAssistant = runtime.messages[lastAssistantIndex];
  const lastUser = runtime.messages
    .slice(0, lastAssistantIndex)
    .findLast((message) => message.role === "user");
  const lastAssistantText = getText(lastAssistant);
  const query = useQuery({
    queryKey: ["suggestions", lastAssistant?.id, lastAssistantText, getText(lastUser)],
    queryFn: () =>
      fetchSuggestions({
        threadId: runtime.sessionId,
        messageId: lastAssistant?.id,
        lastAssistantText,
        lastUserText: getText(lastUser),
        config: {
          provider: settings.provider,
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl || undefined,
          model: settings.model,
        },
      }),
    enabled: !runtime.isStreaming && lastAssistantText !== "",
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (query.data === undefined || query.data.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 pl-3">
      {query.data.map((suggestion) => (
        <Button
          key={suggestion}
          type="button"
          size="sm"
          variant="outline"
          className="h-auto rounded-full whitespace-normal"
          onClick={() => void runtime.submit(suggestion)}
        >
          {suggestion}
        </Button>
      ))}
    </div>
  );
};

const ChatMessage = ({
  message,
  isStreaming,
  onFork,
  onRemember,
  editingDraft,
  onEditStart,
  onEditChange,
  onEditCancel,
  onEditSubmit,
  onRegenerate,
  onReferenceMessage,
}: {
  message: UIMessage;
  isStreaming: boolean;
  onFork?: (messageId: string) => void;
  onRemember: (message: UIMessage) => Promise<void>;
  editingDraft?: string;
  onEditStart: (message: UIMessage) => void;
  onEditChange: (value: string) => void;
  onEditCancel: () => void;
  onEditSubmit: () => void;
  onRegenerate: (messageId: string) => void;
  onReferenceMessage?: (messageId: string) => void;
}) => {
  const isUser = message.role === "user";
  const usage = useUsage();
  const metadata = usage.metaByMessageId.get(message.id);
  const tokens = usage.usageByMessageId.get(message.id)?.totalTokens;
  const model = chatModels.find((candidate) => candidate.id === metadata?.model);
  const createdAt = metadata?.createdAt;
  const exportMessage = () => {
    const blob = new Blob([getText(message)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `message-${message.id}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Message
      id={`message-${message.id}`}
      align={isUser ? "end" : "start"}
      aria-live={isStreaming ? "polite" : undefined}
      className="scroll-mt-28 py-1"
    >
      <MessageContent className={cn(!isUser && "gap-3")}>
        {editingDraft === undefined ? (
          <Bubble
            align={isUser ? "end" : "start"}
            variant={isUser ? "muted" : "ghost"}
            className={cn(isUser ? "max-w-[min(85%,42rem)] rounded-2xl rounded-br-md" : "w-full")}
          >
            <BubbleContent className={cn(!isUser && "w-full space-y-3")}>
              {message.parts.map((part, index) => (
                <MessagePart
                  key={`${message.id}-${index}`}
                  part={part}
                  onReferenceMessage={onReferenceMessage}
                  isStreaming={isStreaming}
                />
              ))}
              {isStreaming && message.parts.length === 0 && (
                <span
                  className="typing-dots text-muted-foreground"
                  role="status"
                  aria-label="Assistant is working"
                >
                  <span />
                  <span />
                  <span />
                </span>
              )}
            </BubbleContent>
          </Bubble>
        ) : (
          <form
            className="ms-auto flex w-full max-w-[85%] flex-col gap-2 rounded-xl border bg-muted/30 p-2"
            onSubmit={(event) => {
              event.preventDefault();
              onEditSubmit();
            }}
          >
            <textarea
              value={editingDraft}
              onChange={(event) => onEditChange(event.target.value)}
              aria-label="Edit message"
              className="min-h-20 resize-y bg-transparent p-2 outline-none"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={onEditCancel}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={editingDraft.trim() === ""}>
                Update
              </Button>
            </div>
          </form>
        )}
        <MessageFooter className={cn("gap-1", !isUser && "px-2")}>
          <span className="me-1 font-medium text-foreground/70">{isUser ? "You" : "Coach"}</span>
          {model !== undefined && <span>{model.label}</span>}
          {typeof tokens === "number" && tokens > 0 && (
            <span>{tokens.toLocaleString()} tokens</span>
          )}
          {createdAt !== undefined && (
            <time dateTime={createdAt} title={new Date(createdAt).toLocaleString()}>
              {new Date(createdAt).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
          )}
          <TooltipIconButton
            tooltip="Copy message"
            side="top"
            type="button"
            aria-label="Copy message"
            onClick={() => void navigator.clipboard.writeText(getText(message))}
          >
            <CopyIcon className="size-3.5" />
          </TooltipIconButton>
          {isUser && !isStreaming && editingDraft === undefined && (
            <TooltipIconButton
              tooltip="Edit message"
              side="top"
              type="button"
              aria-label="Edit message"
              onClick={() => onEditStart(message)}
            >
              <PencilIcon className="size-3.5" />
            </TooltipIconButton>
          )}
          {!isUser && !isStreaming && (
            <TooltipIconButton
              tooltip="Regenerate response"
              side="top"
              type="button"
              aria-label="Regenerate response"
              onClick={() => onRegenerate(message.id)}
            >
              <RefreshCwIcon className="size-3.5" />
            </TooltipIconButton>
          )}
          {onFork !== undefined && message.id !== "" && !isStreaming && (
            <TooltipIconButton
              tooltip="Fork from this message"
              side="top"
              type="button"
              aria-label="Fork from message"
              onClick={() => onFork(message.id)}
            >
              <GitBranchIcon className="size-3.5" />
            </TooltipIconButton>
          )}
          {!isUser && !isStreaming && getText(message).trim() !== "" && (
            <>
              <TooltipIconButton
                tooltip="Save to memory"
                side="top"
                type="button"
                aria-label="Remember message"
                onClick={() => void onRemember(message)}
              >
                <BookmarkIcon className="size-3.5" />
              </TooltipIconButton>
              <TooltipIconButton
                tooltip="Export as Markdown"
                side="top"
                type="button"
                aria-label="Export message as Markdown"
                onClick={exportMessage}
              >
                <DownloadIcon className="size-3.5" />
              </TooltipIconButton>
            </>
          )}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
};

export const Thread = ({
  composerControls,
  onForkMessage,
  onReferenceMessage,
}: {
  composerControls: ComposerControls;
  onForkMessage?: (messageId: string) => void;
  onReferenceMessage?: (messageId: string) => void;
}) => {
  const runtime = useChatRuntime();
  const [editorState, sendEditor] = useMachine(messageEditorMachine);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (distanceFromBottom < 160) viewport.scrollTo({ top: viewport.scrollHeight });
  }, [runtime.messages]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void runtime.submit();
  };
  const rememberMessage = async (message: UIMessage) => {
    const text = getText(message).trim();
    if (text === "") return;
    await extractMemories(text, runtime.sessionId);
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {runtime.isStreaming && (
        <div className="sr-only" role="status" aria-live="polite">
          Assistant is responding
        </div>
      )}
      <div
        ref={viewportRef}
        className="flex-1 overflow-y-auto"
        role="log"
        aria-relevant="additions"
      >
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
          {runtime.messages.length === 0 ? (
            <div className="my-auto space-y-6 text-center">
              <div>
                <h1 className="text-2xl font-semibold">What are we working on?</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ask about training, recovery, sleep, or progress.
                </p>
              </div>
              <div className="mx-auto grid max-w-xl gap-2 sm:grid-cols-2">
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    className="h-auto justify-start whitespace-normal p-3 text-left"
                    onClick={() => void runtime.submit(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            runtime.messages.map((message, index) => (
              <ChatMessage
                key={message.id === "" ? `${message.role}-${index}` : message.id}
                message={message}
                isStreaming={
                  runtime.isStreaming &&
                  index === runtime.messages.length - 1 &&
                  message.role === "assistant"
                }
                onFork={onForkMessage}
                onRemember={rememberMessage}
                editingDraft={
                  editorState.context.messageId === message.id
                    ? editorState.context.draft
                    : undefined
                }
                onEditStart={(selectedMessage) =>
                  sendEditor({
                    type: "edit.start",
                    messageId: selectedMessage.id,
                    draft: getText(selectedMessage),
                  })
                }
                onEditChange={(draft) => sendEditor({ type: "edit.change", draft })}
                onEditCancel={() => sendEditor({ type: "edit.cancel" })}
                onEditSubmit={() => {
                  void runtime.revise({ messageId: message.id, text: editorState.context.draft });
                  sendEditor({ type: "edit.cancel" });
                }}
                onRegenerate={(messageId) => void runtime.revise({ messageId })}
                onReferenceMessage={onReferenceMessage}
              />
            ))
          )}
          <FollowUpSuggestions />
        </div>
      </div>

      <div className="bg-gradient-to-t from-background via-background to-transparent px-3 pt-5 pb-3">
        <form
          onSubmit={submit}
          className="mx-auto max-w-4xl rounded-[1.35rem] border bg-background/95 p-2 shadow-[0_12px_40px_-18px_color-mix(in_oklab,var(--foreground)_28%,transparent)] backdrop-blur-xl focus-within:border-ring/50 focus-within:ring-4 focus-within:ring-ring/10"
        >
          {runtime.files.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2 pb-2">
              {runtime.files.map((file) => (
                <div
                  key={file.url}
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
          <textarea
            value={runtime.draft}
            onChange={(event) => runtime.setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void runtime.submit();
              }
            }}
            placeholder="Send a message..."
            aria-label="Message input"
            rows={2}
            className="max-h-48 min-h-14 w-full resize-none bg-transparent px-3 py-2 text-base leading-relaxed outline-none"
          />
          {runtime.error !== null && (
            <div className="mx-2 mb-2 flex items-center justify-between rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span>{runtime.error.message}</span>
              <button type="button" onClick={runtime.clearError}>
                Dismiss
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1">
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
                          if (event.target.files !== null)
                            void runtime.addFiles(event.target.files);
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
              <SelectTrigger className="h-8 w-auto border-0 bg-transparent text-xs shadow-none">
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
              onClick={composerControls.onCoachModeChange}
            >
              <BrainIcon className="size-4" /> Coach
            </Button>
            <Button
              type="button"
              size="sm"
              variant={composerControls.webSearch ? "secondary" : "ghost"}
              disabled={!composerControls.canWebSearch}
              onClick={() => composerControls.onWebSearchChange(!composerControls.webSearch)}
            >
              <GlobeIcon className="size-4" /> Web
            </Button>
            <Button
              type="button"
              size="sm"
              variant={composerControls.temporary ? "secondary" : "ghost"}
              disabled={runtime.isStreaming}
              onClick={() => composerControls.onTemporaryChange(!composerControls.temporary)}
            >
              <GhostIcon className="size-4" /> Temporary
            </Button>
            <TooltipIconButton
              tooltip={runtime.isStreaming ? "Stop generating" : "Send message"}
              side="top"
              type={runtime.isStreaming ? "button" : "submit"}
              variant="default"
              className="ms-auto size-9 rounded-full"
              onClick={runtime.isStreaming ? runtime.stop : undefined}
              aria-label={runtime.isStreaming ? "Stop generating" : "Send message"}
            >
              {runtime.isStreaming ? (
                <SquareIcon className="size-4" />
              ) : (
                <ArrowUpIcon className="size-4" />
              )}
            </TooltipIconButton>
          </div>
        </form>
      </div>
    </div>
  );
};
