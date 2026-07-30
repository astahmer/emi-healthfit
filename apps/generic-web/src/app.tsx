import { convertFileListToFileUIParts, type UIMessage } from "ai";
import { useActorRef, useSelector } from "@xstate/react";
import {
  genericChatAppMachine,
  createConversationClient,
  type ChatSessionEvent,
  type ChatTransportActorEvent,
  type ConversationStoreActorEvent,
} from "@emi/core/web";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./app.css";
import { genericChatAppConfig } from "./app-config.ts";
import { defaultChatSettings, readChatSettings, type ChatSettings } from "./chat-settings.ts";
const messageText = (message: UIMessage): string =>
  message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

export const App = () => {
  const conversationClient = useMemo(
    () =>
      createConversationClient({
        apiOrigin: import.meta.env.VITE_API_ORIGIN ?? "",
        fetch: window.fetch.bind(window),
      }),
    [],
  );
  const messageContainer = useRef<HTMLDivElement | null>(null);
  const messageElements = useRef(new Map<string, HTMLElement>());
  const [settings, setSettings] = useState<ChatSettings>(defaultChatSettings);
  const chatAppActor = useActorRef(genericChatAppMachine, {
    input: {
      api: `${import.meta.env.VITE_API_ORIGIN ?? ""}/api/chat`,
      fetch: window.fetch.bind(window),
      createId: () => crypto.randomUUID(),
      client: conversationClient,
    },
  });
  const sessionActor = chatAppActor.getSnapshot().children.session;
  if (sessionActor === undefined) throw new Error("Chat session actor is unavailable.");
  const conversationStoreActor = chatAppActor.getSnapshot().children.conversationStore;
  if (conversationStoreActor === undefined)
    throw new Error("Conversation store actor is unavailable.");
  const sessionState = useSelector(sessionActor, (snapshot) => snapshot);
  const conversationStoreState = useSelector(conversationStoreActor, (snapshot) => snapshot);
  const dispatchSession = useCallback(
    (event: ChatSessionEvent) => chatAppActor.send({ type: "session-event", event }),
    [chatAppActor],
  );
  const dispatchTransport = useCallback(
    (event: ChatTransportActorEvent) => chatAppActor.send({ type: "transport-event", event }),
    [chatAppActor],
  );
  const dispatchConversationStore = useCallback(
    (event: ConversationStoreActorEvent) =>
      chatAppActor.send({ type: "conversation-store-event", event }),
    [chatAppActor],
  );
  const [conversationSearch, setConversationSearch] = useState("");
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryDraft, setMemoryDraft] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const { conversationId, draft, error, files, messages, queuedFollowUps, temporary, threadId } =
    sessionState.context;
  const { conversations, memories, threads } = conversationStoreState.context;
  const streaming = sessionState.matches("streaming");

  useEffect(
    () => setSettings(readChatSettings({ storageKey: genericChatAppConfig.settingsStorageKey })),
    [],
  );
  useEffect(
    () => localStorage.setItem(genericChatAppConfig.settingsStorageKey, JSON.stringify(settings)),
    [settings],
  );
  useEffect(() => {
    const savedDraft = localStorage.getItem(`${genericChatAppConfig.settingsStorageKey}:draft`);
    if (savedDraft !== null) dispatchSession({ type: "draft-changed", draft: savedDraft });
  }, [dispatchSession]);
  useEffect(() => {
    const updateOnlineState = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);
  useEffect(() => {
    const storageKey = `${genericChatAppConfig.settingsStorageKey}:draft`;
    if (draft === "") {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(storageKey, draft);
  }, [draft]);

  const updateSettings = (patch: Partial<ChatSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  const chatRequestBody = (): Record<string, unknown> => ({
    system: settings.systemPrompt === "" ? undefined : settings.systemPrompt,
    config: {
      provider: settings.provider,
      apiKey: settings.apiKey,
      ...(settings.baseUrl === "" ? {} : { baseUrl: settings.baseUrl }),
      model: settings.model,
    },
    memory: {
      enabled: settings.memoryEnabled,
      ...(settings.memoryModel === "" ? {} : { model: settings.memoryModel }),
    },
    title: {
      ...(settings.titleModel === "" ? {} : { model: settings.titleModel }),
      ...(settings.titlePrompt === "" ? {} : { prompt: settings.titlePrompt }),
    },
  });

  const scrollToMessage = ({ id }: { id: string }) => {
    messageElements.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const scrollMessages = ({ target }: { target: "top" | "previous" | "bottom" }) => {
    const container = messageContainer.current;
    if (container === null) return;
    if (target === "top") {
      container.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (target === "bottom") {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      return;
    }
    const previous = messages.toReversed().find((message) => {
      const element = messageElements.current.get(message.id);
      return element !== undefined && element.offsetTop < container.scrollTop - 8;
    });
    if (previous !== undefined) scrollToMessage({ id: previous.id });
  };

  const startFresh = () => {
    dispatchTransport({ type: "stream-cancelled" });
    dispatchSession({ type: "fresh-started" });
    dispatchConversationStore({ type: "threads-cleared" });
  };

  const openConversation = ({ id }: { id: string }) =>
    dispatchConversationStore({ type: "conversation-load-requested", conversationId: id });

  const openThread = ({ id }: { id: string }) => {
    if (conversationId === undefined) return;
    dispatchConversationStore({
      type: "thread-load-requested",
      conversationId,
      threadId: id,
    });
  };

  const branchFromMessage = ({ messageId }: { messageId: string }) => {
    if (conversationId === undefined || temporary) return;
    dispatchConversationStore({
      type: "thread-create-requested",
      conversationId,
      anchorMessageId: messageId,
    });
  };

  const updateConversationAction = ({
    id,
    patch,
  }: {
    id: string;
    patch: { title?: string; status?: "regular" | "archived"; pinned?: boolean };
  }) => {
    dispatchConversationStore({ type: "conversation-update-requested", conversationId: id, patch });
  };

  const compactConversationAction = async ({ id }: { id: string }) => {
    if (settings.apiKey.trim() === "") {
      dispatchSession({
        type: "error-reported",
        error: "Add an API key in settings before compacting a conversation.",
      });
      return;
    }
    dispatchConversationStore({
      type: "conversation-compact-requested",
      conversationId: id,
      config: {
        provider: settings.provider,
        apiKey: settings.apiKey,
        ...(settings.baseUrl === "" ? {} : { baseUrl: settings.baseUrl }),
        model: settings.model,
      },
    });
  };

  const createMemoryAction = async () => {
    const content = memoryDraft.trim();
    if (content === "") return;
    dispatchConversationStore({ type: "memory-create-requested", content, search: memorySearch });
    setMemoryDraft("");
  };

  const deleteMemoryAction = ({ id }: { id: string }) =>
    dispatchConversationStore({ type: "memory-delete-requested", memoryId: id });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!online) {
      dispatchSession({
        type: "error-reported",
        error: "You are offline. Your draft is saved locally until you reconnect.",
      });
      return;
    }
    const text = draft.trim();
    if (text === "" && files.length === 0) return;
    if (streaming) {
      dispatchSession({
        type: "follow-up-queued",
        followUp: { id: crypto.randomUUID(), text, files },
      });
      return;
    }
    if (settings.apiKey.trim() === "") {
      dispatchSession({
        type: "error-reported",
        error: "Add an API key in settings before sending a message.",
      });
      return;
    }

    dispatchTransport({
      type: "stream-send-requested",
      request: {
        conversationId,
        threadId,
        temporary,
        messages,
        text,
        files,
        body: chatRequestBody(),
      },
    });
  };

  const forceSendQueued = ({ id }: { id: string }) => {
    const followUp = queuedFollowUps.find((item) => item.id === id);
    if (followUp === undefined) return;
    dispatchTransport({
      type: "queued-follow-up-force-requested",
      followUp,
      request: {
        conversationId,
        threadId,
        temporary,
        messages,
        body: chatRequestBody(),
      },
    });
  };

  return (
    <main className="chat-app" data-theme={settings.theme}>
      <aside className="settings-panel">
        <div>
          <p className="eyebrow">EMI CORE</p>
          <h1>{genericChatAppConfig.name}</h1>
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
              dispatchConversationStore({ type: "conversations-load-requested", search });
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
              <button onClick={() => openConversation({ id: conversation.id })} type="button">
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
                  onClick={() =>
                    dispatchConversationStore({
                      type: "conversation-clone-requested",
                      conversationId: conversation.id,
                    })
                  }
                  type="button"
                >
                  Clone
                </button>
                <button
                  aria-label="Compact conversation"
                  onClick={() => void compactConversationAction({ id: conversation.id })}
                  type="button"
                >
                  Compact
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
                    dispatchConversationStore({
                      type: "conversation-delete-requested",
                      conversationId: conversation.id,
                      resetSession: conversation.id === conversationId,
                    });
                  }}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
        {conversationId !== undefined && threads.length > 0 && (
          <section className="thread-list">
            <p>Branches</p>
            {threads.map((thread) => (
              <button
                className={thread.id === threadId ? "active" : undefined}
                key={thread.id}
                onClick={() => openThread({ id: thread.id })}
                type="button"
              >
                {thread.title || "Branch"}
              </button>
            ))}
          </section>
        )}
        <details className="memory-panel">
          <summary>Memories</summary>
          <label>
            Search memories
            <input
              onChange={(event) => {
                const search = event.target.value;
                setMemorySearch(search);
                dispatchConversationStore({ type: "memory-load-requested", search });
              }}
              placeholder="Search saved details"
              value={memorySearch}
            />
          </label>
          <textarea
            onChange={(event) => setMemoryDraft(event.target.value)}
            placeholder="Save a detail for future chats"
            rows={2}
            value={memoryDraft}
          />
          <button disabled={memoryDraft.trim() === ""} onClick={createMemoryAction} type="button">
            Save memory
          </button>
          <div className="memory-list">
            {memories.map((memory) => (
              <div key={memory.id}>
                <span>{memory.content}</span>
                <button onClick={() => deleteMemoryAction({ id: memory.id })} type="button">
                  Delete
                </button>
              </div>
            ))}
          </div>
        </details>
        <label>
          Theme
          <select
            onChange={(event) =>
              updateSettings({ theme: event.target.value === "dark" ? "dark" : "light" })
            }
            value={settings.theme}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
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
            checked={settings.memoryEnabled}
            onChange={(event) => updateSettings({ memoryEnabled: event.target.checked })}
            type="checkbox"
          />
          Remember useful details from replies
        </label>
        <label>
          Memory model
          <input
            onChange={(event) => updateSettings({ memoryModel: event.target.value })}
            placeholder="gpt-4o-mini"
            value={settings.memoryModel}
          />
        </label>
        <label className="toggle">
          <input
            checked={temporary}
            onChange={(event) => {
              dispatchSession({ type: "temporary-changed", temporary: event.target.checked });
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
        <p className="muted connection-status">
          {online ? "Online" : "Offline · draft saved locally"}
        </p>
        <details className="release-notes">
          <summary>Release notes · v{genericChatAppConfig.version}</summary>
          <ul>
            {genericChatAppConfig.releaseNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      </aside>

      <section className="chat-panel">
        <header>
          <div>
            <p className="eyebrow">{temporary ? "TEMPORARY" : "CONVERSATION"}</p>
            <h2>
              {messages.length === 0
                ? "How can I help?"
                : threadId === undefined
                  ? genericChatAppConfig.name
                  : "Branch"}
            </h2>
          </div>
          <div className="message-navigation">
            <button onClick={() => scrollMessages({ target: "top" })} type="button">
              Top
            </button>
            <button onClick={() => scrollMessages({ target: "previous" })} type="button">
              Previous
            </button>
            <button onClick={() => scrollMessages({ target: "bottom" })} type="button">
              Bottom
            </button>
          </div>
          {streaming && (
            <button
              className="secondary-button"
              onClick={() => dispatchTransport({ type: "stream-cancelled" })}
              type="button"
            >
              Stop
            </button>
          )}
        </header>

        <div className="message-content">
          <aside aria-label="User message minimap" className="message-minimap">
            {messages
              .filter((message) => message.role === "user")
              .map((message) => {
                const preview = messageText(message) || "Attachment";
                return (
                  <button
                    aria-label={`Scroll to ${preview}`}
                    key={message.id}
                    onClick={() => scrollToMessage({ id: message.id })}
                    title={preview}
                    type="button"
                  >
                    <span />
                    {preview}
                  </button>
                );
              })}
          </aside>
          <div
            aria-live="polite"
            className="messages"
            data-testid="messages"
            ref={messageContainer}
          >
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
                    if (element === null) messageElements.current.delete(message.id);
                    else messageElements.current.set(message.id, element);
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
                      onClick={() => branchFromMessage({ messageId: message.id })}
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

        {error !== undefined && <p className="error-message">{error}</p>}
        {queuedFollowUps.length > 0 && (
          <section className="follow-up-queue">
            <p>Queued follow-ups</p>
            {queuedFollowUps.map((queued) => (
              <div key={queued.id}>
                <span>{queued.text || `${queued.files.length} attachment(s)`}</span>
                <button onClick={() => void forceSendQueued({ id: queued.id })} type="button">
                  Force send
                </button>
                <button
                  aria-label="Remove queued follow-up"
                  onClick={() =>
                    dispatchSession({ type: "queued-follow-up-removed", id: queued.id })
                  }
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
          </section>
        )}
        <form className="composer" onSubmit={submit}>
          <label className="attachment-button">
            Attach
            <input
              aria-label="Add attachments"
              multiple
              onChange={(event) => {
                void convertFileListToFileUIParts(event.target.files ?? undefined)
                  .then((nextFiles) => dispatchSession({ type: "files-added", files: nextFiles }))
                  .catch(() =>
                    dispatchSession({
                      type: "error-reported",
                      error: "Unable to prepare one or more attachments.",
                    }),
                  );
                event.target.value = "";
              }}
              type="file"
            />
          </label>
          <textarea
            aria-label="Message"
            onChange={(event) =>
              dispatchSession({ type: "draft-changed", draft: event.target.value })
            }
            placeholder={`Message ${genericChatAppConfig.name}`}
            value={draft}
          />
          <button disabled={draft.trim() === "" && files.length === 0} type="submit">
            {streaming ? "Queue" : "Send"}
          </button>
        </form>
        {files.length > 0 && (
          <div className="attachment-list">
            {files.map((file) => (
              <button
                key={file.url}
                onClick={() =>
                  dispatchSession({
                    type: "files-changed",
                    files: files.filter((item) => item.url !== file.url),
                  })
                }
                type="button"
              >
                {file.filename ?? "Attachment"} ×
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
};
