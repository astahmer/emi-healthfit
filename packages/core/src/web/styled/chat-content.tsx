import { useState, type RefObject } from "react";
import { ArrowDownIcon, ArrowUpIcon, PaperclipIcon, SquareIcon } from "lucide-react";

import type { Attachment, ChatMessage } from "../../protocol/index.ts";
import type { QueuedFollowUpState } from "../../runtime/index.ts";
import { Bubble, BubbleContent } from "./ui/bubble.tsx";
import { Button } from "./ui/button.tsx";
import { Message, MessageContent, MessageFooter } from "./ui/message.tsx";
import { Textarea } from "./ui/textarea.tsx";
import { ChatSidebarToggle } from "./chat-sidebar.tsx";
import { cn } from "./ui/utils.ts";

const messageText = (message: ChatMessage): string =>
  message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

export const ChatHeader = ({
  appName,
  temporary,
  threadId,
  messageCount,
  streaming,
  sidebarOpen,
  onToggleSidebar,
  onScroll,
  onStop,
}: {
  appName: string;
  temporary: boolean;
  threadId: string | undefined;
  messageCount: number;
  streaming: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onScroll: (target: "top" | "previous" | "bottom") => void;
  onStop: () => void;
}) => (
  <header className="flex shrink-0 items-center gap-2 border-b px-2 py-2 md:px-4">
    <ChatSidebarToggle onToggle={onToggleSidebar} open={sidebarOpen} />
    <div className="min-w-0">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        {temporary ? "Temporary" : "Conversation"}
      </p>
      <h2 className="truncate text-lg font-semibold tracking-tight md:text-xl">
        {messageCount === 0 ? "How can I help?" : threadId === undefined ? appName : "Branch"}
      </h2>
    </div>
    <div className="ms-auto flex items-center gap-1">
      <Button
        aria-label="Scroll to top"
        size="sm"
        variant="outline"
        onClick={() => onScroll("top")}
      >
        <ArrowUpIcon />
        <span className="hidden sm:inline">Top</span>
      </Button>
      <Button
        aria-label="Scroll to previous message"
        size="sm"
        variant="outline"
        onClick={() => onScroll("previous")}
      >
        Previous
      </Button>
      <Button
        aria-label="Scroll to bottom"
        size="sm"
        variant="outline"
        onClick={() => onScroll("bottom")}
      >
        <ArrowDownIcon />
        <span className="hidden sm:inline">Bottom</span>
      </Button>
      {streaming && (
        <Button aria-label="Stop generation" size="sm" variant="secondary" onClick={onStop}>
          <SquareIcon />
          <span className="hidden sm:inline">Stop</span>
        </Button>
      )}
    </div>
  </header>
);

export const MessageMinimap = ({
  messages,
  onSelect,
}: {
  messages: ReadonlyArray<ChatMessage>;
  onSelect: (messageId: string) => void;
}) => (
  <aside
    aria-label="User message minimap"
    className="hidden w-36 shrink-0 flex-col gap-1 p-4 lg:flex"
  >
    {messages
      .filter((message) => message.role === "user")
      .map((message) => {
        const preview = messageText(message) || "Attachment";
        return (
          <button
            aria-label={`Scroll to ${preview}`}
            className="grid min-w-0 grid-cols-[0.25rem_minmax(0,1fr)] gap-2 rounded-md p-1 text-left text-xs text-muted-foreground hover:bg-muted"
            key={message.id}
            onClick={() => onSelect(message.id)}
            title={preview}
            type="button"
          >
            <span className="rounded-full bg-primary" />
            <span className="truncate">{preview}</span>
          </button>
        );
      })}
  </aside>
);

export const MessageViewport = ({
  messages,
  conversationId,
  temporary,
  streaming,
  messageContainer,
  messageElements,
  onSelectMinimapMessage,
  onBranchMessage,
}: {
  messages: ReadonlyArray<ChatMessage>;
  conversationId: string | undefined;
  temporary: boolean;
  streaming: boolean;
  messageContainer: RefObject<HTMLDivElement | null>;
  messageElements: Map<string, HTMLElement>;
  onSelectMinimapMessage: (messageId: string) => void;
  onBranchMessage: (messageId: string) => void;
}) => {
  const [copiedMessageId, setCopiedMessageId] = useState<string>();

  const copyMessage = async ({ messageId, text }: { messageId: string; text: string }) => {
    if (typeof navigator === "undefined" || navigator.clipboard === undefined) return;
    await navigator.clipboard.writeText(text);
    setCopiedMessageId(messageId);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <MessageMinimap messages={messages} onSelect={onSelectMinimapMessage} />
      <div
        aria-live="polite"
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6"
        data-testid="messages"
        ref={messageContainer}
      >
        {messages.length === 0 ? (
          <div className="m-auto max-w-md text-center text-muted-foreground">
            <p>Ask anything. Configure a GPT-compatible provider in the settings panel.</p>
          </div>
        ) : (
          messages.map((message) => {
            const text = messageText(message);
            const isUser = message.role === "user";
            return (
              <Message
                align={isUser ? "end" : "start"}
                className="mx-auto max-w-3xl"
                data-message-id={message.id}
                key={message.id}
                ref={(element) => {
                  if (element === null) messageElements.delete(message.id);
                  else messageElements.set(message.id, element);
                }}
              >
                <MessageContent>
                  <Bubble align={isUser ? "end" : "start"}>
                    <BubbleContent
                      className={cn(
                        isUser
                          ? "bg-primary text-primary-foreground"
                          : "border bg-card text-card-foreground",
                      )}
                    >
                      <p className="mb-1 text-[10px] font-semibold tracking-[0.16em] text-current/60 uppercase">
                        {message.role}
                      </p>
                      <div className="whitespace-pre-wrap">
                        {text || (message.role === "assistant" && streaming ? "Thinking…" : "")}
                      </div>
                      {conversationId !== undefined && !temporary && (
                        <Button
                          className="mt-2"
                          onClick={() => onBranchMessage(message.id)}
                          size="xs"
                          variant={isUser ? "secondary" : "ghost"}
                        >
                          Branch here
                        </Button>
                      )}
                    </BubbleContent>
                  </Bubble>
                  <MessageFooter>
                    {message.role}
                    <Button
                      aria-label="Copy message"
                      onClick={() => void copyMessage({ messageId: message.id, text })}
                      size="xs"
                      variant="ghost"
                    >
                      {copiedMessageId === message.id ? "Message copied." : "Copy"}
                    </Button>
                  </MessageFooter>
                </MessageContent>
              </Message>
            );
          })
        )}
      </div>
    </div>
  );
};

export const FollowUpQueue = ({
  followUps,
  onForceSend,
  onRemove,
}: {
  followUps: ReadonlyArray<QueuedFollowUpState>;
  onForceSend: (followUp: QueuedFollowUpState) => void;
  onRemove: (followUpId: string) => void;
}) => {
  if (followUps.length === 0) return null;
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-md border bg-muted p-3">
      <p className="m-0 text-sm font-medium">Queued follow-ups</p>
      {followUps.map((followUp) => (
        <div className="flex items-center gap-2" key={followUp.id}>
          <span className="min-w-0 flex-1 truncate text-sm">
            {followUp.text || `${followUp.attachments.length} attachment(s)`}
          </span>
          <Button onClick={() => onForceSend(followUp)} size="xs">
            Force send
          </Button>
          <Button
            aria-label="Remove queued follow-up"
            onClick={() => onRemove(followUp.id)}
            size="xs"
            variant="ghost"
          >
            Remove
          </Button>
        </div>
      ))}
    </section>
  );
};

export const ChatComposer = ({
  draft,
  files,
  streaming,
  placeholder,
  onDraftChange,
  onFilesSelected,
  onSubmit,
  onRemoveFile,
}: {
  draft: string;
  files: ReadonlyArray<Attachment>;
  streaming: boolean;
  placeholder: string;
  onDraftChange: (draft: string) => void;
  onFilesSelected: (files: FileList | undefined) => void;
  onSubmit: () => void;
  onRemoveFile: (file: Attachment) => void;
}) => (
  <div className="shrink-0 border-t p-3 md:p-4">
    <form
      className="mx-auto flex w-full max-w-3xl items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Button asChild className="min-h-20 shrink-0 flex-col" size="lg" variant="outline">
        <label>
          <PaperclipIcon />
          <span>Attach</span>
          <input
            aria-label="Add attachments"
            className="sr-only"
            multiple
            onChange={(event) => {
              onFilesSelected(event.target.files ?? undefined);
              event.target.value = "";
            }}
            type="file"
          />
        </label>
      </Button>
      <Textarea
        aria-label="Message"
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder={placeholder}
        value={draft}
        className="min-h-20 resize-y bg-background"
      />
      <Button disabled={draft.trim() === "" && files.length === 0} type="submit" size="lg">
        {streaming ? "Queue" : "Send"}
      </Button>
    </form>
    {files.length > 0 && (
      <div className="mx-auto mt-2 flex w-full max-w-3xl flex-wrap gap-2">
        {files.map((file) => (
          <Button key={file.url} onClick={() => onRemoveFile(file)} size="xs" variant="secondary">
            {file.name} ×
          </Button>
        ))}
      </div>
    )}
  </div>
);
