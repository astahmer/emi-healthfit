import { expect, test } from "@playwright/test";
import type { Memory } from "@emi/api-contract";
import * as Schema from "effect/Schema";
import {
  assistantStream,
  conversationPayload,
  conversations,
  fulfillApi,
  openMockedChat,
  setTestSettings,
} from "./mock/install.ts";

const NoteRequest = Schema.Struct({ content: Schema.String });
const MemoryRequest = Schema.Struct({
  content: Schema.String,
  source: Schema.optional(Schema.String),
  threadId: Schema.optional(Schema.String),
  messageId: Schema.optional(Schema.String),
});

test("requires an OpenAI API key before showing the chat composer", async ({ page }) => {
  await page.route("**/api/**", fulfillApi);
  await page.goto("/chat");

  await expect(page.getByText("Add your OpenAI API key")).toBeVisible();
  await expect(page.getByLabel("Message input")).toHaveCount(0);
  await page.getByLabel("OpenAI API key").fill("sk-test");
  await page.getByRole("button", { name: "Save key and start chatting" }).click();
  await expect(page.getByLabel("Message input")).toBeVisible();
});

test("switches sessions, renders tools, and starts a new chat", async ({ page }) => {
  await openMockedChat(page, "/chat/one");

  await expect(page.getByText("one message answer")).toBeVisible();
  await page.getByText("get recovery", { exact: true }).click();
  await expect(page.getByText("Ready")).toBeVisible();
  await page.getByText("Session Two", { exact: true }).click();
  await expect(page).toHaveURL(/\/chat\/two$/);
  await expect(page.getByText("two message answer")).toBeVisible();
  await page.getByLabel("New chat").click();
  await expect(page).toHaveURL(/\/chat\/?$/);
  await expect(page.getByText("What are we working on?")).toBeVisible();
});

test("sends the first message from a new empty conversation", async ({ page }) => {
  let submittedRequest: unknown;
  let releaseChatResponse: () => void = () => {};
  let signalChatRequestStarted: () => void = () => {};
  const chatResponseReady = new Promise<void>((resolve) => {
    releaseChatResponse = resolve;
  });
  const chatRequestStarted = new Promise<void>((resolve) => {
    signalChatRequestStarted = resolve;
  });
  const freshConversation = {
    id: "fresh",
    title: null,
    status: "regular",
    pinned: false,
    created_at: "2026-07-17T00:00:00.000Z",
    updated_at: "2026-07-17T00:00:00.000Z",
  };

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/conversations") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: freshConversation.id }),
      });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      submittedRequest = request.postDataJSON();
      signalChatRequestStarted();
      await chatResponseReady;
      await route.fulfill({
        status: 200,
        headers: {
          "cache-control": "no-cache, no-transform",
          "content-type": "text/event-stream",
          "x-thread-id": freshConversation.id,
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: assistantStream({ messageId: "fresh-assistant", text: "Fresh answer" }),
      });
      return;
    }
    if (url.pathname === `/api/conversations/${freshConversation.id}/messages`) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conversation: freshConversation,
          messages: [
            {
              id: "fresh-user",
              conversationId: freshConversation.id,
              parentId: null,
              role: "user",
              parts: [{ type: "text", text: "First message" }],
              createdAt: "2026-07-17T00:00:00.000Z",
            },
            {
              id: "fresh-assistant",
              conversationId: freshConversation.id,
              parentId: null,
              role: "assistant",
              parts: [{ type: "text", text: "Fresh answer" }],
              createdAt: "2026-07-17T00:00:01.000Z",
            },
          ],
          threads: [],
        }),
      });
      return;
    }
    await fulfillApi(route);
  });
  await page.goto("/chat");

  await page.getByLabel("Message input").fill("First message");
  const chatResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/chat") && response.request().method() === "POST",
  );
  await page.getByLabel("Send message").click();

  await chatRequestStarted;
  await expect(page).toHaveURL(/\/chat\/fresh$/);
  await expect(page.getByText("First message")).toBeVisible();
  await expect(page.getByLabel("Assistant is working")).toBeVisible();
  releaseChatResponse();

  expect((await chatResponse).ok()).toBe(true);
  await expect(page.getByText("Fresh answer")).toBeVisible();
  expect(submittedRequest).toEqual(
    expect.objectContaining({
      sessionId: freshConversation.id,
      messages: [
        expect.objectContaining({
          role: "user",
          parts: [{ type: "text", text: "First message" }],
        }),
      ],
    }),
  );
});

test("shows cached sidebar and messages when refresh loses the API", async ({ page }) => {
  await openMockedChat(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
  await expect(page.getByRole("link", { name: /Session One/ })).toBeVisible();
  await page.waitForTimeout(250);

  await page.unroute("**/api/**", fulfillApi);
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/auth/get-session") {
      await fulfillApi(route);
      return;
    }
    await route.abort("internetdisconnected");
  });
  await page.reload();

  await expect(page.getByText("one message answer")).toBeVisible();
  await expect(page.getByRole("link", { name: /Session One/ })).toBeVisible();
});

test("previews an attachment before sending", async ({ page }) => {
  await openMockedChat(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "progress.png",
    mimeType: "image/png",
    buffer: Buffer.from("image"),
  });

  await expect(page.getByText("progress.png")).toBeVisible();
  await expect(page.locator('img[src^="data:image/png"]')).toBeVisible();
});

test("sends the first message in an existing conversation with empty history", async ({ page }) => {
  const emptyConversation = {
    id: "empty",
    title: "Empty conversation",
    status: "regular",
    pinned: false,
    created_at: "2026-07-17T00:00:00.000Z",
    updated_at: "2026-07-17T00:00:00.000Z",
  };
  let submittedRequest: unknown;
  let generated = false;

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/conversations") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ conversations: [...conversations, emptyConversation] }),
      });
      return;
    }
    if (url.pathname === "/api/conversations/empty/messages") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conversation: emptyConversation,
          messages: generated
            ? [
                {
                  id: "empty-user",
                  conversationId: "empty",
                  parentId: null,
                  role: "user",
                  parts: [{ type: "text", text: "Start this chat" }],
                  createdAt: "2026-07-17T00:00:00.000Z",
                },
                {
                  id: "empty-assistant",
                  conversationId: "empty",
                  parentId: null,
                  role: "assistant",
                  parts: [{ type: "text", text: "Chat started" }],
                  createdAt: "2026-07-17T00:00:01.000Z",
                },
              ]
            : [],
          threads: [],
        }),
      });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      submittedRequest = request.postDataJSON();
      generated = true;
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-thread-id": "empty",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: assistantStream({ messageId: "empty-assistant", text: "Chat started" }),
      });
      return;
    }
    await fulfillApi(route);
  });
  await page.goto("/chat/empty");

  await expect(page.getByText("What are we working on?")).toBeVisible();
  await page.getByLabel("Message input").fill("Start this chat");
  await page.getByLabel("Send message").click();

  await expect(page.getByText("Chat started")).toBeVisible();
  expect(submittedRequest).toEqual(
    expect.objectContaining({
      sessionId: "empty",
      messages: [
        expect.objectContaining({
          role: "user",
          parts: [{ type: "text", text: "Start this chat" }],
        }),
      ],
    }),
  );
});

test("attaches retry to a timed-out user request", async ({ page }) => {
  let generationAttempts = 0;
  let revised = false;
  let retrySucceeded = false;

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      request.method() === "PATCH" &&
      url.pathname.startsWith("/api/conversations/one/messages/")
    ) {
      revised = true;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }
    if (url.pathname === "/api/conversations/one/messages" && retrySucceeded) {
      const payload = conversationPayload({ id: "one", text: "one message" });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...payload,
          messages: [
            ...payload.messages,
            {
              id: "retry-user",
              conversationId: "one",
              parentId: null,
              role: "user",
              parts: [{ type: "text", text: "Try this request" }],
              createdAt: "2026-07-17T00:00:02.000Z",
            },
            {
              id: "retry-assistant",
              conversationId: "one",
              parentId: null,
              role: "assistant",
              parts: [{ type: "text", text: "Retry succeeded" }],
              createdAt: "2026-07-17T00:00:03.000Z",
            },
          ],
        }),
      });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      generationAttempts += 1;
      if (generationAttempts === 1) {
        await route.fulfill({ status: 503, body: "Generation timed out" });
        return;
      }
      retrySucceeded = true;
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-thread-id": "one",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: assistantStream({ messageId: "retry-assistant", text: "Retry succeeded" }),
      });
      return;
    }
    await fulfillApi(route);
  });
  await page.goto("/chat/one");

  await expect(page.getByText("one message answer")).toBeVisible();
  await expect(page.getByLabel("Send message")).toBeVisible();
  await page.getByLabel("Message input").fill("Try this request");
  await page.getByLabel("Send message").click();
  await expect(page.getByText("Generation timed out")).toBeVisible();
  await page.getByRole("button", { name: "Retry this request" }).click();

  await expect(page.getByText("Retry succeeded")).toBeVisible();
  expect(generationAttempts).toBe(2);
  expect(revised).toBe(true);
});

test("accepts a new request after a persisted orphaned turn", async ({ page }) => {
  const orphanMessageId = "30dd4f3b-02af-4168-83cc-f70d395c715c";
  let submittedRequest: Record<string, unknown> | undefined;
  let generated = false;

  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/conversations/one/messages") {
      const payload = conversationPayload({ id: "one", text: "one message" });
      const messages = [
        ...payload.messages,
        {
          id: orphanMessageId,
          conversationId: "one",
          parentId: null,
          role: "user",
          parts: [{ type: "text", text: "Previous request" }],
          createdAt: "2026-07-17T00:00:02.000Z",
        },
        ...(generated
          ? [
              {
                id: "continued-user",
                conversationId: "one",
                parentId: null,
                role: "user" as const,
                parts: [{ type: "text", text: "Continue with a new request" }],
                createdAt: "2026-07-17T00:00:03.000Z",
              },
              {
                id: "continued-assistant",
                conversationId: "one",
                parentId: null,
                role: "assistant" as const,
                parts: [{ type: "text", text: "Continued response" }],
                createdAt: "2026-07-17T00:00:04.000Z",
              },
            ]
          : []),
      ];
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...payload, messages }),
      });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      submittedRequest = request.postDataJSON();
      generated = true;
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-thread-id": "one",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: assistantStream({ messageId: "continued-assistant", text: "Continued response" }),
      });
      return;
    }
    await fulfillApi(route);
  });
  await page.goto("/chat/one");

  await page.getByLabel("Message input").fill("Continue with a new request");
  await page.getByLabel("Send message").click();

  await expect(page.getByText("Continued response")).toBeVisible();
  expect(submittedRequest).toEqual(
    expect.objectContaining({
      messages: [
        expect.objectContaining({ parts: [{ type: "text", text: "Continue with a new request" }] }),
      ],
    }),
  );
  expect(submittedRequest).not.toHaveProperty("replaceMessageId");
});

test("navigates production-built data pages and renders empty states", async ({ page }) => {
  await openMockedChat(page, "/upload");

  await expect(page.getByRole("heading", { name: "Upload data" })).toBeVisible();
  await page.getByRole("link", { name: "Workouts" }).click();
  await expect(
    page.getByText("No workouts found. Upload a Hevy export to get started."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Trends" }).click();
  await expect(page.getByRole("heading", { name: "Health overview" })).toBeVisible();
  await page.getByRole("link", { name: "Notes" }).click();
  await expect(page.getByText("No notes yet.")).toBeVisible();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("resumes an unfinished generation after refresh", async ({ page }) => {
  let reconnectRequested = false;
  await setTestSettings(page);
  await page.route("**/api/**", fulfillApi);
  await page.route("**/api/conversations/one/messages", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(conversationPayload({ id: "one", text: "Resumed" })),
    }),
  );
  await page.route("**/api/chat/one/stream", async (route) => {
    reconnectRequested = true;
    await route.fulfill({
      status: 200,
      headers: {
        "cache-control": "no-cache, no-transform",
        "content-type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
      },
      body: assistantStream({ messageId: "resumed-assistant", text: "Resumed answer" }),
    });
  });

  await page.goto("/chat/one");

  await expect(page.getByText("Resumed answer")).toBeVisible();
  expect(reconnectRequested).toBe(true);
});

test("shows persisted completion after a stream ends without finish", async ({ page }) => {
  let providerFinished = false;
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/conversations/one/messages") {
      const payload = conversationPayload({ id: "one", text: "one message" });
      const messages = providerFinished
        ? [
            ...payload.messages,
            {
              id: "persisted-assistant",
              conversationId: "one",
              parentId: null,
              role: "assistant",
              parts: [{ type: "text", text: "Persisted completion" }],
              createdAt: "2026-07-17T00:00:03.000Z",
            },
          ]
        : payload.messages;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...payload, messages }),
      });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      providerFinished = true;
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-thread-id": "one",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: [
          'data: {"type":"start","messageId":"persisted-assistant"}',
          'data: {"type":"text-start","id":"persisted-text"}',
          'data: {"type":"text-delta","id":"persisted-text","delta":"Persisted completion"}',
          "",
        ].join("\n\n"),
      });
      return;
    }
    await fulfillApi(route);
  });
  await page.goto("/chat/one");

  await page.getByLabel("Message input").fill("Complete despite truncation");
  const truncatedResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/chat") && response.request().method() === "POST",
  );
  await page.getByLabel("Send message").click();
  await truncatedResponse;
  await page.reload();

  await expect(page.getByText("Persisted completion")).toBeVisible();
  await expect(page.getByText("Generation timed out")).not.toBeVisible();
});

test("creates, edits, searches, and deletes notes through the notes page", async ({ page }) => {
  const notes = [
    {
      id: "note-existing",
      content: "Keep one full rest day",
      created_at: "2026-07-18T10:00:00.000Z",
      updated_at: "2026-07-18T10:00:00.000Z",
    },
  ];
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/notes") {
      if (route.request().method() === "GET") {
        const search = url.searchParams.get("search")?.toLowerCase();
        const filtered =
          search === undefined
            ? notes
            : notes.filter((note) => note.content.toLowerCase().includes(search));
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ notes: filtered }),
        });
        return;
      }
      const body = Schema.decodeUnknownSync(NoteRequest)(route.request().postDataJSON());
      const note = {
        id: "note-created",
        content: body.content,
        created_at: "2026-07-19T10:00:00.000Z",
        updated_at: "2026-07-19T10:00:00.000Z",
      };
      notes.unshift(note);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: note.id }),
      });
      return;
    }
    const noteMatch = url.pathname.match(/^\/api\/notes\/([^/]+)$/);
    if (noteMatch !== null) {
      const note = notes.find((candidate) => candidate.id === noteMatch[1]);
      if (route.request().method() === "PATCH" && note !== undefined) {
        const body = Schema.decodeUnknownSync(NoteRequest)(route.request().postDataJSON());
        note.content = body.content;
        note.updated_at = "2026-07-19T10:05:00.000Z";
      }
      if (route.request().method() === "DELETE") {
        const index = notes.findIndex((candidate) => candidate.id === noteMatch[1]);
        if (index >= 0) notes.splice(index, 1);
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    await fulfillApi(route);
  });
  await page.goto("/notes");

  await expect(page.getByText("Keep one full rest day")).toBeVisible();
  await page.getByPlaceholder("Add a note…").fill("Track sleep before hard sessions");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Track sleep before hard sessions")).toBeVisible();
  const createdNote = page
    .getByRole("listitem")
    .filter({ hasText: "Track sleep before hard sessions" });
  await createdNote.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("listitem").getByRole("textbox").fill("Track sleep before long runs");
  await page.getByRole("listitem").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Track sleep before long runs")).toBeVisible();
  await page.getByPlaceholder("Search notes…").fill("rest");
  await expect(page.getByText("Keep one full rest day")).toBeVisible();
  await expect(page.getByText("Track sleep before long runs")).toHaveCount(0);
  await page.getByPlaceholder("Search notes…").fill("");
  const updatedNote = page
    .getByRole("listitem")
    .filter({ hasText: "Track sleep before long runs" });
  await updatedNote.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Track sleep before long runs")).toHaveCount(0);
});

test("creates, filters, and deletes manually saved memories", async ({ page }) => {
  const memories: Memory[] = [
    {
      id: "memory-existing",
      content: "Enjoys early training",
      source: "manual",
      thread_id: null,
      created_at: "2026-07-18T10:00:00.000Z",
    },
  ];
  await setTestSettings(page);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/memories") {
      if (route.request().method() === "GET") {
        const search = url.searchParams.get("search")?.toLowerCase();
        const filtered =
          search === undefined
            ? memories
            : memories.filter((memory) => memory.content.toLowerCase().includes(search));
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ memories: filtered }),
        });
        return;
      }
      const body = Schema.decodeUnknownSync(MemoryRequest)(route.request().postDataJSON());
      const memory = {
        id: "memory-created",
        content: body.content,
        source: body.source ?? null,
        thread_id: body.threadId ?? null,
        created_at: "2026-07-19T10:00:00.000Z",
      };
      memories.unshift(memory);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: memory.id }),
      });
      return;
    }
    const memoryMatch = url.pathname.match(/^\/api\/memories\/([^/]+)$/);
    if (memoryMatch !== null && route.request().method() === "DELETE") {
      const index = memories.findIndex((memory) => memory.id === memoryMatch[1]);
      if (index >= 0) memories.splice(index, 1);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    await fulfillApi(route);
  });
  await page.goto("/memory");

  await expect(page.getByText("Enjoys early training")).toBeVisible();
  await page.getByPlaceholder("Save a memory…").fill("Prefers Wednesday rest days");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Memory saved.")).toBeVisible();
  await page.getByPlaceholder("Search memories…").fill("Wednesday");
  await expect(page.getByText("Prefers Wednesday rest days")).toBeVisible();
  await expect(page.getByText("Enjoys early training")).toHaveCount(0);
  const createdMemory = page
    .getByRole("listitem")
    .filter({ hasText: "Prefers Wednesday rest days" });
  await createdMemory.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Memory removed.")).toBeVisible();
  await expect(page.getByText("Prefers Wednesday rest days")).toHaveCount(0);
});
