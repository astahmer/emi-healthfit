import { expect, test, type Page, type Route } from "@playwright/test";

const conversations = [
  {
    id: "one",
    title: "Session One",
    status: "regular",
    pinned: false,
    created_at: "2026-07-14T10:00:00.000Z",
    updated_at: "2026-07-14T12:00:00.000Z",
  },
  {
    id: "two",
    title: "Session Two",
    status: "regular",
    pinned: false,
    created_at: "2026-07-14T09:00:00.000Z",
    updated_at: "2026-07-14T11:00:00.000Z",
  },
];

const conversationPayload = ({ id, text }: { id: string; text: string }) => ({
  conversation: conversations.find((conversation) => conversation.id === id),
  messages: [
    {
      id: `${id}-user`,
      conversationId: id,
      parentId: null,
      role: "user",
      parts: [{ type: "text", text }],
      createdAt: "2026-07-14T10:00:00.000Z",
    },
    {
      id: `${id}-assistant`,
      conversationId: id,
      parentId: null,
      role: "assistant",
      parts: [
        { type: "text", text: `${text} answer` },
        {
          type: "dynamic-tool",
          toolName: "get_recovery",
          state: "output-available",
          output: { label: "Ready", explanation: "Recovered well" },
        },
      ],
      model: "gpt-5",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      createdAt: "2026-07-14T10:01:00.000Z",
    },
  ],
  threads: [],
});

const fulfillApi = async (route: Route) => {
  const url = new URL(route.request().url());
  if (url.pathname === "/api/auth/get-session") {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session: {
          id: "test-session",
          token: "test-token",
          userId: "test-user",
          expiresAt: "2026-07-18T00:00:00.000Z",
          createdAt: "2026-07-17T00:00:00.000Z",
          updatedAt: "2026-07-17T00:00:00.000Z",
        },
        user: {
          id: "test-user",
          name: "Guest",
          email: "8c75583b-0b8d-4bda-97e4-6cd7286f1378@anonymous.emi.invalid",
          emailVerified: false,
          createdAt: "2026-07-17T00:00:00.000Z",
          updatedAt: "2026-07-17T00:00:00.000Z",
        },
      }),
    });
    return;
  }
  const messageMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (messageMatch !== null) {
    const id = decodeURIComponent(messageMatch[1]);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(conversationPayload({ id, text: `${id} message` })),
    });
    return;
  }
  if (url.pathname === "/api/conversations") {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ conversations }),
    });
    return;
  }
  if (url.pathname.endsWith("/stream")) {
    await route.fulfill({ status: 204, body: "" });
    return;
  }
  if (url.pathname === "/api/notes") {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ notes: [] }) });
    return;
  }
  if (url.pathname === "/api/suggestions") {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ suggestions: [] }),
    });
    return;
  }
  await route.fulfill({ contentType: "application/json", body: "{}" });
};

const openMockedChat = async (page: Page, path = "/chat") => {
  await page.route("**/api/**", fulfillApi);
  await page.goto(path);
};

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
  const freshConversation = {
    id: "fresh",
    title: null,
    status: "regular",
    pinned: false,
    created_at: "2026-07-17T00:00:00.000Z",
    updated_at: "2026-07-17T00:00:00.000Z",
  };

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
      await route.fulfill({
        status: 200,
        headers: {
          "cache-control": "no-cache, no-transform",
          "content-type": "text/event-stream",
          "x-thread-id": freshConversation.id,
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: [
          'data: {"type":"start","messageId":"fresh-assistant"}',
          'data: {"type":"text-start","id":"fresh-text"}',
          'data: {"type":"text-delta","id":"fresh-text","delta":"Fresh answer"}',
          'data: {"type":"text-end","id":"fresh-text"}',
          'data: {"type":"finish"}',
          "data: [DONE]",
          "",
        ].join("\n\n"),
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

  expect((await chatResponse).ok()).toBe(true);
  await expect(page).toHaveURL(/\/chat\/fresh$/);
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

test("resumes an unfinished generation after refresh", async ({ page }) => {
  let reconnectRequested = false;
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
      body: [
        'data: {"type":"start","messageId":"resumed-assistant"}',
        'data: {"type":"text-start","id":"resumed-text"}',
        'data: {"type":"text-delta","id":"resumed-text","delta":"Resumed answer"}',
        'data: {"type":"text-end","id":"resumed-text"}',
        'data: {"type":"finish"}',
        "data: [DONE]",
        "",
      ].join("\n\n"),
    });
  });

  await page.goto("/chat/one");

  await expect(page.getByText("Resumed answer")).toBeVisible();
  expect(reconnectRequested).toBe(true);
});
