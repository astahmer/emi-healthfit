import type { FileUIPart, UIMessage } from "ai";
import { assign, setup } from "xstate";
import { shouldApplyHistoryWhileStreaming } from "./stream-operation";

export type QueuedFollowUp = {
  id: string;
  text: string;
  files: FileUIPart[];
};

export interface ChatRuntimeContext {
  sessionId: string | undefined;
  messages: UIMessage[];
  drafts: Record<string, { text: string; files: FileUIPart[] }>;
  draft: string;
  files: FileUIPart[];
  queuedFollowUps: QueuedFollowUp[];
  error: Error | null;
  errorMessageId: string | undefined;
}

export type ChatRuntimeEvent =
  | { type: "history.changed"; sessionId: string | undefined; messages: UIMessage[] }
  | { type: "draft.changed"; value: string }
  | { type: "files.changed"; files: FileUIPart[] }
  | { type: "followUp.queued"; id: string; text: string; files: FileUIPart[] }
  | { type: "followUp.updated"; id: string; text: string; files: FileUIPart[] }
  | { type: "followUp.removed"; id: string }
  | { type: "followUp.cleared" }
  | { type: "followUp.replaced"; items: QueuedFollowUp[] }
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

const clearComposer = ({
  context,
  sessionId,
}: {
  context: ChatRuntimeContext;
  sessionId: string | undefined;
}) => ({
  draft: "",
  files: [] as FileUIPart[],
  drafts: {
    ...context.drafts,
    [sessionKey(sessionId)]: { text: "", files: [] as FileUIPart[] },
  },
});

export const chatRuntimeMachine = setup({
  types: {
    context: {} as ChatRuntimeContext,
    events: {} as ChatRuntimeEvent,
    input: {} as { sessionId?: string; messages?: UIMessage[] },
  },
  guards: {
    isDifferentSessionHistory: ({ context, event }) =>
      event.type === "history.changed" &&
      shouldApplyHistoryWhileStreaming({
        contextSessionId: context.sessionId,
        eventSessionId: event.sessionId,
      }),
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
        queuedFollowUps: event.sessionId === context.sessionId ? context.queuedFollowUps : [],
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
    queueFollowUp: assign(({ context, event }) => {
      if (event.type !== "followUp.queued") return {};
      return {
        queuedFollowUps: [
          ...context.queuedFollowUps,
          { id: event.id, text: event.text, files: event.files },
        ],
        ...clearComposer({ context, sessionId: context.sessionId }),
      };
    }),
    updateFollowUp: assign(({ context, event }) => {
      if (event.type !== "followUp.updated") return {};
      return {
        queuedFollowUps: context.queuedFollowUps.map((item) =>
          item.id === event.id ? { id: event.id, text: event.text, files: event.files } : item,
        ),
        ...clearComposer({ context, sessionId: context.sessionId }),
      };
    }),
    removeFollowUp: assign(({ context, event }) => {
      if (event.type !== "followUp.removed") return {};
      return {
        queuedFollowUps: context.queuedFollowUps.filter((item) => item.id !== event.id),
      };
    }),
    clearFollowUps: assign({ queuedFollowUps: () => [] }),
    replaceFollowUps: assign(({ event }) => {
      if (event.type !== "followUp.replaced") return {};
      return { queuedFollowUps: event.items };
    }),
    startSubmission: assign(({ context, event }) => {
      if (event.type !== "submit.started") return {};
      return {
        sessionId: event.sessionId,
        messages: [...context.messages, event.message],
        ...clearComposer({ context, sessionId: event.sessionId }),
        error: null,
        errorMessageId: undefined,
      };
    }),
    supersedeInFlightSubmission: assign(({ context, event }) => {
      if (event.type !== "submit.started") return {};
      const baseMessages =
        context.messages.at(-1)?.role === "assistant"
          ? context.messages.slice(0, -1)
          : context.messages;
      return {
        sessionId: event.sessionId,
        messages: [...baseMessages, event.message],
        ...clearComposer({ context, sessionId: event.sessionId }),
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
        queuedFollowUps: [],
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
    queuedFollowUps: [],
    error: null,
    errorMessageId: undefined,
  }),
  states: {
    idle: {
      on: {
        "history.changed": { actions: "changeHistory" },
        "draft.changed": { actions: "changeDraft" },
        "files.changed": { actions: "changeFiles" },
        "followUp.removed": { actions: "removeFollowUp" },
        "followUp.updated": { actions: "updateFollowUp" },
        "followUp.cleared": { actions: "clearFollowUps" },
        "followUp.replaced": { actions: "replaceFollowUps" },
        "submit.started": { target: "streaming", actions: "startSubmission" },
        "revision.started": { target: "streaming", actions: "startRevision" },
        "resume.started": { target: "streaming", actions: "clearError" },
        "stream.failed": { target: "error", actions: "failStream" },
        "error.cleared": { actions: "clearError" },
      },
    },
    streaming: {
      on: {
        "draft.changed": { actions: "changeDraft" },
        "files.changed": { actions: "changeFiles" },
        "followUp.queued": { actions: "queueFollowUp" },
        "followUp.updated": { actions: "updateFollowUp" },
        "followUp.removed": { actions: "removeFollowUp" },
        "followUp.cleared": { actions: "clearFollowUps" },
        "followUp.replaced": { actions: "replaceFollowUps" },
        "submit.started": { actions: "supersedeInFlightSubmission" },
        "revision.started": { actions: "startRevision" },
        "stream.updated": { actions: "updateStream" },
        "stream.completed": { target: "idle" },
        "stream.stopped": { target: "idle" },
        "stream.failed": { target: "error", actions: "failStream" },
        "history.changed": [
          {
            guard: "isDifferentSessionHistory",
            target: "idle",
            actions: "changeHistory",
          },
        ],
      },
    },
    error: {
      on: {
        "error.cleared": { target: "idle", actions: "clearError" },
        "history.changed": { target: "idle", actions: "changeHistory" },
        "draft.changed": { actions: "changeDraft" },
        "files.changed": { actions: "changeFiles" },
        "followUp.removed": { actions: "removeFollowUp" },
        "followUp.updated": { actions: "updateFollowUp" },
        "followUp.cleared": { actions: "clearFollowUps" },
        "followUp.replaced": { actions: "replaceFollowUps" },
        "submit.started": { target: "streaming", actions: "supersedeInFlightSubmission" },
        "revision.started": { target: "streaming", actions: "startRevision" },
        "resume.started": { target: "streaming", actions: "clearError" },
      },
    },
  },
});
