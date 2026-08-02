import { Effect } from "effect";

import { createChatRuntime } from "./runtime/create-chat-runtime.ts";
import type { ChatRuntime, ChatRuntimeOptions } from "./runtime/types.ts";
import { ChatServerError } from "./server/use-cases/chat-server.ts";
import type { ChatRepositoriesShape } from "./server/ports/chat-server.ts";
import type { ChatMessage } from "./protocol/messages.ts";
import type { GenerationEvent } from "./protocol/model.ts";
import type { Conversation, Memory } from "./protocol/resources.ts";

type SubjectState = {
  readonly conversations: Map<string, Conversation[]>;
  readonly messages: Map<string, ChatMessage[]>;
  readonly memories: Map<string, Memory[]>;
  readonly generations: Map<string, GenerationEvent[]>;
};

const createSubjectState = (): SubjectState => ({
  conversations: new Map(),
  messages: new Map(),
  memories: new Map(),
  generations: new Map(),
});

const subjectKey = (subject: string, conversationId: string): string =>
  `${subject}:${conversationId}`;

const serverError = (kind: "conflict" | "internal", message: string): ChatServerError =>
  new ChatServerError({ kind, message });

const inMemoryRepositories = (): ChatRepositoriesShape => {
  const state = createSubjectState();
  const admissions = new Set<string>();

  return {
    conversations: {
      list: ({ subject }) => Effect.succeed([...(state.conversations.get(subject) ?? [])]),
    },
    messages: {
      append: ({ subject, conversationId, message }) => {
        const key = subjectKey(subject, conversationId);
        const messages = state.messages.get(key) ?? [];
        messages.push(message);
        state.messages.set(key, messages);
        return Effect.succeed(undefined);
      },
    },
    generations: {
      admit: ({ subject, requestId, conversationId }) => {
        const key = `${subject}:${requestId}:${conversationId}`;
        if (admissions.has(key)) {
          return Effect.fail(serverError("conflict", `Generation ${requestId} already exists.`));
        }
        admissions.add(key);
        state.generations.set(key, []);
        return Effect.succeed(undefined);
      },
      append: ({ subject, requestId, event }) => {
        const keyPrefix = `${subject}:${requestId}:`;
        const key = [...state.generations.keys()].find((candidate) =>
          candidate.startsWith(keyPrefix),
        );
        if (key === undefined) {
          return Effect.fail(serverError("internal", `Generation ${requestId} was not admitted.`));
        }
        state.generations.get(key)?.push(event);
        return Effect.succeed(undefined);
      },
    },
    memories: {
      list: ({ subject }) =>
        Effect.succeed((state.memories.get(subject) ?? []).map((memory) => ({ id: memory.id }))),
    },
  };
};

const deterministicDependencies = () => {
  let nextId = 0;
  const now = () => "2026-01-01T00:00:00.000Z";
  return {
    now,
    createId: () => {
      nextId += 1;
      return `test-id-${nextId}`;
    },
    fetch: globalThis.fetch,
  };
};

export class ChatTesting {
  private constructor() {}

  static inMemoryRepositories(): ChatRepositoriesShape {
    return inMemoryRepositories();
  }

  static deterministicDependencies(): {
    readonly now: () => string;
    readonly createId: () => string;
    readonly fetch: typeof globalThis.fetch;
  } {
    return deterministicDependencies();
  }

  static createRuntime(options: ChatRuntimeOptions): ChatRuntime {
    return createChatRuntime(options);
  }
}
