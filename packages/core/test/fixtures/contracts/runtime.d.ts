import type { ModelConfiguration } from "./protocol";

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
  readonly extensions?: ReadonlyArray<unknown>;
  readonly features?: {
    readonly attachments?: boolean;
    readonly memories?: boolean;
    readonly branches?: boolean;
  };
}

export interface ThreadViewState {
  readonly id: string | undefined;
  readonly messages: ReadonlyArray<import("./protocol").ChatMessage>;
  readonly isStreaming: boolean;
}

export interface ComposerState {
  readonly text: string;
  readonly canSend: boolean;
}

export interface ChatState {
  readonly activeConversation: { readonly id: string; readonly title: string } | undefined;
  readonly activeThread: ThreadViewState;
  readonly composer: ComposerState;
  readonly connection: "online" | "offline" | "connecting";
}

export type Selector<Value> = (state: ChatState) => Value;

export interface ChatSelectors {
  readonly activeConversation: Selector<ChatState["activeConversation"]>;
  readonly activeThread: Selector<ThreadViewState>;
  readonly composer: Selector<ComposerState>;
  readonly connection: Selector<ChatState["connection"]>;
}

export interface ChatActions {
  sendMessage(input: {
    readonly text: string;
    readonly attachments?: ReadonlyArray<unknown>;
  }): void;
  stop(): void;
  retry(input: { readonly messageId: string }): void;
  selectConversation(input: { readonly conversationId: string }): void;
  selectThread(input: { readonly threadId: string }): void;
  updateConversation(input: { readonly title: string }): void;
  updateSettings(input: { readonly model?: ModelConfiguration }): void;
}

export interface ChatRuntime {
  readonly selectors: ChatSelectors;
  readonly actions: ChatActions;
  start(): void;
  stop(): void;
  dispose(): void;
  subscribe(listener: () => void): () => void;
}

export declare const createChatRuntime: (options: ChatRuntimeOptions) => ChatRuntime;
