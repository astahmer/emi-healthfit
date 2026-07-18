import type { FileUIPart, UIMessage } from "ai";
import { assign, setup } from "xstate";

export interface ChatRuntimeContext {
  sessionId: string | undefined;
  messages: UIMessage[];
  drafts: Record<string, { text: string; files: FileUIPart[] }>;
  draft: string;
  files: FileUIPart[];
  error: Error | null;
  errorMessageId: string | undefined;
}

export type ChatRuntimeEvent =
  | { type: "history.changed"; sessionId: string | undefined; messages: UIMessage[] }
  | { type: "draft.changed"; value: string }
  | { type: "files.changed"; files: FileUIPart[] }
  | { type: "submit.started"; sessionId: string; message: UIMessage }
  | {
      type: "revision.started";
      sessionId: string;
      message: UIMessage;
      replaceMessageId: string;
    }
  | { type: "resume.started" }
  | { type: "stream.updated"; message: UIMessage }
  | { type: "stream.completed" }
  | { type: "stream.stopped" }
  | { type: "stream.failed"; error: Error; messageId?: string }
  | { type: "error.cleared" };

const sessionKey = (sessionId: string | undefined): string => sessionId ?? "new";

export const chatRuntimeMachine = setup({
  types: {
    context: {} as ChatRuntimeContext,
    events: {} as ChatRuntimeEvent,
    input: {} as { sessionId?: string; messages?: UIMessage[] },
  },
  actions: {
    changeHistory: assign(({ context, event }) => {
      if (event.type !== "history.changed") return {};
      const drafts = {
        ...context.drafts,
        [sessionKey(context.sessionId)]: { text: context.draft, files: context.files },
      };
      const nextDraft = drafts[sessionKey(event.sessionId)];
      const errorMessageId =
        context.error === null
          ? undefined
          : (context.errorMessageId ??
            event.messages.findLast((message) => message.role === "user")?.id);
      return {
        sessionId: event.sessionId,
        messages: event.messages,
        drafts,
        draft: nextDraft?.text ?? "",
        files: nextDraft?.files ?? [],
        error: context.error,
        errorMessageId,
      };
    }),
    changeDraft: assign(({ context, event }) => {
      if (event.type !== "draft.changed") return {};
      return {
        draft: event.value,
        drafts: {
          ...context.drafts,
          [sessionKey(context.sessionId)]: { text: event.value, files: context.files },
        },
      };
    }),
    changeFiles: assign(({ context, event }) => {
      if (event.type !== "files.changed") return {};
      return {
        files: event.files,
        drafts: {
          ...context.drafts,
          [sessionKey(context.sessionId)]: { text: context.draft, files: event.files },
        },
      };
    }),
    startSubmission: assign(({ context, event }) => {
      if (event.type !== "submit.started") return {};
      return {
        sessionId: event.sessionId,
        messages: [...context.messages, event.message],
        draft: "",
        files: [],
        drafts: {
          ...context.drafts,
          [sessionKey(event.sessionId)]: { text: "", files: [] },
        },
        error: null,
        errorMessageId: undefined,
      };
    }),
    startRevision: assign(({ context, event }) => {
      if (event.type !== "revision.started") return {};
      const replacedIndex = context.messages.findIndex(
        (message) => message.id === event.replaceMessageId,
      );
      return {
        sessionId: event.sessionId,
        messages:
          replacedIndex < 0
            ? [...context.messages, event.message]
            : [...context.messages.slice(0, replacedIndex), event.message],
        error: null,
        errorMessageId: undefined,
      };
    }),
    updateStream: assign(({ context, event }) => {
      if (event.type !== "stream.updated") return {};
      const lastMessage = context.messages.at(-1);
      if (lastMessage?.role === "assistant") {
        return { messages: [...context.messages.slice(0, -1), event.message] };
      }
      return { messages: [...context.messages, event.message] };
    }),
    failStream: assign(({ context, event }) => {
      if (event.type !== "stream.failed") return {};
      return {
        error: event.error,
        errorMessageId:
          event.messageId ?? context.messages.findLast((message) => message.role === "user")?.id,
      };
    }),
    clearError: assign({ error: () => null, errorMessageId: () => undefined }),
  },
}).createMachine({
  id: "chatRuntime",
  initial: "idle",
  context: ({ input }) => ({
    sessionId: input.sessionId,
    messages: input.messages ?? [],
    drafts: {},
    draft: "",
    files: [],
    error: null,
    errorMessageId: undefined,
  }),
  states: {
    idle: {
      on: {
        "history.changed": { actions: "changeHistory" },
        "draft.changed": { actions: "changeDraft" },
        "files.changed": { actions: "changeFiles" },
        "submit.started": { target: "streaming", actions: "startSubmission" },
        "revision.started": { target: "streaming", actions: "startRevision" },
        "resume.started": { target: "streaming", actions: "clearError" },
        "stream.failed": { target: "error", actions: "failStream" },
        "error.cleared": { actions: "clearError" },
      },
    },
    streaming: {
      on: {
        "stream.updated": { actions: "updateStream" },
        "stream.completed": { target: "idle" },
        "stream.stopped": { target: "idle" },
        "stream.failed": { target: "error", actions: "failStream" },
        "history.changed": { target: "idle", actions: "changeHistory" },
      },
    },
    error: {
      on: {
        "error.cleared": { target: "idle", actions: "clearError" },
        "history.changed": { target: "idle", actions: "changeHistory" },
        "draft.changed": { actions: "changeDraft" },
        "files.changed": { actions: "changeFiles" },
        "submit.started": { target: "streaming", actions: "startSubmission" },
        "revision.started": { target: "streaming", actions: "startRevision" },
        "resume.started": { target: "streaming", actions: "clearError" },
      },
    },
  },
});
