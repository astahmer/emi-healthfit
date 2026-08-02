import type { ChatRuntime, ChatRuntimeOptions } from "./runtime";
import type { ChatRepositories } from "./server";

export interface DeterministicDependencies {
  readonly now: () => string;
  readonly createId: () => string;
  readonly fetch: typeof globalThis.fetch;
}

export declare class ChatTesting {
  static inMemoryRepositories(): ChatRepositories;
  static deterministicDependencies(): DeterministicDependencies;
  static createRuntime(options: ChatRuntimeOptions): ChatRuntime;
}
