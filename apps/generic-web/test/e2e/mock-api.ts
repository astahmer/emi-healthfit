import type { Page, Route } from "@playwright/test";

type Conversation = {
  id: string;
  title: string | null;
  status: "regular" | "archived";
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  parts: string;
  model: string | null;
  createdAt: string;
};

type Thread = {
  id: string;
  conversationId: string;
  anchorMessageId: string;
  title: string | null;
  status: "regular" | "discarded" | "merged";
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

type Memory = {
  id: string;
  content: string;
  source: string | null;
  threadId: string | null;
  createdAt: string;
  rank: number;
};

type MemorySummary = {
  content: string;
  memoryCount: number;
  updatedAt: string;
};

const now = "2026-08-01T00:00:00.000Z";

const json = async ({
  route,
  body,
  status = 200,
}: {
  route: Route;
  body: unknown;
  status?: number;
}) =>
  route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });

const requestBody = (route: Route): Record<string, unknown> => {
  const body = route.request().postDataJSON();
  if (typeof body !== "object" || body === null || Array.isArray(body)) return {};
  return Object.fromEntries(Object.entries(body));
};

const streamBody = ({ messageId, text }: { messageId: string; text: string }): string =>
  [
    { type: "start", messageId },
    { type: "text-start", id: `${messageId}-text` },
    { type: "text-delta", id: `${messageId}-text`, delta: text },
    { type: "text-end", id: `${messageId}-text` },
    { type: "finish" },
  ]
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("") + "data: [DONE]\n\n";

const conversationResponse = ({
  conversation,
  messages,
}: {
  conversation: Conversation;
  messages: StoredMessage[];
}) => ({
  conversation,
  messages,
});

export const createGenericE2eApi = ({
  socialOk = true,
  suggestions = ["Tell me more", "Give me an example"],
}: {
  socialOk?: boolean;
  suggestions?: string[];
} = {}) => {
  const conversations: Conversation[] = [];
  const messages = new Map<string, StoredMessage[]>();
  const threads = new Map<string, Thread[]>();
  const memories: Memory[] = [];
  let memorySummary: MemorySummary | null = {
    content: "The user prefers concise worker answers.",
    memoryCount: 0,
    updatedAt: now,
  };
  let anonymousSessionCalls = 0;
  let socialAuthCalls = 0;
  let suggestionsCalls = 0;
  let chatCalls = 0;
  let compactCalls = 0;
  let nextThreadId = 1;
  let lastChatRequestBody: Record<string, unknown> | undefined;
  let lastSuggestionsRequestBody: Record<string, unknown> | undefined;
  let holdStream = false;
  let releaseStream: (() => void) | undefined;
  let streamPromise: Promise<void> | undefined;

  const createConversation = ({
    id,
    title = null,
  }: {
    id: string;
    title?: string | null;
  }): Conversation => ({
    id,
    title,
    status: "regular",
    pinned: false,
    createdAt: now,
    updatedAt: now,
  });

  const ensureConversation = (id: string): Conversation => {
    const existing = conversations.find((conversation) => conversation.id === id);
    if (existing !== undefined) return existing;
    const conversation = createConversation({ id });
    conversations.unshift(conversation);
    messages.set(id, []);
    threads.set(id, []);
    return conversation;
  };

  const handler = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname === "/api/health") {
      await json({ route, body: { name: "Core Chat" } });
      return;
    }

    if (pathname === "/api/auth/sign-in/anonymous") {
      if (request.method() !== "POST") {
        await json({ route, body: { error: "Method not allowed" }, status: 405 });
        return;
      }
      anonymousSessionCalls += 1;
      await route.fulfill({
        body: JSON.stringify({ user: { id: "guest-1", name: "Guest" } }),
        contentType: "application/json",
        headers: { "set-cookie": "better-auth.session_token=guest; Path=/" },
        status: 201,
      });
      return;
    }

    if (pathname === "/api/auth/sign-in/social") {
      if (request.method() !== "POST") {
        await json({ route, body: { error: "Method not allowed" }, status: 405 });
        return;
      }
      socialAuthCalls += 1;
      if (!socialOk) {
        await json({ route, body: { error: "Social sign-in unavailable" }, status: 400 });
        return;
      }
      await json({
        route,
        body: { redirect: true, url: `${url.origin}/oauth-callback` },
      });
      return;
    }

    if (pathname.startsWith("/api/") && anonymousSessionCalls === 0) {
      await json({ route, body: { error: "Authentication required" }, status: 401 });
      return;
    }

    if (pathname === "/api/conversations" && request.method() === "GET") {
      const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
      const result =
        search === ""
          ? conversations
          : conversations.filter((conversation) =>
              (conversation.title ?? "").toLowerCase().includes(search),
            );
      await json({ route, body: { conversations: result } });
      return;
    }

    const conversationMatch = pathname.match(/^\/api\/conversations\/([^/]+)$/);
    if (conversationMatch !== null) {
      const id = conversationMatch[1] ?? "";
      const conversation = ensureConversation(id);
      if (request.method() === "GET") {
        await json({
          route,
          body: conversationResponse({ conversation, messages: messages.get(id) ?? [] }),
        });
        return;
      }
      if (request.method() === "PATCH") {
        const body = requestBody(route);
        if (typeof body.title === "string") conversation.title = body.title;
        if (body.status === "regular" || body.status === "archived")
          conversation.status = body.status;
        if (typeof body.pinned === "boolean") conversation.pinned = body.pinned;
        await json({ route, body: { conversation } });
        return;
      }
      if (request.method() === "DELETE") {
        const index = conversations.findIndex((item) => item.id === id);
        if (index >= 0) conversations.splice(index, 1);
        messages.delete(id);
        threads.delete(id);
        await json({ route, body: { deleted: true } });
        return;
      }
    }

    const cloneMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/clone$/);
    if (cloneMatch !== null && request.method() === "POST") {
      const source = ensureConversation(cloneMatch[1] ?? "");
      const clone = createConversation({ id: `clone-${source.id}`, title: source.title });
      conversations.unshift(clone);
      messages.set(clone.id, [...(messages.get(source.id) ?? [])]);
      await json({ route, body: { conversation: clone }, status: 201 });
      return;
    }

    const compactMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/compact$/);
    if (compactMatch !== null && request.method() === "POST") {
      compactCalls += 1;
      const source = ensureConversation(compactMatch[1] ?? "");
      const conversation = createConversation({
        id: `compact-${source.id}`,
        title: `${source.title ?? "New chat"} (compacted)`,
      });
      conversations.unshift(conversation);
      messages.set(conversation.id, []);
      threads.set(conversation.id, []);
      await json({ route, body: { conversation }, status: 201 });
      return;
    }

    const threadsMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/threads(?:\/([^/]+))?$/);
    if (threadsMatch !== null) {
      const conversationId = threadsMatch[1] ?? "";
      const conversationThreads = threads.get(conversationId) ?? [];
      if (threadsMatch[2] === undefined) {
        if (request.method() === "GET") {
          await json({ route, body: { threads: conversationThreads } });
          return;
        }
        if (request.method() === "POST") {
          const body = requestBody(route);
          const thread = {
            id: `thread-${nextThreadId++}`,
            conversationId,
            anchorMessageId:
              typeof body.anchorMessageId === "string" ? body.anchorMessageId : "message-1",
            title: typeof body.title === "string" ? body.title : "Branch",
            status: "regular",
            pinned: false,
            createdAt: now,
            updatedAt: now,
          } satisfies Thread;
          conversationThreads.unshift(thread);
          threads.set(conversationId, conversationThreads);
          await json({
            route,
            body: { thread },
            status: 201,
          });
          return;
        }
      }
      const thread = conversationThreads.find((item) => item.id === threadsMatch[2]);
      if (thread === undefined) {
        await json({ route, body: { error: "Not found" }, status: 404 });
        return;
      }
      if (request.method() === "GET") {
        await json({
          route,
          body: { thread, messages: messages.get(conversationId) ?? [] },
        });
        return;
      }
      if (request.method() === "PATCH") {
        const body = requestBody(route);
        if (typeof body.title === "string") thread.title = body.title;
        if (typeof body.pinned === "boolean") thread.pinned = body.pinned;
        if (body.status === "regular" || body.status === "discarded") thread.status = body.status;
        await json({ route, body: { thread } });
        return;
      }
      if (request.method() === "DELETE") {
        thread.status = "discarded";
        await json({ route, body: { deleted: true } });
        return;
      }
      await json({ route, body: { error: "Not found" }, status: 404 });
      return;
    }

    if (pathname === "/api/memories/summary") {
      if (request.method() === "GET") {
        await json({ route, body: { summary: memorySummary } });
        return;
      }
      if (request.method() === "PATCH") {
        const body = requestBody(route);
        const content = typeof body.content === "string" ? body.content : "";
        memorySummary = { content, memoryCount: memories.length, updatedAt: now };
        await json({ route, body: { summary: memorySummary } });
        return;
      }
    }

    if (pathname === "/api/memories") {
      if (request.method() === "GET") {
        const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
        const result =
          search === ""
            ? memories
            : memories.filter((memory) => memory.content.toLowerCase().includes(search));
        await json({ route, body: { memories: result } });
        return;
      }
      if (request.method() === "POST") {
        const body = requestBody(route);
        const content = typeof body.content === "string" ? body.content : "";
        const memory = {
          id: `memory-${memories.length + 1}`,
          content,
          source: null,
          threadId: null,
          createdAt: now,
          rank: 0,
        } satisfies Memory;
        memories.unshift(memory);
        await json({ route, body: { id: memory.id }, status: 201 });
        return;
      }
    }

    if (pathname === "/api/suggestions" && request.method() === "POST") {
      suggestionsCalls += 1;
      lastSuggestionsRequestBody = requestBody(route);
      await json({ route, body: { suggestions } });
      return;
    }

    const memoryMatch = pathname.match(/^\/api\/memories\/([^/]+)$/);
    if (memoryMatch !== null && request.method() === "DELETE") {
      const index = memories.findIndex((memory) => memory.id === memoryMatch[1]);
      if (index >= 0) memories.splice(index, 1);
      await json({ route, body: { deleted: true } });
      return;
    }

    if (pathname === "/api/chat" && request.method() === "POST") {
      chatCalls += 1;
      const id = "conversation-1";
      const conversation = ensureConversation(id);
      const body = requestBody(route);
      lastChatRequestBody = body;
      const requestMessages = Array.isArray(body.messages) ? body.messages : [];
      const userMessage = requestMessages.at(-1);
      const userText =
        typeof userMessage === "object" && userMessage !== null && "parts" in userMessage
          ? JSON.stringify(userMessage.parts)
          : "";
      const assistantText = "Generic worker reply";
      const stored = messages.get(id) ?? [];
      stored.push(
        {
          id: `user-${chatCalls}`,
          role: "user",
          parts: userText,
          model: null,
          createdAt: now,
        },
        {
          id: `assistant-${chatCalls}`,
          role: "assistant",
          parts: JSON.stringify([{ type: "text", text: assistantText }]),
          model: "test-model",
          createdAt: now,
        },
      );
      messages.set(id, stored);
      if (holdStream) {
        streamPromise ??= new Promise<void>((resolve) => {
          releaseStream = resolve;
        });
        await streamPromise;
      }
      await route.fulfill({
        body: streamBody({ messageId: `assistant-${chatCalls}`, text: assistantText }),
        headers: {
          "content-type": "text/event-stream",
          "x-conversation-id": conversation.id,
          "x-vercel-ai-ui-message-stream": "v1",
        },
        status: 200,
      });
      return;
    }

    if (
      pathname.startsWith("/api/chat/") &&
      pathname.endsWith("/stream") &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        body: "data: [DONE]\n\n",
        headers: { "content-type": "text/event-stream" },
        status: 200,
      });
      return;
    }

    await json({ route, body: { error: "Not found" }, status: 404 });
  };

  return {
    anonymousSessionCalls: () => anonymousSessionCalls,
    lastSuggestionsBody: () => lastSuggestionsRequestBody,
    socialAuthCalls: () => socialAuthCalls,
    suggestionsCalls: () => suggestionsCalls,
    chatCalls: () => chatCalls,
    compactCalls: () => compactCalls,
    conversations,
    lastChatBody: () => lastChatRequestBody,
    holdStream: () => {
      holdStream = true;
    },
    install: async (page: Page) => page.route("**/api/**", handler),
    releaseStream: () => {
      holdStream = false;
      releaseStream?.();
      releaseStream = undefined;
      streamPromise = undefined;
    },
  };
};
