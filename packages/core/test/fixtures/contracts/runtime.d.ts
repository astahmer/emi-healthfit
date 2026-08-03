import type {
  Attachment,
  ChatMessage,
  Conversation,
  Memory,
  ModelConfiguration,
  Thread,
} from "./protocol";
import type { ChatExtension } from "./extensions";

export interface KeyValueStorage {
  get(key: string): string | null | Promise<string | null>;
  set(key: string, value: string): void | Promise<void>;
  remove(key: string): void | Promise<void>;
}

export interface ChatRuntimeOptions {
  readonly transport: {
    readonly baseUrl: string;
    readonly fetch: typeof globalThis.fetch;
  };
  readonly storage: {
    readonly settings: KeyValueStorage;
    readonly drafts: KeyValueStorage;
    readonly keys?: {
      readonly settings?: string;
      readonly drafts?: string;
    };
  };
  readonly browser: {
    readonly online: boolean;
    readonly subscribeOnline: (listener: (online: boolean) => void) => () => void;
  };
  readonly identity: {
    readonly createId: () => string;
    readonly now: () => string;
  };
  readonly model?: ModelConfiguration;
  readonly extensions?: ReadonlyArray<ChatExtension>;
  readonly features?: {
    readonly attachments?: boolean;
    readonly memories?: boolean;
    readonly branches?: boolean;
  };
}

export interface ThreadViewState {
  readonly id: string | undefined;
  readonly conversationId: string | undefined;
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly isStreaming: boolean;
}

export interface ComposerState {
  readonly text: string;
  readonly attachments: ReadonlyArray<Attachment>;
  readonly canSend: boolean;
}

export interface ConversationListState {
  readonly items: ReadonlyArray<Conversation>;
  readonly search: string;
  readonly loading: boolean;
  readonly error: string | undefined;
}

export interface MemoryListState {
  readonly items: ReadonlyArray<Memory>;
  readonly summary: MemorySummary | undefined;
  readonly search: string;
  readonly loading: boolean;
  readonly error: string | undefined;
}

export interface MemorySummary {
  readonly content: string;
  readonly memoryCount: number;
  readonly updatedAt: string;
}

export interface ChatSettingsState {
  readonly provider: "openai";
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly titleModel: string;
  readonly titlePrompt: string;
  readonly memoryEnabled: boolean;
  readonly memoryModel: string;
  readonly theme: "light" | "dark";
}

export interface QueuedFollowUpState {
  readonly id: string;
  readonly text: string;
  readonly attachments: ReadonlyArray<Attachment>;
}

export interface ChatState {
  readonly activeConversation: Conversation | undefined;
  readonly activeThread: ThreadViewState;
  readonly composer: ComposerState;
  readonly conversations: ConversationListState;
  readonly memories: MemoryListState;
  readonly settings: ChatSettingsState;
  readonly connection: "online" | "offline" | "connecting";
  readonly temporary: boolean;
  readonly queuedFollowUps: ReadonlyArray<QueuedFollowUpState>;
  readonly error: string | undefined;
  readonly ui: {
    readonly conversationSearch: string;
    readonly memorySearch: string;
    readonly memoryDraft: string;
    readonly memorySummaryDraft: string | undefined;
    readonly memoryPanelOpen: boolean;
    readonly sidebarOpen: boolean;
  };
}

export type Selector<Value> = (state: ChatState) => Value;

export interface ChatSelectors {
  readonly activeConversation: Selector<ChatState["activeConversation"]>;
  readonly activeThread: Selector<ThreadViewState>;
  readonly composer: Selector<ComposerState>;
  readonly conversations: Selector<ConversationListState>;
  readonly memories: Selector<MemoryListState>;
  readonly settings: Selector<ChatSettingsState>;
  readonly connection: Selector<ChatState["connection"]>;
}

export interface ChatActions {
  sendMessage(input: {
    readonly text: string;
    readonly attachments?: ReadonlyArray<Attachment>;
  }): void;
  stop(): void;
  retry(input: { readonly messageId: string }): void;
  selectConversation(input: { readonly conversationId: string }): void;
  selectThread(input: { readonly threadId: string }): void;
  updateConversation(input: {
    readonly conversationId?: string;
    readonly title?: string;
    readonly status?: "regular" | "archived";
    readonly pinned?: boolean;
  }): void;
  deleteConversation(input: {
    readonly conversationId: string;
    readonly resetSession: boolean;
  }): void;
  cloneConversation(input: { readonly conversationId: string }): void;
  compactConversation(input: { readonly conversationId: string }): void;
  updateSettings(input: { readonly model?: ModelConfiguration }): void;
  setDraft(input: { readonly text: string }): void;
  addAttachments(input: { readonly attachments: ReadonlyArray<Attachment> }): void;
  removeAttachment(input: { readonly attachmentId: string }): void;
  startNewConversation(): void;
  createBranch(input: { readonly messageId: string }): void;
  setTemporary(input: { readonly temporary: boolean }): void;
  forceSendQueuedFollowUp(input: { readonly id: string }): void;
  removeQueuedFollowUp(input: { readonly id: string }): void;
  setConversationSearch(input: { readonly search: string }): void;
  setMemorySearch(input: { readonly search: string }): void;
  setMemoryDraft(input: { readonly draft: string }): void;
  setMemorySummaryDraft(input: { readonly draft: string }): void;
  setMemoryPanelOpen(input: { readonly open: boolean }): void;
  setSidebarOpen(input: { readonly open: boolean }): void;
  createMemory(): void;
  saveMemorySummary(): void;
  deleteMemory(input: { readonly memoryId: string }): void;
  reportError(input: { readonly error: string }): void;
}

export interface ChatRuntime {
  readonly selectors: ChatSelectors;
  readonly actions: ChatActions;
  readonly getState: () => ChatState;
  start(): void;
  stop(): void;
  dispose(): void;
  subscribe(listener: () => void): () => void;
}

export declare const createChatRuntime: (options: ChatRuntimeOptions) => ChatRuntime;
