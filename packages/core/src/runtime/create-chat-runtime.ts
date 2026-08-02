import { createActor, type ActorRefFrom } from "xstate";

import type { ChatMessage } from "../protocol/messages.ts";
import type { ModelConfiguration } from "../protocol/model.ts";
import { defaultGenericChatSettings } from "../chat/settings.ts";
import { genericChatAppMachine } from "../web/chat-runtime/generic-chat-app-machine.ts";
import {
  createConversationClient,
  type Conversation,
  type ConversationThread,
  type Memory,
} from "../web/chat-runtime/conversation-client.ts";
import type { ChatSession, ChatSessionEvent } from "../web/chat-session-machine.ts";
import type { GenericChatSettings } from "../chat/settings.ts";
import type { ChatUiActorEvent } from "../web/chat-runtime/chat-ui-actor.ts";
import type {
  ConversationStoreActorEvent,
  ConversationStoreContext,
} from "../web/chat-runtime/conversation-store-actor.ts";
import type {
  SettingsActorEvent,
  SettingsActorContext,
} from "../web/chat-runtime/settings-actor.ts";
import type { BrowserStateContext } from "../web/chat-runtime/browser-state-actor.ts";
import type { ChatUiContext } from "../web/chat-runtime/chat-ui-actor.ts";
import type { SuggestionsState } from "./types.ts";
import type { ChatTransportActorEvent } from "../web/chat-runtime/chat-transport-actor.ts";
import type {
  ChatActions,
  ChatRuntime,
  ChatRuntimeOptions,
  ChatSettingsState,
  ChatState,
  Selector,
} from "./types.ts";

type RuntimeActor = ActorRefFrom<typeof genericChatAppMachine>;
type RuntimeChildContexts = {
  session: ChatSession;
  transport: never;
  conversationStore: ConversationStoreContext;
  settings: SettingsActorContext;
  browserState: BrowserStateContext;
  chatUi: ChatUiContext;
  suggestions: SuggestionsState;
};
type ChildSnapshot<Context> = {
  readonly context: Context;
  readonly matches: (value: string) => boolean;
};
type ChildSubscriptionSource = {
  subscribe: (listener: () => void) => { unsubscribe: () => void };
};

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/$/, "");

const originFromBaseUrl = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return "";
  }
};

const chatApiFromBaseUrl = (baseUrl: string): string => {
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized.endsWith("/chat") ? normalized : `${normalized}/chat`;
};

const asSettings = (settings: GenericChatSettings): ChatSettingsState => ({ ...settings });

const settingsPatchFromModel = (model: ModelConfiguration): Partial<GenericChatSettings> => ({
  model: model.model,
  ...(model.provider === undefined ? {} : { provider: model.provider }),
});

const conversationToProtocol = (conversation: Conversation) => ({
  id: conversation.id,
  title: conversation.title,
  status: conversation.status,
  pinned: conversation.pinned,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
});

const threadToProtocol = (thread: ConversationThread) => ({
  id: thread.id,
  conversationId: thread.conversationId,
  anchorMessageId: thread.anchorMessageId,
  title: thread.title,
  status: thread.status,
  pinned: thread.pinned,
  createdAt: thread.createdAt,
  updatedAt: thread.updatedAt,
});

const memoryToProtocol = (memory: Memory) => ({
  id: memory.id,
  content: memory.content,
  source: memory.source,
  threadId: memory.threadId,
  createdAt: memory.createdAt,
  rank: memory.rank,
});

const createStorageAdapter = (storage: ChatRuntimeOptions["storage"]["settings"]) => ({
  getItem: (key: string) => storage.get(key),
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.remove(key),
});

const requestBody = (settings: GenericChatSettings): Record<string, unknown> => ({
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
  webSearch: settings.webSearch,
});

const buildDefaults = (model: ModelConfiguration | undefined): GenericChatSettings => ({
  ...defaultGenericChatSettings,
  ...(model === undefined ? {} : { model: model.model }),
});

const defaultSettingsStorageKey = "emi-core-chat-settings";

export const createChatRuntimeActor = (options: ChatRuntimeOptions): RuntimeActor => {
  const settingsStorage = createStorageAdapter(options.storage.settings);
  const draftsStorage = createStorageAdapter(options.storage.drafts);
  const settingsStorageKey = options.storage.keys?.settings ?? defaultSettingsStorageKey;
  const draftStorageKey = options.storage.keys?.drafts ?? `${settingsStorageKey}:draft`;
  const normalizedBaseUrl = normalizeBaseUrl(options.transport.baseUrl);
  const client = createConversationClient({
    apiOrigin: originFromBaseUrl(normalizedBaseUrl),
    fetch: options.transport.fetch,
  });
  return createActor(genericChatAppMachine, {
    input: {
      api: chatApiFromBaseUrl(normalizedBaseUrl),
      fetch: options.transport.fetch,
      createId: options.identity.createId,
      now: options.identity.now,
      client,
      storage: settingsStorage,
      storageKey: settingsStorageKey,
      defaults: buildDefaults(options.model),
      browser: {
        online: () => options.browser.online,
        subscribeOnline: options.browser.subscribeOnline,
        storage: draftsStorage,
      },
      draftStorageKey,
      features: {
        suggestions: options.features?.suggestions ?? false,
      },
    },
  });
};

export const createChatRuntime = (options: ChatRuntimeOptions): ChatRuntime => {
  const actor = createChatRuntimeActor(options);

  const listeners = new Set<() => void>();
  const childSubscriptions = new Map<string, { unsubscribe: () => void }>();
  let cachedActorSnapshot: ReturnType<RuntimeActor["getSnapshot"]> | undefined;
  let cachedState: ChatState | undefined;
  let started = false;
  let stopped = false;
  let disposed = false;

  const invalidate = () => {
    cachedActorSnapshot = undefined;
    cachedState = undefined;
    for (const listener of listeners) listener();
  };
  const actorSubscription = actor.subscribe(invalidate);

  const subscribeToChildren = () => {
    for (const [key, child] of Object.entries(actor.getSnapshot().children)) {
      if (childSubscriptions.has(key)) continue;
      const source = child as unknown as ChildSubscriptionSource;
      childSubscriptions.set(key, source.subscribe(invalidate));
    }
  };

  const unsubscribeFromChildren = () => {
    for (const subscription of childSubscriptions.values()) subscription.unsubscribe();
    childSubscriptions.clear();
  };

  const childSnapshot = <Key extends keyof RuntimeChildContexts>(
    key: Key,
  ): ChildSnapshot<RuntimeChildContexts[Key]> | undefined => {
    const child = actor.getSnapshot().children[key];
    if (child === undefined) return undefined;
    const snapshot = child.getSnapshot();
    if (!("context" in snapshot)) return undefined;
    return snapshot as unknown as ChildSnapshot<RuntimeChildContexts[Key]>;
  };

  const currentSession = (): ChatSession => {
    const snapshot = childSnapshot("session");
    return (
      snapshot?.context ?? {
        conversationId: undefined,
        threadId: undefined,
        messages: [],
        draft: "",
        files: [],
        temporary: false,
        error: undefined,
        queuedFollowUps: [],
      }
    );
  };

  const sendSession = (event: ChatSessionEvent) => {
    if (!disposed) actor.send({ type: "session-event", event });
  };

  const sendConversationStore = (event: ConversationStoreActorEvent) => {
    if (!disposed) actor.send({ type: "conversation-store-event", event });
  };

  const sendSettings = (event: SettingsActorEvent) => {
    if (!disposed) actor.send({ type: "settings-event", event });
  };

  const sendChatUi = (event: ChatUiActorEvent) => {
    if (!disposed) actor.send({ type: "chat-ui-event", event });
  };

  const sendTransport = (event: ChatTransportActorEvent) => {
    if (!disposed) actor.send({ type: "transport-event", event });
  };

  const currentSettings = (): GenericChatSettings => {
    const snapshot = childSnapshot("settings");
    return snapshot?.context.settings ?? defaultGenericChatSettings;
  };

  const currentStore = (): Pick<
    ConversationStoreContext,
    "conversations" | "threads" | "memories" | "loading" | "error"
  > => {
    const snapshot = childSnapshot("conversationStore");
    return (
      snapshot?.context ?? {
        conversations: [] as Conversation[],
        threads: [] as ConversationThread[],
        memories: [] as Memory[],
        loading: {
          conversations: false,
          conversation: false,
          threads: false,
          thread: false,
          memories: false,
          mutation: false,
        },
        error: undefined as string | undefined,
      }
    );
  };

  const currentBrowser = (): Pick<BrowserStateContext, "online" | "error"> => {
    const snapshot = childSnapshot("browserState");
    return snapshot?.context ?? { online: options.browser.online, error: undefined };
  };

  const currentUi = (): ChatUiContext => {
    const snapshot = childSnapshot("chatUi");
    return (
      snapshot?.context ?? {
        conversationSearch: "",
        memorySearch: "",
        memoryDraft: "",
        memoryPanelOpen: false,
        sidebarOpen: true,
      }
    );
  };

  const currentSuggestions = (): SuggestionsState => {
    const snapshot = childSnapshot("suggestions");
    return (
      snapshot?.context ?? {
        items: [],
        loading: false,
        error: undefined,
      }
    );
  };

  const stateFromActor = (): ChatState => {
    const session = currentSession();
    const store = currentStore();
    const settings = currentSettings();
    const browser = currentBrowser();
    const ui = currentUi();
    const suggestions = currentSuggestions();
    const activeConversation = store.conversations.find(
      (conversation) => conversation.id === session.conversationId,
    );
    const isStreaming = childSnapshot("session")?.matches("streaming") ?? false;
    const activeThreadMessages: ChatMessage[] = session.messages;
    return {
      activeConversation:
        activeConversation === undefined ? undefined : conversationToProtocol(activeConversation),
      activeThread: {
        id: session.threadId,
        conversationId: session.conversationId,
        messages: activeThreadMessages,
        isStreaming,
      },
      composer: {
        text: session.draft,
        attachments: session.files,
        canSend: browser.online && (session.draft.trim() !== "" || session.files.length > 0),
      },
      conversations: {
        items: store.conversations.map(conversationToProtocol),
        search: ui.conversationSearch,
        loading: store.loading.conversations,
        error: store.error,
      },
      memories: {
        items: store.memories.map(memoryToProtocol),
        search: ui.memorySearch,
        loading: store.loading.memories,
        error: store.error,
      },
      settings: asSettings(settings),
      connection: browser.online ? "online" : "offline",
      temporary: session.temporary,
      queuedFollowUps: session.queuedFollowUps.map((followUp) => ({
        id: followUp.id,
        text: followUp.text,
        attachments: followUp.files,
      })),
      error: session.error ?? store.error ?? currentBrowser().error ?? undefined,
      ui: { ...ui },
      threads: store.threads.map(threadToProtocol),
      suggestions,
    };
  };

  const getState = (): ChatState => {
    if (disposed && cachedState !== undefined) return cachedState;
    const snapshot = actor.getSnapshot();
    if (snapshot === cachedActorSnapshot && cachedState !== undefined) return cachedState;
    cachedActorSnapshot = snapshot;
    cachedState = stateFromActor();
    return cachedState;
  };

  const activeConversationId = (inputId: string | undefined): string | undefined =>
    inputId ?? currentSession().conversationId;

  const sendMessage: ChatActions["sendMessage"] = ({ text, attachments }) => {
    const session = currentSession();
    const settings = currentSettings();
    const browser = currentBrowser();
    if (!browser.online) {
      sendSession({
        type: "error-reported",
        error: "You are offline. Your draft is saved locally until you reconnect.",
      });
      return;
    }
    const files = attachments === undefined ? session.files : [...attachments];
    if (text.trim() === "" && files.length === 0) return;
    if (childSnapshot("session")?.matches("streaming")) {
      sendSession({
        type: "follow-up-queued",
        followUp: { id: options.identity.createId(), text, files },
      });
      return;
    }
    if (settings.apiKey.trim() === "") {
      sendSession({
        type: "error-reported",
        error: "Add an API key in settings before sending a message.",
      });
      return;
    }
    sendTransport({
      type: "stream-send-requested",
      request: {
        conversationId: session.conversationId,
        threadId: session.threadId,
        temporary: session.temporary,
        messages: session.messages,
        text,
        files,
        body: requestBody(settings),
      },
    });
  };

  const actions: ChatActions = {
    sendMessage,
    stop: () => sendTransport({ type: "stream-cancelled" }),
    retry: () => {
      const conversationId = currentSession().conversationId;
      if (conversationId !== undefined)
        sendTransport({ type: "stream-retry-requested", conversationId });
    },
    selectConversation: ({ conversationId }) =>
      sendConversationStore({ type: "conversation-load-requested", conversationId }),
    selectThread: ({ threadId }) => {
      const conversationId = currentSession().conversationId;
      if (conversationId !== undefined)
        sendConversationStore({ type: "thread-load-requested", conversationId, threadId });
    },
    updateConversation: ({ conversationId, title, status, pinned }) => {
      const id = activeConversationId(conversationId);
      if (id === undefined) return;
      sendConversationStore({
        type: "conversation-update-requested",
        conversationId: id,
        patch: {
          ...(title === undefined ? {} : { title }),
          ...(status === undefined ? {} : { status }),
          ...(pinned === undefined ? {} : { pinned }),
        },
      });
    },
    deleteConversation: ({ conversationId, resetSession }) =>
      sendConversationStore({
        type: "conversation-delete-requested",
        conversationId,
        resetSession,
      }),
    cloneConversation: ({ conversationId }) =>
      sendConversationStore({ type: "conversation-clone-requested", conversationId }),
    compactConversation: ({ conversationId }) => {
      const settings = currentSettings();
      if (settings.apiKey.trim() === "") {
        sendSession({
          type: "error-reported",
          error: "Add an API key in settings before compacting a conversation.",
        });
        return;
      }
      sendConversationStore({
        type: "conversation-compact-requested",
        conversationId,
        config: {
          provider: settings.provider,
          apiKey: settings.apiKey,
          ...(settings.baseUrl === "" ? {} : { baseUrl: settings.baseUrl }),
          model: settings.model,
        },
      });
    },
    updateSettings: ({ model, patch }) =>
      sendSettings({
        type: "settings-patch-requested",
        patch: Object.assign({}, patch, model === undefined ? {} : settingsPatchFromModel(model)),
      }),
    setWebSearch: ({ enabled }) =>
      sendSettings({
        type: "settings-patch-requested",
        patch: { webSearch: enabled },
      }),
    setDraft: ({ text }) => sendSession({ type: "draft-changed", draft: text }),
    addAttachments: ({ attachments }) =>
      sendSession({ type: "files-added", files: [...attachments] }),
    removeAttachment: ({ attachmentId }) => {
      const files = currentSession().files.filter(
        (file) => `attachment:${file.url}` !== attachmentId,
      );
      sendSession({ type: "files-changed", files });
    },
    startNewConversation: () => {
      sendTransport({ type: "stream-cancelled" });
      sendSession({ type: "fresh-started" });
      sendConversationStore({ type: "threads-cleared" });
    },
    createBranch: ({ messageId }) => {
      const session = currentSession();
      if (session.conversationId === undefined || session.temporary) return;
      sendConversationStore({
        type: "thread-create-requested",
        conversationId: session.conversationId,
        anchorMessageId: messageId,
      });
    },
    setTemporary: ({ temporary }) => sendSession({ type: "temporary-changed", temporary }),
    forceSendQueuedFollowUp: ({ id }) => {
      const session = currentSession();
      const followUp = session.queuedFollowUps.find((item) => item.id === id);
      if (followUp === undefined) return;
      sendTransport({
        type: "queued-follow-up-force-requested",
        followUp,
        request: {
          conversationId: session.conversationId,
          threadId: session.threadId,
          temporary: session.temporary,
          messages: session.messages,
          body: requestBody(currentSettings()),
        },
      });
    },
    removeQueuedFollowUp: ({ id }) => sendSession({ type: "queued-follow-up-removed", id }),
    setConversationSearch: ({ search }) => {
      sendChatUi({ type: "conversation-search-changed", search });
      sendConversationStore({ type: "conversations-load-requested", search });
    },
    setMemorySearch: ({ search }) => {
      sendChatUi({ type: "memory-search-changed", search });
      sendConversationStore({ type: "memory-load-requested", search });
    },
    setMemoryDraft: ({ draft }) => sendChatUi({ type: "memory-draft-changed", draft }),
    setMemoryPanelOpen: ({ open }) => sendChatUi({ type: "memory-panel-changed", open }),
    setSidebarOpen: ({ open }) => sendChatUi({ type: "sidebar-open-changed", open }),
    createMemory: () => {
      const ui = currentUi();
      const content = ui.memoryDraft.trim();
      if (content === "") return;
      sendConversationStore({ type: "memory-create-requested", content, search: ui.memorySearch });
      sendChatUi({ type: "memory-draft-cleared" });
    },
    deleteMemory: ({ memoryId }) =>
      sendConversationStore({ type: "memory-delete-requested", memoryId }),
    reportError: ({ error }) => sendSession({ type: "error-reported", error }),
  };

  const selectors = {
    activeConversation: ((state) => state.activeConversation) as Selector<
      ChatState["activeConversation"]
    >,
    activeThread: ((state) => state.activeThread) as Selector<ChatState["activeThread"]>,
    composer: ((state) => state.composer) as Selector<ChatState["composer"]>,
    conversations: ((state) => state.conversations) as Selector<ChatState["conversations"]>,
    memories: ((state) => state.memories) as Selector<ChatState["memories"]>,
    settings: ((state) => state.settings) as Selector<ChatState["settings"]>,
    connection: ((state) => state.connection) as Selector<ChatState["connection"]>,
    suggestions: ((state) => state.suggestions) as Selector<ChatState["suggestions"]>,
  };

  const start = () => {
    if (disposed || started || stopped) return;
    started = true;
    actor.start();
    subscribeToChildren();
  };

  const stop = () => {
    if (disposed || !started || stopped) return;
    stopped = true;
    unsubscribeFromChildren();
    actor.stop();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (started && !stopped) {
      stopped = true;
      unsubscribeFromChildren();
      actor.stop();
    }
    actorSubscription.unsubscribe();
    listeners.clear();
  };

  const subscribe = (listener: () => void) => {
    if (disposed) return () => undefined;
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { selectors, actions, getState, start, stop, dispose, subscribe };
};
