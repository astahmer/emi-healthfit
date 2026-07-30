import {
  convertFileListToFileUIParts,
  DefaultChatTransport,
  readUIMessageStream,
  type UIMessage,
} from "ai";
import { type FormEvent, useEffect, useReducer, useRef, useState } from "react";
import "./app.css";
import { genericChatAppConfig } from "./app-config.ts";
import { initialChatSession, reduceChatSession } from "./chat-session.ts";
import { defaultChatSettings, readChatSettings, type ChatSettings } from "./chat-settings.ts";
import {
  cloneConversation,
  compactConversation,
  createMemory,
  createThread,
  deleteConversation,
  deleteMemory,
  listConversations,
  listMemories,
  listThreads,
  loadConversation,
  loadThread,
  updateConversation,
  type Conversation,
  type ConversationThread,
  type Memory,
} from "./conversation-client.ts";

const messageText = (message: UIMessage): string =>
  message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

export const App = () => {
  const abortController = useRef<AbortController | undefined>(undefined);
  const composerForm = useRef<HTMLFormElement | null>(null);
  const messageContainer = useRef<HTMLDivElement | null>(null);
  const messageElements = useRef(new Map<string, HTMLElement>());
  const streamOperation = useRef(0);
  const [settings, setSettings] = useState<ChatSettings>(defaultChatSettings);
  const [session, dispatchSession] = useReducer(reduceChatSession, initialChatSession);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [conversationSearch, setConversationSearch] = useState("");
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryDraft, setMemoryDraft] = useState("");
  const {
    conversationId,
    draft,
    error,
    files,
    messages,
    queuedFollowUps,
    streaming,
    temporary,
    threadId,
  } = session;

  useEffect(
    () => setSettings(readChatSettings({ storageKey: genericChatAppConfig.settingsStorageKey })),
    [],
  );
  useEffect(
    () => localStorage.setItem(genericChatAppConfig.settingsStorageKey, JSON.stringify(settings)),
    [settings],
  );

  const refreshConversations = async ({ search }: { search: string }) => {
    try {
      setConversations(await listConversations({ search }));
    } catch {
      setConversations([]);
    }
  };

  const refreshThreads = async ({ id }: { id: string }) => {
    try {
      setThreads(await listThreads({ conversationId: id }));
    } catch {
      setThreads([]);
    }
  };

  const refreshMemories = async ({ search }: { search: string }) => {
    try {
      setMemories(await listMemories({ search }));
    } catch {
      setMemories([]);
    }
  };

  useEffect(() => {
    void refreshConversations({ search: "" });
  }, []);
  useEffect(() => {
    void refreshMemories({ search: "" });
  }, []);

  const updateSettings = (patch: Partial<ChatSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

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
    streamOperation.current += 1;
    abortController.current?.abort();
    abortController.current = undefined;
    dispatchSession({ type: "fresh-started" });
    setThreads([]);
  };

  const consumeStream = async ({
    operation,
    stream,
  }: {
    operation: number;
    stream: ReadableStream<
      Parameters<typeof readUIMessageStream>[0]["stream"] extends ReadableStream<infer Chunk>
        ? Chunk
        : never
    >;
  }) => {
    for await (const streamedMessage of readUIMessageStream({ stream, terminateOnError: true })) {
      if (operation !== streamOperation.current) return;
      dispatchSession({ type: "stream-message", message: streamedMessage });
    }
  };

  const resumeConversation = async ({ id }: { id: string }) => {
    const operation = streamOperation.current + 1;
    streamOperation.current = operation;
    dispatchSession({ type: "stream-resumed" });
    try {
      const transport = new DefaultChatTransport<UIMessage>({
        api: `${import.meta.env.VITE_API_ORIGIN ?? ""}/api/chat`,
      });
      const stream = await transport.reconnectToStream({ chatId: id });
      if (stream === null) return;
      await consumeStream({ operation, stream });
    } catch {
      if (operation === streamOperation.current) {
        dispatchSession({ type: "error-reported", error: "Unable to resume this conversation." });
      }
    } finally {
      if (operation === streamOperation.current) dispatchSession({ type: "stream-finished" });
    }
  };

  const openConversation = async ({ id }: { id: string }) => {
    try {
      const loaded = await loadConversation({ conversationId: id });
      dispatchSession({
        type: "conversation-opened",
        conversationId: loaded.conversation.id,
        messages: loaded.messages,
      });
      void refreshThreads({ id: loaded.conversation.id });
      void resumeConversation({ id });
    } catch (cause) {
      dispatchSession({
        type: "error-reported",
        error: cause instanceof Error ? cause.message : "Unable to load this conversation.",
      });
    }
  };

  const openThread = async ({ id }: { id: string }) => {
    if (conversationId === undefined) return;
    try {
      const loaded = await loadThread({ conversationId, threadId: id });
      dispatchSession({
        type: "thread-opened",
        threadId: loaded.thread.id,
        messages: loaded.messages,
      });
    } catch (cause) {
      dispatchSession({
        type: "error-reported",
        error: cause instanceof Error ? cause.message : "Unable to load this branch.",
      });
    }
  };

  const branchFromMessage = async ({ messageId }: { messageId: string }) => {
    if (conversationId === undefined || temporary) return;
    try {
      const thread = await createThread({ conversationId, anchorMessageId: messageId });
      await refreshThreads({ id: conversationId });
      await openThread({ id: thread.id });
    } catch (cause) {
      dispatchSession({
        type: "error-reported",
        error: cause instanceof Error ? cause.message : "Unable to create this branch.",
      });
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
      dispatchSession({
        type: "error-reported",
        error: cause instanceof Error ? cause.message : "Unable to update this conversation.",
      });
    }
  };

  const compactConversationAction = async ({ id }: { id: string }) => {
    if (settings.apiKey.trim() === "") {
      dispatchSession({
        type: "error-reported",
        error: "Add an API key in settings before compacting a conversation.",
      });
      return;
    }
    try {
      const compacted = await compactConversation({
        conversationId: id,
        config: {
          provider: settings.provider,
          apiKey: settings.apiKey,
          ...(settings.baseUrl === "" ? {} : { baseUrl: settings.baseUrl }),
          model: settings.model,
        },
      });
      setConversations((current) => [compacted, ...current]);
      await openConversation({ id: compacted.id });
    } catch (cause) {
      dispatchSession({
        type: "error-reported",
        error: cause instanceof Error ? cause.message : "Unable to compact this conversation.",
      });
    }
  };

  const createMemoryAction = async () => {
    const content = memoryDraft.trim();
    if (content === "") return;
    try {
      await createMemory({ content });
      setMemoryDraft("");
      await refreshMemories({ search: memorySearch });
    } catch (cause) {
      dispatchSession({
        type: "error-reported",
        error: cause instanceof Error ? cause.message : "Unable to save this memory.",
      });
    }
  };

  const deleteMemoryAction = async ({ id }: { id: string }) => {
    try {
      await deleteMemory({ memoryId: id });
      setMemories((current) => current.filter((memory) => memory.id !== id));
    } catch (cause) {
      dispatchSession({
        type: "error-reported",
        error: cause instanceof Error ? cause.message : "Unable to delete this memory.",
      });
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

    const userMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text }, ...files],
    };
    const nextMessages = [...messages, userMessage];
    const controller = new AbortController();
    const operation = streamOperation.current + 1;
    streamOperation.current = operation;
    abortController.current = controller;
    dispatchSession({ type: "stream-started", messages: nextMessages });

    try {
      const transport = new DefaultChatTransport<UIMessage>({
        api: `${import.meta.env.VITE_API_ORIGIN ?? ""}/api/chat`,
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          const returnedConversationId = response.headers.get("x-conversation-id");
          if (returnedConversationId !== null) {
            dispatchSession({
              type: "conversation-identified",
              conversationId: returnedConversationId,
            });
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
          ...(threadId === undefined ? {} : { threadId }),
          temporary,
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
        },
      });
      await consumeStream({ operation, stream });
    } catch (cause) {
      if (controller.signal.aborted || operation !== streamOperation.current) return;
      dispatchSession({
        type: "error-reported",
        error: cause instanceof Error ? cause.message : "Unable to complete this chat request.",
      });
    } finally {
      if (abortController.current === controller) abortController.current = undefined;
      if (operation === streamOperation.current) dispatchSession({ type: "stream-finished" });
    }
  };

  const forceSendQueued = ({ id }: { id: string }) => {
    if (!queuedFollowUps.some((item) => item.id === id)) return;
    streamOperation.current += 1;
    abortController.current?.abort();
    abortController.current = undefined;
    dispatchSession({ type: "queued-follow-up-forced", id });
    setTimeout(() => composerForm.current?.requestSubmit());
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
                      .catch(() =>
                        dispatchSession({
                          type: "error-reported",
                          error: "Unable to clone this conversation.",
                        }),
                      );
                  }}
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
                    void deleteConversation({ conversationId: conversation.id })
                      .then(() => {
                        setConversations((current) =>
                          current.filter((item) => item.id !== conversation.id),
                        );
                        if (conversation.id === conversationId) startFresh();
                      })
                      .catch(() =>
                        dispatchSession({
                          type: "error-reported",
                          error: "Unable to delete this conversation.",
                        }),
                      );
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
                onClick={() => void openThread({ id: thread.id })}
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
                void refreshMemories({ search });
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
                <button onClick={() => void deleteMemoryAction({ id: memory.id })} type="button">
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
              onClick={() => abortController.current?.abort()}
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
                      onClick={() => void branchFromMessage({ messageId: message.id })}
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
        <form className="composer" onSubmit={submit} ref={composerForm}>
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
