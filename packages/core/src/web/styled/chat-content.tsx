import type { FileUIPart, UIMessage } from "ai";
import type { RefObject } from "react";
import { ArrowDownIcon, ArrowUpIcon, PaperclipIcon, SquareIcon } from "lucide-react";

import type { QueuedFollowUp } from "../chat-session-machine.ts";

const messageText = (message: UIMessage): string =>
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
  <header className="chat-header">
    <div className="chat-header-title">
      <button
        aria-expanded={sidebarOpen}
        aria-label={sidebarOpen ? "Collapse chat sidebar" : "Open chat sidebar"}
        className="core-sidebar-toggle"
        onClick={onToggleSidebar}
        type="button"
      >
        <span aria-hidden="true">☰</span>
        <span className="core-visually-hidden">
          {sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
        </span>
      </button>
      <div>
        <p className="eyebrow">{temporary ? "TEMPORARY" : "CONVERSATION"}</p>
        <h2>
          {messageCount === 0 ? "How can I help?" : threadId === undefined ? appName : "Branch"}
        </h2>
      </div>
    </div>
    <div className="message-navigation">
      <button aria-label="Scroll to top" onClick={() => onScroll("top")} type="button">
        <ArrowUpIcon aria-hidden="true" size={14} />
        Top
      </button>
      <button
        aria-label="Scroll to previous message"
        onClick={() => onScroll("previous")}
        type="button"
      >
        Previous
      </button>
      <button aria-label="Scroll to bottom" onClick={() => onScroll("bottom")} type="button">
        <ArrowDownIcon aria-hidden="true" size={14} />
        Bottom
      </button>
    </div>
    {streaming && (
      <button className="secondary-button" onClick={onStop} type="button">
        <SquareIcon aria-hidden="true" size={14} />
        Stop
      </button>
    )}
  </header>
);

export const MessageMinimap = ({
  messages,
  onSelect,
}: {
  messages: UIMessage[];
  onSelect: (messageId: string) => void;
}) => (
  <aside aria-label="User message minimap" className="message-minimap">
    {messages
      .filter((message) => message.role === "user")
      .map((message) => {
        const preview = messageText(message) || "Attachment";
        return (
          <button
            aria-label={`Scroll to ${preview}`}
            key={message.id}
            onClick={() => onSelect(message.id)}
            title={preview}
            type="button"
          >
            <span />
            {preview}
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
  messages: UIMessage[];
  conversationId: string | undefined;
  temporary: boolean;
  streaming: boolean;
  messageContainer: RefObject<HTMLDivElement | null>;
  messageElements: Map<string, HTMLElement>;
  onSelectMinimapMessage: (messageId: string) => void;
  onBranchMessage: (messageId: string) => void;
}) => (
  <div className="message-content">
    <MessageMinimap messages={messages} onSelect={onSelectMinimapMessage} />
    <div aria-live="polite" className="messages" data-testid="messages" ref={messageContainer}>
      {messages.length === 0 ? (
        <div className="empty-state">
          <p>Ask anything. Configure a GPT-compatible provider in the settings panel.</p>
        </div>
      ) : (
        messages.map((message) => (
          <article
            className={`message message-${message.role}`}
            key={message.id}
            ref={(element) => {
              if (element === null) messageElements.delete(message.id);
              else messageElements.set(message.id, element);
            }}
          >
            <p className="message-role">{message.role}</p>
            <div>
              {messageText(message) ||
                (message.role === "assistant" && streaming ? "Thinking…" : "")}
            </div>
            {conversationId !== undefined && !temporary && (
              <button
                className="message-branch-button"
                onClick={() => onBranchMessage(message.id)}
                type="button"
              >
                Branch here
              </button>
            )}
          </article>
        ))
      )}
    </div>
  </div>
);

export const FollowUpQueue = ({
  followUps,
  onForceSend,
  onRemove,
}: {
  followUps: QueuedFollowUp[];
  onForceSend: (followUp: QueuedFollowUp) => void;
  onRemove: (followUpId: string) => void;
}) => {
  if (followUps.length === 0) return null;
  return (
    <section className="follow-up-queue">
      <p>Queued follow-ups</p>
      {followUps.map((followUp) => (
        <div key={followUp.id}>
          <span>{followUp.text || `${followUp.files.length} attachment(s)`}</span>
          <button onClick={() => onForceSend(followUp)} type="button">
            Force send
          </button>
          <button
            aria-label="Remove queued follow-up"
            onClick={() => onRemove(followUp.id)}
            type="button"
          >
            Remove
          </button>
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
  files: FileUIPart[];
  streaming: boolean;
  placeholder: string;
  onDraftChange: (draft: string) => void;
  onFilesSelected: (files: FileList | undefined) => void;
  onSubmit: () => void;
  onRemoveFile: (file: FileUIPart) => void;
}) => (
  <>
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="attachment-button">
        <PaperclipIcon aria-hidden="true" size={16} />
        Attach
        <input
          aria-label="Add attachments"
          multiple
          onChange={(event) => {
            onFilesSelected(event.target.files ?? undefined);
            event.target.value = "";
          }}
          type="file"
        />
      </label>
      <textarea
        aria-label="Message"
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder={placeholder}
        value={draft}
      />
      <button disabled={draft.trim() === "" && files.length === 0} type="submit">
        {streaming ? "Queue" : "Send"}
      </button>
    </form>
    {files.length > 0 && (
      <div className="attachment-list">
        {files.map((file) => (
          <button key={file.url} onClick={() => onRemoveFile(file)} type="button">
            {file.filename ?? "Attachment"} ×
          </button>
        ))}
      </div>
    )}
  </>
);
