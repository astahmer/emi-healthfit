import * as Schema from "effect/Schema";
import type { FormEvent, ReactNode } from "react";
import { useChatActions, useChatSelector } from "../react-hooks.ts";
import type { ChatMessage } from "../protocol/messages.ts";
import type { MessagePart as ProtocolMessagePart } from "../protocol/parts.ts";

const isSafeAttachment = Schema.is(
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    mediaType: Schema.String,
    url: Schema.String.check(Schema.isPattern(/^(?:https?:\/\/|\/(?!\/))/i)),
  }),
);

export const MessagePart = ({ part }: { readonly part: ProtocolMessagePart }): ReactNode => {
  if (part.type === "text" || part.type === "reasoning")
    return <span data-part={part.type}>{part.text}</span>;
  if (part.type === "file") {
    if (!isSafeAttachment(part.file)) return <span>[attachment blocked]</span>;
    return <img alt={part.file.name} src={part.file.url} />;
  }
  if (part.type === "tool-call") return <span>{part.call.name}</span>;
  return (
    <details>
      <summary>Tool result</summary>
      <pre>{JSON.stringify(part.result.output, null, 2)}</pre>
    </details>
  );
};

export const Message = ({
  message,
  renderPart,
}: {
  readonly message: ChatMessage;
  readonly renderPart?: (part: ProtocolMessagePart) => ReactNode;
}) => (
  <article aria-label={`${message.role} message`} data-message-id={message.id}>
    {message.parts.map((part, index) => (
      <div key={`${message.id}:${index}`}>{renderPart?.(part) ?? <MessagePart part={part} />}</div>
    ))}
  </article>
);

export const ThreadViewport = ({
  messages,
  children,
}: {
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly children?: ReactNode;
}) => (
  <section aria-label="Conversation" data-testid="thread-viewport">
    <div aria-live="polite" data-testid="messages" role="log">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
    </div>
    {children}
  </section>
);

export const Composer = ({
  value,
  onChange,
  onSubmit,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
}) => {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form aria-label="Chat composer" onSubmit={submit}>
      <textarea
        aria-label="Message"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      <button disabled={value.trim() === ""} type="submit">
        Send
      </button>
    </form>
  );
};

export const ConversationList = ({
  conversations,
  onSelect,
}: {
  readonly conversations: ReadonlyArray<{ readonly id: string; readonly title: string }>;
  readonly onSelect: (conversationId: string) => void;
}) => (
  <nav aria-label="Conversation history">
    {conversations.map((conversation) => (
      <button key={conversation.id} onClick={() => onSelect(conversation.id)} type="button">
        {conversation.title}
      </button>
    ))}
  </nav>
);

export const Sidebar = ({ children }: { readonly children?: ReactNode }) => (
  <aside aria-label="Chat sidebar">{children}</aside>
);

export const Dialog = ({
  open,
  onOpenChange,
  children,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly children?: ReactNode;
}) => {
  if (!open) return null;
  return (
    <div aria-modal="true" onClick={() => onOpenChange(false)} role="dialog">
      <div onClick={(event) => event.stopPropagation()}>{children}</div>
    </div>
  );
};

export const ConnectedThread = () => {
  const thread = useChatSelector((state) => state.activeThread);
  return (
    <div data-testid="chat-thread">
      <ThreadViewport messages={thread.messages} />
    </div>
  );
};

export const ConnectedComposer = () => {
  const composer = useChatSelector((state) => state.composer);
  const actions = useChatActions();
  return (
    <Composer
      onChange={(text) => actions.setDraft({ text })}
      onSubmit={() => actions.sendMessage({ text: composer.text })}
      value={composer.text}
    />
  );
};

export const ConnectedSidebar = () => {
  const conversations = useChatSelector((state) => state.conversations.items);
  const actions = useChatActions();
  return (
    <ConversationList
      conversations={conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title ?? "Untitled chat",
      }))}
      onSelect={(conversationId) => actions.selectConversation({ conversationId })}
    />
  );
};
