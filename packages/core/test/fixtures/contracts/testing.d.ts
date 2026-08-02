import type { ChatRuntime, ChatRuntimeOptions } from "./runtime";
import type { ChatRepositories } from "./server";

export interface DeterministicDependencies {
  readonly now: () => string;
  readonly createId: () => string;
  readonly fetch: typeof globalThis.fetch;
}

export declare const createInMemoryRepositories: () => ChatRepositories;
export declare const createDeterministicDependencies: () => DeterministicDependencies;
export declare const createTestChatRuntime: (options: ChatRuntimeOptions) => ChatRuntime;
