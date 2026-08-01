import { convertFileListToFileUIParts } from "ai";
import { useActorRef, useSelector } from "@xstate/react";
import {
  genericChatAppMachine,
  createAnonymousSessionFetch,
  createConversationClient,
  type ChatSessionEvent,
  type ChatTransportActorEvent,
  type ConversationStoreActorEvent,
  type SettingsActorEvent,
  type ChatUiActorEvent,
  type QueuedFollowUp,
} from "@emi/core/web";
import {
  Button,
  ChatComposer,
  ChatHeader,
  ChatSidebar,
  ConversationList,
  FollowUpQueue,
  MemoryPanel,
  MessageViewport,
  SettingsPanel,
} from "@emi/core/web/styled";
import { useCallback, useMemo, useRef } from "react";

import "./app.css";
import { genericChatAppConfig } from "./app-config.ts";

export const App = () => {
  const apiOrigin = (import.meta.env.VITE_API_ORIGIN ?? "").replace(/\/$/, "");
  const fetcher = useMemo(
    () =>
      createAnonymousSessionFetch({
        apiOrigin,
        fetch: window.fetch.bind(window),
      }),
    [apiOrigin],
  );
  const conversationClient = useMemo(
    () => createConversationClient({ apiOrigin, fetch: fetcher }),
    [apiOrigin, fetcher],
  );
  const messageContainer = useRef<HTMLDivElement | null>(null);
  const messageElements = useRef(new Map<string, HTMLElement>());
  const settingsStorage = useMemo(() => window.localStorage, []);
  const browserAdapter = useMemo(
    () => ({
      online: () => navigator.onLine,
      subscribeOnline: (listener: (online: boolean) => void) => {
        const update = () => listener(navigator.onLine);
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
          window.removeEventListener("online", update);
          window.removeEventListener("offline", update);
        };
      },
      storage: window.localStorage,
    }),
    [],
  );
  const chatAppActor = useActorRef(genericChatAppMachine, {
    input: {
      api: `${apiOrigin}/api/chat`,
      fetch: fetcher,
      createId: () => crypto.randomUUID(),
      client: conversationClient,
      storage: settingsStorage,
      storageKey: genericChatAppConfig.settingsStorageKey,
      browser: browserAdapter,
      draftStorageKey: `${genericChatAppConfig.settingsStorageKey}:draft`,
    },
  });
  const sessionActor = chatAppActor.getSnapshot().children.session;
  if (sessionActor === undefined) throw new Error("Chat session actor is unavailable.");
  const conversationStoreActor = chatAppActor.getSnapshot().children.conversationStore;
  if (conversationStoreActor === undefined)
    throw new Error("Conversation store actor is unavailable.");
  const settingsActor = chatAppActor.getSnapshot().children.settings;
  if (settingsActor === undefined) throw new Error("Settings actor is unavailable.");
  const browserStateActor = chatAppActor.getSnapshot().children.browserState;
  if (browserStateActor === undefined) throw new Error("Browser state actor is unavailable.");
  const chatUiActor = chatAppActor.getSnapshot().children.chatUi;
  if (chatUiActor === undefined) throw new Error("Chat UI actor is unavailable.");
  const sessionState = useSelector(sessionActor, (snapshot) => snapshot);
  const conversationStoreState = useSelector(conversationStoreActor, (snapshot) => snapshot);
  const settingsState = useSelector(settingsActor, (snapshot) => snapshot);
  const browserState = useSelector(browserStateActor, (snapshot) => snapshot);
  const chatUiState = useSelector(chatUiActor, (snapshot) => snapshot);
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
  const dispatchSettings = useCallback(
    (event: SettingsActorEvent) => chatAppActor.send({ type: "settings-event", event }),
    [chatAppActor],
  );
  const dispatchChatUi = useCallback(
    (event: ChatUiActorEvent) => chatAppActor.send({ type: "chat-ui-event", event }),
    [chatAppActor],
  );
  const { conversationId, draft, error, files, messages, queuedFollowUps, temporary, threadId } =
    sessionState.context;
  const { conversations, memories, threads } = conversationStoreState.context;
  const { settings } = settingsState.context;
  const { online } = browserState.context;
  const { conversationSearch, memoryDraft, memoryPanelOpen, memorySearch, sidebarOpen } =
    chatUiState.context;
  const streaming = sessionState.matches("streaming");

  const updateSettings = (patch: Partial<typeof settings>) =>
    dispatchSettings({ type: "settings-patch-requested", patch });

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

  const scrollToMessage = (id: string) => {
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
    if (previous !== undefined) scrollToMessage(previous.id);
  };

  const startFresh = () => {
    dispatchTransport({ type: "stream-cancelled" });
    dispatchSession({ type: "fresh-started" });
    dispatchConversationStore({ type: "threads-cleared" });
  };

  const openConversation = (id: string) =>
    dispatchConversationStore({ type: "conversation-load-requested", conversationId: id });

  const openThread = (id: string) => {
    if (conversationId === undefined) return;
    dispatchConversationStore({
      type: "thread-load-requested",
      conversationId,
      threadId: id,
    });
  };

  const branchFromMessage = (messageId: string) => {
    if (conversationId === undefined || temporary) return;
    dispatchConversationStore({
      type: "thread-create-requested",
      conversationId,
      anchorMessageId: messageId,
    });
  };

  const updateConversation = ({
    conversationId: id,
    patch,
  }: {
    conversationId: string;
    patch: { title?: string; status?: "regular" | "archived"; pinned?: boolean };
  }) =>
    dispatchConversationStore({ type: "conversation-update-requested", conversationId: id, patch });

  const renameConversation = ({
    conversationId: id,
    currentTitle,
  }: {
    conversationId: string;
    currentTitle: string | null;
  }) => {
    const title = window.prompt("Conversation name", currentTitle ?? "");
    if (title === null || title.trim() === "") return;
    updateConversation({ conversationId: id, patch: { title: title.trim() } });
  };

  const deleteConversation = ({
    conversationId: id,
    resetSession,
  }: {
    conversationId: string;
    resetSession: boolean;
  }) => {
    if (!window.confirm("Delete this conversation permanently?")) return;
    dispatchConversationStore({
      type: "conversation-delete-requested",
      conversationId: id,
      resetSession,
    });
  };

  const compactConversation = (id: string) => {
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

  const createMemory = () => {
    const content = memoryDraft.trim();
    if (content === "") return;
    dispatchConversationStore({ type: "memory-create-requested", content, search: memorySearch });
    dispatchChatUi({ type: "memory-draft-cleared" });
  };

  const submit = () => {
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

  const forceSendQueued = (followUp: QueuedFollowUp) =>
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

  const addFiles = (fileList: FileList | undefined) => {
    void convertFileListToFileUIParts(fileList)
      .then((nextFiles) => dispatchSession({ type: "files-added", files: nextFiles }))
      .catch(() =>
        dispatchSession({
          type: "error-reported",
          error: "Unable to prepare one or more attachments.",
        }),
      );
  };

  return (
    <main
      className={`flex h-dvh min-h-0 overflow-hidden bg-background text-foreground ${settings.theme === "dark" ? "dark" : ""}`}
      data-sidebar-open={sidebarOpen}
      data-theme={settings.theme}
    >
      <ChatSidebar
        description="Conversation history, memories, and provider settings."
        onOpenChange={(open) => dispatchChatUi({ type: "sidebar-open-changed", open })}
        open={sidebarOpen}
        title={genericChatAppConfig.name}
      >
        <div className="space-y-1 px-2 pt-1">
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            EMI CORE
          </p>
          <h1 className="text-xl font-semibold tracking-tight">{genericChatAppConfig.name}</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Generic streaming chat starter. Your provider key stays in this browser.
          </p>
        </div>
        <Button className="w-full" onClick={startFresh} variant="outline">
          New chat
        </Button>
        <ConversationList
          conversationId={conversationId}
          conversations={conversations}
          onCloneConversation={(id) =>
            dispatchConversationStore({
              type: "conversation-clone-requested",
              conversationId: id,
            })
          }
          onCompactConversation={compactConversation}
          onDeleteConversation={deleteConversation}
          onOpenConversation={openConversation}
          onOpenThread={openThread}
          onRenameConversation={renameConversation}
          onSearchChange={(search) => {
            dispatchChatUi({ type: "conversation-search-changed", search });
            dispatchConversationStore({ type: "conversations-load-requested", search });
          }}
          onUpdateConversation={updateConversation}
          search={conversationSearch}
          threadId={threadId}
          threads={threads}
        />
        <MemoryPanel
          draft={memoryDraft}
          memories={memories}
          onCreate={createMemory}
          onDelete={(id) =>
            dispatchConversationStore({ type: "memory-delete-requested", memoryId: id })
          }
          onDraftChange={(draftValue) =>
            dispatchChatUi({ type: "memory-draft-changed", draft: draftValue })
          }
          onOpenChange={(open) => dispatchChatUi({ type: "memory-panel-changed", open })}
          onSearchChange={(search) => {
            dispatchChatUi({ type: "memory-search-changed", search });
            dispatchConversationStore({ type: "memory-load-requested", search });
          }}
          open={memoryPanelOpen}
          search={memorySearch}
        />
        <SettingsPanel
          metadata={
            temporary
              ? "Not saved"
              : conversationId === undefined
                ? "New conversation"
                : conversationId
          }
          onSettingsChange={updateSettings}
          onTemporaryChange={(value) => {
            dispatchSession({ type: "temporary-changed", temporary: value });
            startFresh();
          }}
          online={online}
          releaseNotes={genericChatAppConfig.releaseNotes}
          settings={settings}
          temporary={temporary}
          version={genericChatAppConfig.version}
        />
      </ChatSidebar>
      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <ChatHeader
          appName={genericChatAppConfig.name}
          messageCount={messages.length}
          onScroll={(target) => scrollMessages({ target })}
          onStop={() => dispatchTransport({ type: "stream-cancelled" })}
          onToggleSidebar={() =>
            dispatchChatUi({ type: "sidebar-open-changed", open: !sidebarOpen })
          }
          sidebarOpen={sidebarOpen}
          streaming={streaming}
          temporary={temporary}
          threadId={threadId}
        />
        <MessageViewport
          conversationId={conversationId}
          messageContainer={messageContainer}
          messageElements={messageElements.current}
          messages={messages}
          onBranchMessage={branchFromMessage}
          onSelectMinimapMessage={scrollToMessage}
          streaming={streaming}
          temporary={temporary}
        />
        {error !== undefined && (
          <p className="mx-auto mb-3 w-full max-w-3xl rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <FollowUpQueue
          followUps={queuedFollowUps}
          onForceSend={forceSendQueued}
          onRemove={(id) => dispatchSession({ type: "queued-follow-up-removed", id })}
        />
        <ChatComposer
          draft={draft}
          files={files}
          onDraftChange={(draftValue) =>
            dispatchSession({ type: "draft-changed", draft: draftValue })
          }
          onFilesSelected={addFiles}
          onRemoveFile={(file) =>
            dispatchSession({
              type: "files-changed",
              files: files.filter((item) => item.url !== file.url),
            })
          }
          onSubmit={submit}
          placeholder={`Message ${genericChatAppConfig.name}`}
          streaming={streaming}
        />
      </section>
    </main>
  );
};
