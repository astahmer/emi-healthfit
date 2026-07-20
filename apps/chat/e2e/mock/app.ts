import { Hono } from "hono";
import type { Context } from "hono";
import {
  assistantStream,
  authSessionBody,
  conversationPayload,
  conversations,
  emptyAnalyticsOverview,
} from "./fixtures.ts";

export type MockMemory = {
  id: string;
  content: string;
  source: string | null;
  thread_id: string | null;
  created_at: string;
};

export type MockApiState = {
  suggestions: string[];
  chatStream: ({ messageId, text }: { messageId: string; text: string }) => string;
  conversations: typeof conversations;
  notes: Array<{
    id: string;
    content: string;
    createdAt: string;
    updatedAt: string;
  }>;
  memories: MockMemory[];
};

const json = (context: Context, body: unknown, status = 200) =>
  context.json(body, status as 200);

export const createMockApi = ({
  state,
}: {
  state?: Partial<MockApiState>;
} = {}) => {
  const mockState: MockApiState = {
    suggestions: state?.suggestions ?? [],
    chatStream: state?.chatStream ?? assistantStream,
    conversations: state?.conversations ?? [...conversations],
    notes: state?.notes ?? [],
    memories: state?.memories ?? [],
  };

  const app = new Hono();

  app.get("/api/auth/get-session", (context) => json(context, authSessionBody));
  app.post("/api/auth/sign-in/anonymous", (context) => json(context, {}));
  app.post("/api/auth/sign-in/social", (context) =>
    json(context, { error: "Social sign-in is not available in tests." }, 400),
  );

  app.get("/api/conversations", (context) => {
    const search = context.req.query("search")?.trim().toLowerCase();
    const list =
      search === undefined || search === ""
        ? mockState.conversations
        : mockState.conversations.filter((conversation) =>
            (conversation.title ?? "").toLowerCase().includes(search),
          );
    return json(context, { conversations: list });
  });

  app.post("/api/conversations", (context) =>
    json(context, { id: `fresh-${mockState.conversations.length + 1}` }, 201),
  );

  app.patch("/api/threads/:id", (context) => json(context, { success: true }));

  app.get("/api/conversations/:id/messages", (context) => {
    const id = context.req.param("id");
    const known = mockState.conversations.find((conversation) => conversation.id === id);
    const payload = conversationPayload({ id, text: `${id} message` });
    return json(context, {
      ...payload,
      conversation: known ?? payload.conversation ?? {
        id,
        title: null,
        status: "regular",
        pinned: false,
        created_at: "2026-07-14T10:00:00.000Z",
        updated_at: "2026-07-14T12:00:00.000Z",
      },
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

  app.post("/api/chat", (context) => {
    const threadId = context.req.header("x-thread-id") ?? "chat";
    const body = mockState.chatStream({
      messageId: `${threadId}-assistant`,
      text: "Mock answer",
    });
    return context.newResponse(body, {
      status: 200,
      headers: {
        "cache-control": "no-cache, no-transform",
        "content-type": "text/event-stream",
        "x-thread-id": threadId,
        "x-vercel-ai-ui-message-stream": "v1",
      },
    });
  });

  app.get("/api/notes", (context) => json(context, { notes: mockState.notes }));
  app.post("/api/notes", async (context) => {
    const body = await context.req.json<{ content: string }>();
    const note = {
      id: `note-${mockState.notes.length + 1}`,
      content: body.content,
      createdAt: "2026-07-17T00:00:00.000Z",
      updatedAt: "2026-07-17T00:00:00.000Z",
    };
    mockState.notes = [...mockState.notes, note];
    return json(context, { note }, 201);
  });
  app.patch("/api/notes/:id", async (context) => {
    const id = context.req.param("id");
    const body = await context.req.json<{ content: string }>();
    mockState.notes = mockState.notes.map((note) =>
      note.id === id
        ? { ...note, content: body.content, updatedAt: "2026-07-17T01:00:00.000Z" }
        : note,
    );
    const note = mockState.notes.find((entry) => entry.id === id);
    return json(context, { note });
  });
  app.delete("/api/notes/:id", (context) => {
    const id = context.req.param("id");
    mockState.notes = mockState.notes.filter((note) => note.id !== id);
    return context.body(null, 204);
  });

  app.get("/api/suggestions", (context) =>
    json(context, { suggestions: mockState.suggestions }),
  );
  app.post("/api/suggestions", (context) =>
    json(context, { suggestions: mockState.suggestions }),
  );

  app.get("/api/analytics/overview", (context) => json(context, emptyAnalyticsOverview));
  app.get("/api/workouts", (context) => json(context, { workouts: [] }));

  app.get("/api/memories", (context) => json(context, { memories: mockState.memories }));
  app.post("/api/memories/extract", async (context) => {
    const body = await context.req.json<{
      text: string;
      threadId?: string;
      messageId?: string;
      source?: "auto" | "manual";
    }>();
    const id = `memory-${mockState.memories.length + 1}`;
    const sourceKind = body.source ?? "manual";
    mockState.memories = [
      ...mockState.memories,
      {
        id,
        content: body.text.slice(0, 120),
        source:
          body.messageId === undefined ? sourceKind : `${sourceKind}:${body.messageId}`,
        thread_id: body.threadId ?? null,
        created_at: "2026-07-17T00:00:00.000Z",
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
    const id = `memory-${mockState.memories.length + 1}`;
    const memory: MockMemory = {
      id,
      content: body.content,
      source:
        body.messageId === undefined
          ? (body.source ?? null)
          : `${body.source ?? "manual"}:${body.messageId}`,
      thread_id: body.threadId ?? null,
      created_at: "2026-07-17T00:00:00.000Z",
    };
    mockState.memories = [...mockState.memories, memory];
    return json(context, { id }, 201);
  });
  app.delete("/api/memories/message/:messageId", (context) => {
    const messageId = context.req.param("messageId");
    mockState.memories = mockState.memories.filter(
      (memory) => !memory.source?.endsWith(`:${messageId}`),
    );
    return json(context, { success: true });
  });
  app.delete("/api/memories/:id", (context) => {
    const id = context.req.param("id");
    mockState.memories = mockState.memories.filter((memory) => memory.id !== id);
    return json(context, { success: true });
  });

  app.all("/api/*", (context) => json(context, {}));

  return { app, state: mockState };
};

export const defaultMockApi = createMockApi();
