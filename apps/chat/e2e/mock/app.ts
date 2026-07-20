import { Hono } from "hono";
import type { Context } from "hono";
import {
  assistantStream,
  authSessionBody,
  conversationPayload,
  conversations as defaultConversations,
  emptyAnalyticsOverview,
} from "./fixtures.ts";

export type MockConversation = (typeof defaultConversations)[number];

export type MockMessage = {
  id: string;
  conversationId: string;
  parentId: string | null;
  role: string;
  parts: unknown[];
  createdAt: string;
  model?: string;
  usage?: unknown;
};

export type MockThread = {
  id: string;
  conversation_id: string;
  anchor_message_id: string;
  title: string | null;
  status: "regular" | "discarded" | "merged";
  pinned: boolean;
  message_ids: string[];
  created_at: string;
  updated_at: string;
};

export type MockSnapshot = {
  conversation?: MockConversation | null;
  messages: MockMessage[];
  threads: MockThread[];
};

export type MockMemory = {
  id: string;
  content: string;
  source: string | null;
  thread_id: string | null;
  created_at: string;
};

export type MockChatBody = {
  temporary?: boolean;
  webSearch?: boolean;
  sessionId?: string;
  replaceMessageId?: string;
  config?: { model?: string };
  messages?: Array<{
    parts?: Array<{ type?: string; text?: string; filename?: string; mediaType?: string }>;
  }>;
};

type ChatStreamFactory = ({ messageId, text }: { messageId: string; text: string }) => string;

export type MockApiState = {
  suggestions: string[];
  conversations: MockConversation[];
  snapshots: Record<string, MockSnapshot>;
  notes: Array<{
    id: string;
    content: string;
    createdAt: string;
    updatedAt: string;
  }>;
  memories: MockMemory[];
  authSession: typeof authSessionBody | null;
  anonymousOk: boolean;
  chat: {
    calls: number;
    lastBody: MockChatBody | undefined;
    stream: ChatStreamFactory;
    streamBody: string | null;
    replyText: string;
    persist: boolean;
    persistAssistantParts: unknown[] | null;
    failStatus: number | null;
    gate: Promise<void> | null;
  };
  compact: {
    failStatus: number | null;
    conversation: MockConversation | null;
    snapshot: MockSnapshot | null;
  };
  fork: {
    failStatus: number | null;
    thread: MockThread | null;
  };
  createConversationId: string | null;
};

const json = (context: Context, body: unknown, status = 200) =>
  context.json(body, status as 200);

const sse = (context: Context, { body, threadId }: { body: string; threadId: string }) =>
  context.newResponse(body, {
    status: 200,
    headers: {
      "cache-control": "no-cache, no-transform",
      "content-type": "text/event-stream",
      "x-thread-id": threadId,
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });

const now = "2026-07-20T00:00:00.000Z";

const ensureSnapshot = (state: MockApiState, id: string): MockSnapshot => {
  const existing = state.snapshots[id];
  if (existing !== undefined) return existing;
  const known = state.conversations.find((conversation) => conversation.id === id);
  const payload = conversationPayload({ id, text: `${id} message` });
  const snapshot: MockSnapshot = {
    conversation:
      known ??
      (payload.conversation as MockConversation | undefined) ??
      ({
        id,
        title: null,
        status: "regular",
        pinned: false,
        created_at: now,
        updated_at: now,
      } satisfies MockConversation),
    messages: payload.messages as MockMessage[],
    threads: (payload.threads ?? []) as MockThread[],
  };
  state.snapshots[id] = snapshot;
  return snapshot;
};

const userTextFromBody = (body: MockChatBody | undefined): string =>
  body?.messages?.[0]?.parts?.find((part) => part.type === "text")?.text ?? "";

const persistChatTurn = ({
  state,
  conversationId,
  body,
  assistantId,
  assistantText,
  assistantParts,
}: {
  state: MockApiState;
  conversationId: string;
  body: MockChatBody | undefined;
  assistantId: string;
  assistantText: string;
  assistantParts?: unknown[];
}) => {
  const snapshot = ensureSnapshot(state, conversationId);
  const userParts = body?.messages?.[0]?.parts ?? [{ type: "text", text: userTextFromBody(body) }];
  const userId = body?.replaceMessageId ?? `${conversationId}-user-${state.chat.calls}`;
  const replaceIndex =
    body?.replaceMessageId === undefined
      ? -1
      : snapshot.messages.findIndex((message) => message.id === body.replaceMessageId);
  const retained =
    replaceIndex >= 0 ? snapshot.messages.slice(0, replaceIndex) : snapshot.messages;
  snapshot.messages = [
    ...retained,
    {
      id: userId,
      conversationId,
      parentId: null,
      role: "user",
      parts: userParts,
      createdAt: now,
    },
    {
      id: assistantId,
      conversationId,
      parentId: null,
      role: "assistant",
      parts: assistantParts ?? [{ type: "text", text: assistantText }],
      createdAt: now,
    },
  ];
};

const registerRoutes = (app: Hono, state: MockApiState) => {
  app.get("/api/auth/get-session", (context) => {
    if (state.authSession === null) return json(context, null);
    return json(context, state.authSession);
  });
  app.post("/api/auth/sign-in/anonymous", (context) => {
    if (!state.anonymousOk) return json(context, {}, 500);
    state.authSession = authSessionBody;
    return json(context, {});
  });
  app.post("/api/auth/sign-in/social", (context) =>
    json(context, { error: "Social sign-in is not available in tests." }, 400),
  );

  app.get("/api/conversations", (context) => {
    const search = context.req.query("search")?.trim().toLowerCase();
    const list =
      search === undefined || search === ""
        ? state.conversations
        : state.conversations.filter((conversation) =>
            (conversation.title ?? "").toLowerCase().includes(search),
          );
    return json(context, { conversations: list });
  });

  app.post("/api/conversations", (context) => {
    const id = state.createConversationId ?? `fresh-${state.conversations.length + 1}`;
    if (state.snapshots[id] === undefined) {
      state.snapshots[id] = {
        conversation: {
          id,
          title: null,
          status: "regular",
          pinned: false,
          created_at: now,
          updated_at: now,
        },
        messages: [],
        threads: [],
      };
    }
    return json(context, { id }, 201);
  });

  app.patch("/api/conversations/:id/title", async (context) => {
    const id = context.req.param("id");
    const body = await context.req.json<{ title: string }>();
    state.conversations = state.conversations.map((conversation) =>
      conversation.id === id ? { ...conversation, title: body.title } : conversation,
    );
    const snapshot = state.snapshots[id];
    if (snapshot?.conversation !== undefined && snapshot.conversation !== null) {
      snapshot.conversation = { ...snapshot.conversation, title: body.title };
    }
    return json(context, { success: true });
  });

  app.patch("/api/conversations/:id", async (context) => {
    const id = context.req.param("id");
    const body = await context.req.json<{ pinned?: boolean; status?: "regular" | "archived" }>();
    state.conversations = state.conversations.map((conversation) => {
      if (conversation.id !== id) return conversation;
      return {
        ...conversation,
        pinned: body.pinned ?? conversation.pinned,
        status: body.status ?? conversation.status,
      };
    });
    const conversation = state.conversations.find((entry) => entry.id === id);
    return json(context, { conversation });
  });

  app.post("/api/conversations/:id/clone", (context) => {
    const id = context.req.param("id");
    const source = state.conversations.find((conversation) => conversation.id === id);
    const cloned: MockConversation = {
      id: `cloned-${id}`,
      title: `${source?.title ?? "chat"} (copy)`,
      status: "regular",
      pinned: false,
      created_at: now,
      updated_at: now,
    };
    state.conversations = [...state.conversations, cloned];
    return json(context, { conversation: cloned }, 201);
  });

  app.delete("/api/conversations/:id", (context) => {
    const id = context.req.param("id");
    state.conversations = state.conversations.filter((conversation) => conversation.id !== id);
    delete state.snapshots[id];
    return json(context, { success: true });
  });

  app.post("/api/conversations/:id/compact", (context) => {
    if (state.compact.failStatus !== null) {
      return json(context, { message: "Compact failed" }, state.compact.failStatus as 500);
    }
    const compacted = state.compact.conversation ?? {
      id: "compacted",
      title: "Session One (compacted)",
      status: "regular" as const,
      pinned: false,
      created_at: now,
      updated_at: now,
    };
    state.conversations = [...state.conversations, compacted];
    state.snapshots[compacted.id] = state.compact.snapshot ?? {
      conversation: compacted,
      messages: [
        {
          id: "summary-1",
          conversationId: compacted.id,
          parentId: null,
          role: "summary",
          parts: [
            {
              type: "text",
              text: "Use this compacted summary of the previous conversation as context:\nPrior workout notes.",
            },
          ],
          createdAt: now,
        },
      ],
      threads: [],
    };
    return json(context, { conversation: compacted }, 201);
  });

  app.post("/api/conversations/:id/threads", (context) => {
    if (state.fork.failStatus !== null) {
      return json(context, { message: "Fork failed" }, state.fork.failStatus as 500);
    }
    const id = context.req.param("id");
    const thread = state.fork.thread ?? {
      id: "branch-1",
      conversation_id: id,
      anchor_message_id: `${id}-assistant`,
      title: "Branch",
      status: "regular" as const,
      pinned: false,
      message_ids: [`${id}-user`, `${id}-assistant`],
      created_at: now,
      updated_at: now,
    };
    const snapshot = ensureSnapshot(state, id);
    snapshot.threads = [...snapshot.threads, thread];
    return json(context, thread, 201);
  });

  app.patch("/api/threads/:id", async (context) => {
    const threadId = context.req.param("id");
    const body = await context.req.json<{
      title?: string;
      pinned?: boolean;
      status?: "regular" | "discarded";
    }>();
    for (const snapshot of Object.values(state.snapshots)) {
      snapshot.threads = snapshot.threads.map((thread) =>
        thread.id === threadId ? { ...thread, ...body } : thread,
      );
    }
    return json(context, { success: true });
  });

  app.get("/api/conversations/:id/messages", (context) => {
    const id = context.req.param("id");
    const snapshot = ensureSnapshot(state, id);
    const conversation =
      state.conversations.find((entry) => entry.id === id) ?? snapshot.conversation;
    return json(context, {
      conversation,
      messages: snapshot.messages,
      threads: snapshot.threads,
    });
  });

  app.get("/api/conversations/:id/diagnostics", (context) => {
    const id = context.req.param("id");
    return json(context, {
      schemaVersion: 1,
      conversationId: id,
      redacted: true,
      messages: [],
      generations: [],
      events: [],
    });
  });

  app.all("/api/conversations/:id/stream", (context) => context.body(null, 204));

  app.patch("/api/conversations/:id/messages/:messageId", (context) =>
    json(context, { ok: true }),
  );

  app.post("/api/chat", async (context) => {
    state.chat.calls += 1;
    state.chat.lastBody = (await context.req.json().catch(() => undefined)) as MockChatBody | undefined;
    if (state.chat.failStatus !== null) {
      const status = state.chat.failStatus;
      state.chat.failStatus = null;
      return json(context, { message: "Upstream failed" }, status as 500);
    }
    if (state.chat.gate !== null) await state.chat.gate;

    const sessionId =
      state.chat.lastBody?.sessionId ??
      context.req.header("x-thread-id") ??
      "chat";
    const messageId = `${sessionId}-assistant-${state.chat.calls}`;
    const text = state.chat.replyText;
    const body =
      state.chat.streamBody ??
      state.chat.stream({
        messageId,
        text,
      });

    if (state.chat.persist) {
      persistChatTurn({
        state,
        conversationId: sessionId,
        body: state.chat.lastBody,
        assistantId: messageId,
        assistantText: text,
        assistantParts: state.chat.persistAssistantParts ?? undefined,
      });
    }

    return sse(context, { body, threadId: sessionId });
  });

  app.get("/api/notes", (context) => json(context, { notes: state.notes }));
  app.post("/api/notes", async (context) => {
    const body = await context.req.json<{ content: string }>();
    const note = {
      id: `note-${state.notes.length + 1}`,
      content: body.content,
      createdAt: now,
      updatedAt: now,
    };
    state.notes = [...state.notes, note];
    return json(context, { note }, 201);
  });
  app.patch("/api/notes/:id", async (context) => {
    const id = context.req.param("id");
    const body = await context.req.json<{ content: string }>();
    state.notes = state.notes.map((note) =>
      note.id === id ? { ...note, content: body.content, updatedAt: now } : note,
    );
    const note = state.notes.find((entry) => entry.id === id);
    return json(context, { note });
  });
  app.delete("/api/notes/:id", (context) => {
    const id = context.req.param("id");
    state.notes = state.notes.filter((note) => note.id !== id);
    return context.body(null, 204);
  });

  app.get("/api/suggestions", (context) => json(context, { suggestions: state.suggestions }));
  app.post("/api/suggestions", (context) => json(context, { suggestions: state.suggestions }));

  app.get("/api/analytics/overview", (context) => json(context, emptyAnalyticsOverview));
  app.get("/api/workouts", (context) => json(context, { workouts: [] }));

  app.get("/api/memories", (context) => json(context, { memories: state.memories }));
  app.post("/api/memories/extract", async (context) => {
    const body = await context.req.json<{
      text: string;
      threadId?: string;
      messageId?: string;
      source?: "auto" | "manual";
    }>();
    const id = `memory-${state.memories.length + 1}`;
    const sourceKind = body.source ?? "manual";
    state.memories = [
      ...state.memories,
      {
        id,
        content: body.text.slice(0, 120),
        source: body.messageId === undefined ? sourceKind : `${sourceKind}:${body.messageId}`,
        thread_id: body.threadId ?? null,
        created_at: now,
      },
    ];
    return json(context, { ids: [id], count: 1 });
  });
  app.post("/api/memories", async (context) => {
    const body = await context.req.json<{
      content: string;
      source?: string;
      threadId?: string;
      messageId?: string;
    }>();
    const id = `memory-${state.memories.length + 1}`;
    const memory: MockMemory = {
      id,
      content: body.content,
      source:
        body.messageId === undefined
          ? (body.source ?? null)
          : `${body.source ?? "manual"}:${body.messageId}`,
      thread_id: body.threadId ?? null,
      created_at: now,
    };
    state.memories = [...state.memories, memory];
    return json(context, { id }, 201);
  });
  app.delete("/api/memories/message/:messageId", (context) => {
    const messageId = context.req.param("messageId");
    state.memories = state.memories.filter((memory) => !memory.source?.endsWith(`:${messageId}`));
    return json(context, { success: true });
  });
  app.delete("/api/memories/:id", (context) => {
    const id = context.req.param("id");
    state.memories = state.memories.filter((memory) => memory.id !== id);
    return json(context, { success: true });
  });

  app.all("/api/*", (context) => json(context, {}));
};

export type MockApi = {
  app: Hono;
  state: MockApiState;
  holdChat: () => void;
  releaseChat: () => void;
  setSnapshot: (id: string, snapshot: MockSnapshot) => void;
};

export const createMockApi = ({
  state: partial,
  extend,
}: {
  state?: Partial<
    Omit<MockApiState, "chat" | "compact" | "fork"> & {
      chat?: Partial<MockApiState["chat"]>;
      compact?: Partial<MockApiState["compact"]>;
      fork?: Partial<MockApiState["fork"]>;
    }
  >;
  extend?: (app: Hono, state: MockApiState) => void;
} = {}): MockApi => {
  let releaseGate: (() => void) | null = null;
  const state: MockApiState = {
    suggestions: partial?.suggestions ?? [],
    conversations: partial?.conversations ?? [...defaultConversations],
    snapshots: partial?.snapshots ?? {},
    notes: partial?.notes ?? [],
    memories: partial?.memories ?? [],
    authSession: partial?.authSession === undefined ? authSessionBody : partial.authSession,
    anonymousOk: partial?.anonymousOk ?? true,
    createConversationId: partial?.createConversationId ?? null,
    chat: {
      calls: 0,
      lastBody: undefined,
      stream: partial?.chat?.stream ?? assistantStream,
      streamBody: partial?.chat?.streamBody ?? null,
      replyText: partial?.chat?.replyText ?? "Mock answer",
      persist: partial?.chat?.persist ?? false,
      persistAssistantParts: partial?.chat?.persistAssistantParts ?? null,
      failStatus: partial?.chat?.failStatus ?? null,
      gate: partial?.chat?.gate ?? null,
    },
    compact: {
      failStatus: partial?.compact?.failStatus ?? null,
      conversation: partial?.compact?.conversation ?? null,
      snapshot: partial?.compact?.snapshot ?? null,
    },
    fork: {
      failStatus: partial?.fork?.failStatus ?? null,
      thread: partial?.fork?.thread ?? null,
    },
  };

  const app = new Hono();
  extend?.(app, state);
  registerRoutes(app, state);

  const holdChat = () => {
    state.chat.gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
  };

  const releaseChat = () => {
    releaseGate?.();
    releaseGate = null;
    state.chat.gate = null;
  };

  const setSnapshot = (id: string, snapshot: MockSnapshot) => {
    state.snapshots[id] = snapshot;
  };

  return {
    app,
    state,
    holdChat,
    releaseChat,
    setSnapshot,
  };
};

export const defaultMockApi = createMockApi();

export const sessionOneSnapshot = ({
  text = "one message",
  threads = [],
  messages,
}: {
  text?: string;
  threads?: MockThread[];
  messages?: MockMessage[];
} = {}): MockSnapshot => {
  const payload = conversationPayload({ id: "one", text });
  return {
    conversation: payload.conversation as MockConversation,
    messages: (messages ?? payload.messages) as MockMessage[],
    threads,
  };
};
