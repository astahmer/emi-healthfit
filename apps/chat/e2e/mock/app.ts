import { Hono } from "hono";
import type { Context } from "hono";
import {
  assistantStream,
  authSessionBody,
  conversationPayload,
  conversations,
  emptyAnalyticsOverview,
} from "./fixtures.ts";

export type MockApiState = {
  suggestions: string[];
  chatStream: ({ messageId, text }: { messageId: string; text: string }) => string;
  notes: Array<{
    id: string;
    content: string;
    createdAt: string;
    updatedAt: string;
  }>;
  memories: Array<{
    id: string;
    content: string;
    source: string | null;
    threadId: string | null;
    messageId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
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
    notes: state?.notes ?? [],
    memories: state?.memories ?? [],
  };

  const app = new Hono();

  app.get("/api/auth/get-session", (context) => json(context, authSessionBody));
  app.post("/api/auth/sign-in/anonymous", (context) => json(context, {}));

  app.get("/api/conversations", (context) => json(context, { conversations }));

  app.patch("/api/threads/:id", (context) => json(context, { success: true }));

  app.get("/api/conversations/:id/messages", (context) => {
    const id = context.req.param("id");
    return json(context, conversationPayload({ id, text: `${id} message` }));
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
  app.post("/api/memories", async (context) => {
    const body = await context.req.json<{
      content: string;
      source?: string;
      threadId?: string;
      messageId?: string;
    }>();
    const memory = {
      id: `memory-${mockState.memories.length + 1}`,
      content: body.content,
      source: body.source ?? null,
      threadId: body.threadId ?? null,
      messageId: body.messageId ?? null,
      createdAt: "2026-07-17T00:00:00.000Z",
      updatedAt: "2026-07-17T00:00:00.000Z",
    };
    mockState.memories = [...mockState.memories, memory];
    return json(context, { memory }, 201);
  });
  app.delete("/api/memories/:id", (context) => {
    const id = context.req.param("id");
    mockState.memories = mockState.memories.filter((memory) => memory.id !== id);
    return context.body(null, 204);
  });

  app.all("/api/*", (context) => json(context, {}));

  return { app, state: mockState };
};

export const defaultMockApi = createMockApi();
