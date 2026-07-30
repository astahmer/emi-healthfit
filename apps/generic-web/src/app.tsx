import { DefaultChatTransport, readUIMessageStream, type UIMessage } from "ai";
import { type FormEvent, useEffect, useRef, useState } from "react";
import "./app.css";
import { defaultChatSettings, readChatSettings, type ChatSettings } from "./chat-settings.ts";
import {
  cloneConversation,
  deleteConversation,
  listConversations,
  loadConversation,
  updateConversation,
  type Conversation,
} from "./conversation-client.ts";

const settingsStorageKey = "emi-core-chat-settings";

const messageText = (message: UIMessage): string =>
  message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

const replaceMessage = ({
  messages,
  message,
}: {
  messages: UIMessage[];
  message: UIMessage;
}): UIMessage[] => {
  const index = messages.findIndex((candidate) => candidate.id === message.id);
  if (index < 0) return [...messages, message];
  return [...messages.slice(0, index), message, ...messages.slice(index + 1)];
};

export const App = () => {
  const abortController = useRef<AbortController | undefined>(undefined);
  const [settings, setSettings] = useState<ChatSettings>(defaultChatSettings);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationSearch, setConversationSearch] = useState("");
  const [temporary, setTemporary] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => setSettings(readChatSettings({ storageKey: settingsStorageKey })), []);
  useEffect(() => localStorage.setItem(settingsStorageKey, JSON.stringify(settings)), [settings]);

  const refreshConversations = async ({ search }: { search: string }) => {
    try {
      setConversations(await listConversations({ search }));
    } catch {
      setConversations([]);
    }
  };

  useEffect(() => {
    void refreshConversations({ search: "" });
  }, []);

  const updateSettings = (patch: Partial<ChatSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  const startFresh = () => {
    abortController.current?.abort();
    abortController.current = undefined;
    setConversationId(undefined);
    setMessages([]);
    setDraft("");
    setError(undefined);
    setStreaming(false);
  };

  const openConversation = async ({ id }: { id: string }) => {
    try {
      const loaded = await loadConversation({ conversationId: id });
      setConversationId(loaded.conversation.id);
      setMessages(loaded.messages);
      setTemporary(false);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load this conversation.");
    }
  };

  const updateConversationAction = async ({
    id,
    patch,
  }: {
    id: string;
    patch: { title?: string; status?: "regular" | "archived"; pinned?: boolean };
  }) => {
    try {
      const updated = await updateConversation({ conversationId: id, patch });
      setConversations((current) =>
        current.map((conversation) => (conversation.id === updated.id ? updated : conversation)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update this conversation.");
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (text === "" || streaming) return;
    if (settings.apiKey.trim() === "") {
      setError("Add an API key in settings before sending a message.");
      return;
    }

    const userMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text }],
    };
    const nextMessages = [...messages, userMessage];
    const controller = new AbortController();
    abortController.current = controller;
    setMessages(nextMessages);
    setDraft("");
    setError(undefined);
    setStreaming(true);

    try {
      const transport = new DefaultChatTransport<UIMessage>({
        api: `${import.meta.env.VITE_API_ORIGIN ?? ""}/api/chat`,
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          const returnedConversationId = response.headers.get("x-conversation-id");
          if (returnedConversationId !== null) {
            setConversationId(returnedConversationId);
            void refreshConversations({ search: conversationSearch });
          }
          return response;
        },
      });
      const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: conversationId ?? userMessage.id,
        messageId: userMessage.id,
        messages: nextMessages,
        abortSignal: controller.signal,
        body: {
          sessionId: conversationId,
          temporary,
          system: settings.systemPrompt === "" ? undefined : settings.systemPrompt,
          config: {
            provider: settings.provider,
            apiKey: settings.apiKey,
            ...(settings.baseUrl === "" ? {} : { baseUrl: settings.baseUrl }),
            model: settings.model,
          },
          title: {
            ...(settings.titleModel === "" ? {} : { model: settings.titleModel }),
            ...(settings.titlePrompt === "" ? {} : { prompt: settings.titlePrompt }),
          },
        },
      });
      for await (const streamedMessage of readUIMessageStream({
        stream,
        terminateOnError: true,
      })) {
        setMessages((current) => replaceMessage({ messages: current, message: streamedMessage }));
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "Unable to complete this chat request.");
    } finally {
      if (abortController.current === controller) abortController.current = undefined;
      setStreaming(false);
    }
  };

  return (
    <main className="chat-app">
      <aside className="settings-panel">
        <div>
          <p className="eyebrow">EMI CORE</p>
          <h1>Core Chat</h1>
          <p className="muted">
            Generic streaming chat starter. Your provider key stays in this browser.
          </p>
        </div>
        <button className="secondary-button" onClick={startFresh} type="button">
          New chat
        </button>
        <label>
          Search conversations
          <input
            onChange={(event) => {
              const search = event.target.value;
              setConversationSearch(search);
              void refreshConversations({ search });
            }}
            placeholder="Search chats"
            value={conversationSearch}
          />
        </label>
        <div className="conversation-list">
          {conversations.map((conversation) => (
            <article
              className={
                conversation.id === conversationId ? "conversation active" : "conversation"
              }
              key={conversation.id}
            >
              <button onClick={() => void openConversation({ id: conversation.id })} type="button">
                {conversation.title || "New chat"}
              </button>
              <div className="conversation-actions">
                <button
                  aria-label={conversation.pinned ? "Unpin conversation" : "Pin conversation"}
                  onClick={() =>
                    void updateConversationAction({
                      id: conversation.id,
                      patch: { pinned: !conversation.pinned },
                    })
                  }
                  type="button"
                >
                  {conversation.pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  aria-label="Rename conversation"
                  onClick={() => {
                    const title = window.prompt("Conversation name", conversation.title ?? "");
                    if (title === null || title.trim() === "") return;
                    void updateConversationAction({
                      id: conversation.id,
                      patch: { title: title.trim() },
                    });
                  }}
                  type="button"
                >
                  Rename
                </button>
                <button
                  aria-label="Clone conversation"
                  onClick={() => {
                    void cloneConversation({ conversationId: conversation.id })
                      .then((cloned) => {
                        setConversations((current) => [cloned, ...current]);
                        void openConversation({ id: cloned.id });
                      })
                      .catch(() => setError("Unable to clone this conversation."));
                  }}
                  type="button"
                >
                  Clone
                </button>
                <button
                  aria-label="Archive conversation"
                  onClick={() =>
                    void updateConversationAction({
                      id: conversation.id,
                      patch: { status: conversation.status === "regular" ? "archived" : "regular" },
                    })
                  }
                  type="button"
                >
                  {conversation.status === "regular" ? "Archive" : "Restore"}
                </button>
                <button
                  aria-label="Delete conversation"
                  onClick={() => {
                    if (!window.confirm("Delete this conversation permanently?")) return;
                    void deleteConversation({ conversationId: conversation.id })
                      .then(() => {
                        setConversations((current) =>
                          current.filter((item) => item.id !== conversation.id),
                        );
                        if (conversation.id === conversationId) startFresh();
                      })
                      .catch(() => setError("Unable to delete this conversation."));
                  }}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
        <label>
          API key
          <input
            autoComplete="off"
            onChange={(event) => updateSettings({ apiKey: event.target.value })}
            placeholder="sk-..."
            type="password"
            value={settings.apiKey}
          />
        </label>
        <label>
          Provider base URL
          <input
            onChange={(event) => updateSettings({ baseUrl: event.target.value })}
            placeholder="https://api.openai.com/v1"
            value={settings.baseUrl}
          />
        </label>
        <label>
          Default model
          <input
            onChange={(event) => updateSettings({ model: event.target.value })}
            placeholder="gpt-4o-mini"
            value={settings.model}
          />
        </label>
        <label>
          Default system prompt
          <textarea
            onChange={(event) => updateSettings({ systemPrompt: event.target.value })}
            placeholder="Optional instructions for every answer"
            rows={3}
            value={settings.systemPrompt}
          />
        </label>
        <label>
          Title model
          <input
            onChange={(event) => updateSettings({ titleModel: event.target.value })}
            placeholder="gpt-4o-mini"
            value={settings.titleModel}
          />
        </label>
        <label>
          Title prompt
          <textarea
            onChange={(event) => updateSettings({ titlePrompt: event.target.value })}
            placeholder="Optional instructions for automatic conversation titles"
            rows={2}
            value={settings.titlePrompt}
          />
        </label>
        <label className="toggle">
          <input
            checked={temporary}
            onChange={(event) => {
              setTemporary(event.target.checked);
              startFresh();
            }}
            type="checkbox"
          />
          Temporary chat
        </label>
        <p className="muted metadata">
          {temporary
            ? "Not saved"
            : conversationId === undefined
              ? "New conversation"
              : conversationId}
        </p>
      </aside>

      <section className="chat-panel">
        <header>
          <div>
            <p className="eyebrow">{temporary ? "TEMPORARY" : "CONVERSATION"}</p>
            <h2>{messages.length === 0 ? "How can I help?" : "Core Chat"}</h2>
          </div>
          {streaming && (
            <button
              className="secondary-button"
              onClick={() => abortController.current?.abort()}
              type="button"
            >
              Stop
            </button>
          )}
        </header>

        <div aria-live="polite" className="messages" data-testid="messages">
          {messages.length === 0 ? (
            <div className="empty-state">
              <p>Ask anything. Configure a GPT-compatible provider in the settings panel.</p>
            </div>
          ) : (
            messages.map((message) => (
              <article className={`message message-${message.role}`} key={message.id}>
                <p className="message-role">{message.role}</p>
                <div>
                  {messageText(message) ||
                    (message.role === "assistant" && streaming ? "Thinking…" : "")}
                </div>
              </article>
            ))
          )}
        </div>

        {error !== undefined && <p className="error-message">{error}</p>}
        <form className="composer" onSubmit={submit}>
          <textarea
            aria-label="Message"
            disabled={streaming}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Message Core Chat"
            value={draft}
          />
          <button disabled={streaming || draft.trim() === ""} type="submit">
            Send
          </button>
        </form>
      </section>
    </main>
  );
};
