import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { assign, fromCallback, setup } from "xstate";

import type {
  ChatActions,
  ChatRuntime,
  ChatRuntimeOptions,
  ChatState,
} from "../../runtime/types.ts";
import type {
  WebMcpInputSchema,
  WebMcpJsonValue,
  WebMcpModelContext,
  WebMcpTool,
} from "../webmcp.ts";

type WebMcpActions = Pick<
  ChatActions,
  | "setConversationSearch"
  | "selectConversation"
  | "startNewConversation"
  | "updateSettings"
  | "setMemoryPanelOpen"
  | "setMemorySearch"
  | "setDraft"
>;

interface WebMcpRuntime {
  readonly getState: ChatRuntime["getState"];
  readonly subscribe: ChatRuntime["subscribe"];
  readonly actions: WebMcpActions;
}

interface WebMcpActorInput {
  readonly modelContext: WebMcpModelContext | undefined;
  readonly runtime: WebMcpRuntime;
  readonly features: ChatRuntimeOptions["features"];
}

interface WebMcpActorContext extends WebMcpActorInput {
  readonly status: "registering" | "ready" | "unsupported" | "failed";
  readonly error: string | undefined;
}

type WebMcpActorEvent =
  | { type: "registration-completed" }
  | { type: "registration-unsupported" }
  | { type: "registration-failed"; error: string };

type WebMcpToolResult =
  | { readonly ok: true; readonly result: WebMcpJsonValue }
  | {
      readonly ok: false;
      readonly error: { readonly code: string; readonly message: string };
    };

class WebMcpToolError extends Schema.TaggedErrorClass<WebMcpToolError>()("WebMcpToolError", {
  code: Schema.Literals(["invalid-input", "unavailable", "not-found", "failed", "timeout"]),
  message: Schema.String,
}) {}

class WebMcpRegistrationError extends Schema.TaggedErrorClass<WebMcpRegistrationError>()(
  "WebMcpRegistrationError",
  { message: Schema.String },
) {}

const emptyInput = Schema.Struct({});
const searchInput = Schema.Struct({
  query: Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/)),
});
const openConversationInput = Schema.Struct({
  conversationId: Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/\S/)),
});
const themeInput = Schema.Struct({ theme: Schema.Literals(["light", "dark"]) });

const emptyInputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} satisfies WebMcpInputSchema;

const searchInputSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Words or a short phrase to find in the current user's saved conversations.",
    },
  },
  required: ["query"],
  additionalProperties: false,
} satisfies WebMcpInputSchema;

const openConversationInputSchema = {
  type: "object",
  properties: {
    conversationId: {
      type: "string",
      description: "The conversation identifier returned by search_conversations.",
    },
  },
  required: ["conversationId"],
  additionalProperties: false,
} satisfies WebMcpInputSchema;

const themeInputSchema = {
  type: "object",
  properties: {
    theme: {
      type: "string",
      enum: ["light", "dark"],
      description: "The visible chat theme.",
    },
  },
  required: ["theme"],
  additionalProperties: false,
} satisfies WebMcpInputSchema;

const draftInputSchema = {
  type: "object",
  properties: {
    text: {
      type: "string",
      description: "Text to place in the visible composer. It is not sent.",
    },
  },
  required: ["text"],
  additionalProperties: false,
} satisfies WebMcpInputSchema;

const toolError = ({
  code,
  message,
}: {
  readonly code: "invalid-input" | "unavailable" | "not-found" | "failed" | "timeout";
  readonly message: string;
}) => new WebMcpToolError({ code, message });

const runAction = (action: () => void): Effect.Effect<void, WebMcpToolError> =>
  Effect.try({
    try: action,
    catch: () => toolError({ code: "failed", message: "The requested page action failed." }),
  });

const waitForState = ({
  runtime,
  predicate,
  timeoutMessage,
}: {
  readonly runtime: WebMcpRuntime;
  readonly predicate: (state: ChatState) => boolean;
  readonly timeoutMessage: string;
}): Effect.Effect<ChatState, WebMcpToolError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<ChatState>((resolve, reject) => {
        let settled = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let unsubscribe: () => void = () => undefined;

        const settle = (result: {
          readonly state?: ChatState;
          readonly error?: WebMcpToolError;
        }) => {
          if (settled) return;
          settled = true;
          if (timeout !== undefined) clearTimeout(timeout);
          unsubscribe();
          if (result.error !== undefined) reject(result.error);
          else if (result.state !== undefined) resolve(result.state);
        };

        const check = () => {
          try {
            const state = runtime.getState();
            if (predicate(state)) settle({ state });
          } catch {
            settle({
              error: toolError({
                code: "unavailable",
                message: "The chat state is unavailable.",
              }),
            });
          }
        };

        unsubscribe = runtime.subscribe(check);
        timeout = setTimeout(
          () => settle({ error: toolError({ code: "timeout", message: timeoutMessage }) }),
          5000,
        );
        check();
      }),
    catch: (cause) =>
      cause instanceof WebMcpToolError
        ? cause
        : toolError({ code: "timeout", message: timeoutMessage }),
  });

const executeTool = <Input, Result extends WebMcpJsonValue>({
  schema,
  input,
  handler,
}: {
  readonly schema: Schema.ConstraintDecoder<Input, never>;
  readonly input: unknown;
  readonly handler: (input: Input) => Effect.Effect<Result, WebMcpToolError>;
}): Promise<WebMcpToolResult> =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError(() =>
        toolError({ code: "invalid-input", message: "Tool input did not match its schema." }),
      ),
    );
    const result = yield* Effect.try({
      try: () => handler(decoded),
      catch: () => toolError({ code: "failed", message: "The requested tool failed." }),
    }).pipe(Effect.flatMap((effect) => effect));
    return { ok: true, result } satisfies WebMcpToolResult;
  }).pipe(
    Effect.catchTag("WebMcpToolError", (error) =>
      Effect.succeed({
        ok: false,
        error: { code: error.code, message: error.message },
      } satisfies WebMcpToolResult),
    ),
    Effect.runPromise,
  );

const mapConversation = (conversation: ChatState["conversations"]["items"][number]) => ({
  id: conversation.id,
  title: conversation.title,
  status: conversation.status,
  pinned: conversation.pinned,
});

const mapMemory = (memory: ChatState["memories"]["items"][number]) => ({
  id: memory.id,
  content: memory.content,
  source: memory.source,
  createdAt: memory.createdAt,
});

const mapSummary = (summary: ChatState["memories"]["summary"]) =>
  summary === undefined
    ? null
    : {
        content: summary.content,
        memoryCount: summary.memoryCount,
        updatedAt: summary.updatedAt,
      };

const contextResult = ({
  state,
  features,
}: {
  readonly state: ChatState;
  readonly features: ChatRuntimeOptions["features"];
}) => ({
  activeConversation:
    state.activeConversation === undefined
      ? null
      : {
          id: state.activeConversation.id,
          title: state.activeConversation.title,
          status: state.activeConversation.status,
        },
  activeThread: {
    id: state.activeThread.id ?? null,
    conversationId: state.activeThread.conversationId ?? null,
    isStreaming: state.activeThread.isStreaming,
  },
  connection: state.connection,
  temporary: state.temporary,
  capabilities: {
    searchConversations: true,
    openConversation: true,
    startNewChat: true,
    setTheme: true,
    searchMemories: features?.memories !== false,
    fillMessageComposer: true,
  },
});

const createTools = ({
  runtime,
  features,
}: {
  readonly runtime: WebMcpRuntime;
  readonly features: ChatRuntimeOptions["features"];
}): ReadonlyArray<WebMcpTool> => {
  const tools: WebMcpTool[] = [
    {
      name: "get_chat_context",
      description:
        "Read safe context for the visible chat page without exposing credentials or message content.",
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      execute: (input) =>
        executeTool({
          schema: emptyInput,
          input,
          handler: () =>
            Effect.try({
              try: () => contextResult({ state: runtime.getState(), features }),
              catch: () =>
                toolError({ code: "unavailable", message: "Chat context is unavailable." }),
            }),
        }),
    },
    {
      name: "search_conversations",
      description:
        "Search the current user's saved conversations and return matching identifiers and titles.",
      inputSchema: searchInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      execute: (input) =>
        executeTool({
          schema: searchInput,
          input,
          handler: ({ query }) => {
            const search = query.trim();
            return Effect.gen(function* () {
              yield* runAction(() => runtime.actions.setConversationSearch({ search }));
              const state = yield* waitForState({
                runtime,
                predicate: (current) =>
                  current.conversations.search === search &&
                  (!current.conversations.loading || current.error !== undefined),
                timeoutMessage: "Conversation search did not finish.",
              });
              if (state.error !== undefined)
                return yield* Effect.fail(
                  toolError({
                    code: "unavailable",
                    message: "Conversation search is unavailable.",
                  }),
                );
              return {
                query: search,
                conversations: state.conversations.items.map(mapConversation),
              };
            });
          },
        }),
    },
    {
      name: "open_conversation",
      description:
        "Open one of the current user's conversations by an identifier returned from search_conversations.",
      inputSchema: openConversationInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
      execute: (input) =>
        executeTool({
          schema: openConversationInput,
          input,
          handler: ({ conversationId }) => {
            const id = conversationId.trim();
            return Effect.gen(function* () {
              yield* runAction(() => runtime.actions.selectConversation({ conversationId: id }));
              const state = yield* waitForState({
                runtime,
                predicate: (current) =>
                  current.activeThread.conversationId === id || current.error !== undefined,
                timeoutMessage: "Conversation opening did not finish.",
              });
              if (state.activeThread.conversationId !== id)
                return yield* Effect.fail(
                  toolError({ code: "not-found", message: "Conversation was not found." }),
                );
              return {
                conversationId: id,
                conversation:
                  state.activeConversation === undefined
                    ? null
                    : mapConversation(state.activeConversation),
              };
            });
          },
        }),
    },
    {
      name: "start_new_chat",
      description: "Start a visible empty chat without sending a provider request.",
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
      execute: (input) =>
        executeTool({
          schema: emptyInput,
          input,
          handler: () =>
            Effect.gen(function* () {
              yield* runAction(() => runtime.actions.startNewConversation());
              const state = yield* waitForState({
                runtime,
                predicate: (current) =>
                  current.activeThread.conversationId === undefined &&
                  !current.activeThread.isStreaming,
                timeoutMessage: "A new chat could not be started.",
              });
              return contextResult({ state, features });
            }),
        }),
    },
    {
      name: "set_theme",
      description: "Change the visible chat theme to light or dark.",
      inputSchema: themeInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
      execute: (input) =>
        executeTool({
          schema: themeInput,
          input,
          handler: ({ theme }) =>
            Effect.gen(function* () {
              yield* runAction(() => runtime.actions.updateSettings({ patch: { theme } }));
              yield* waitForState({
                runtime,
                predicate: (current) => current.settings.theme === theme,
                timeoutMessage: "Theme change did not finish.",
              });
              return { theme };
            }),
        }),
    },
    {
      name: "fill_message_composer",
      description: "Fill the visible message composer without sending a message.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to place in the visible composer." },
        },
        required: ["text"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
      execute: (input) =>
        executeTool({
          schema: Schema.Struct({ text: Schema.String }),
          input,
          handler: ({ text }) =>
            Effect.gen(function* () {
              yield* runAction(() => runtime.actions.setDraft({ text }));
              yield* waitForState({
                runtime,
                predicate: (current) => current.composer.text === text,
                timeoutMessage: "The message composer could not be filled.",
              });
              return { text, sent: false };
            }),
        }),
    },
  ];

  if (features?.memories === false) return tools;

  tools.push({
    name: "search_memories",
    description:
      "Search the current user's individual memory entries after checking the merged memory summary.",
    inputSchema: searchInputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    execute: (input) =>
      executeTool({
        schema: searchInput,
        input,
        handler: ({ query }) => {
          const search = query.trim();
          return Effect.gen(function* () {
            yield* runAction(() => runtime.actions.setMemoryPanelOpen({ open: true }));
            yield* runAction(() => runtime.actions.setMemorySearch({ search }));
            const state = yield* waitForState({
              runtime,
              predicate: (current) =>
                current.memories.search === search &&
                (!current.memories.loading || current.error !== undefined),
              timeoutMessage: "Memory search did not finish.",
            });
            if (state.error !== undefined)
              return yield* Effect.fail(
                toolError({ code: "unavailable", message: "Memory search is unavailable." }),
              );
            return {
              query: search,
              summary: mapSummary(state.memories.summary),
              memories: state.memories.items.map(mapMemory),
            };
          });
        },
      }),
  });

  return tools;
};

const registerTools = Effect.fn("WebMcp.registerTools")(function* ({
  modelContext,
  runtime,
  features,
  signal,
}: {
  readonly modelContext: WebMcpModelContext;
  readonly runtime: WebMcpRuntime;
  readonly features: ChatRuntimeOptions["features"];
  readonly signal: AbortSignal;
}) {
  yield* Effect.forEach(
    createTools({ runtime, features }),
    (tool) =>
      Effect.tryPromise({
        try: () => modelContext.registerTool(tool, { signal }),
        catch: () => new WebMcpRegistrationError({ message: "WebMCP tool registration failed." }),
      }),
    { discard: true },
  );
});

const registrationOperations = fromCallback<WebMcpActorEvent, WebMcpActorInput>(
  ({ input, sendBack }) => {
    if (input.modelContext === undefined) {
      sendBack({ type: "registration-unsupported" });
      return () => undefined;
    }

    const controller = new AbortController();
    void Effect.runPromise(
      registerTools({
        modelContext: input.modelContext,
        runtime: input.runtime,
        features: input.features,
        signal: controller.signal,
      }).pipe(
        Effect.match({
          onFailure: () =>
            sendBack({ type: "registration-failed", error: "WebMCP is unavailable." }),
          onSuccess: () => sendBack({ type: "registration-completed" }),
        }),
      ),
    );
    return () => controller.abort();
  },
);

export const webMcpRegistrationActor = setup({
  types: {
    context: {} as WebMcpActorContext,
    input: {} as WebMcpActorInput,
    events: {} as WebMcpActorEvent,
  },
  actors: { operations: registrationOperations },
  actions: {
    recordReady: assign({ status: "ready", error: undefined }),
    recordUnsupported: assign({ status: "unsupported", error: undefined }),
    recordFailure: assign(({ event }) =>
      event.type === "registration-failed" ? { status: "failed", error: event.error } : {},
    ),
  },
}).createMachine({
  id: "webMcpRegistration",
  initial: "active",
  context: ({ input }) => ({
    ...input,
    status: "registering",
    error: undefined,
  }),
  states: {
    active: {
      invoke: {
        id: "operations",
        src: "operations",
        input: ({ context }) => ({
          modelContext: context.modelContext,
          runtime: context.runtime,
          features: context.features,
        }),
      },
      on: {
        "registration-completed": { actions: "recordReady" },
        "registration-unsupported": { target: "unsupported", actions: "recordUnsupported" },
        "registration-failed": { target: "failed", actions: "recordFailure" },
      },
    },
    unsupported: {},
    failed: {},
  },
});
