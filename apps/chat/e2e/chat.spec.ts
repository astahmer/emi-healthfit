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

const assistantStream = ({ messageId, text }: { messageId: string; text: string }) =>
  [
    `data: {"type":"start","messageId":"${messageId}"}`,
    `data: {"type":"text-start","id":"${messageId}-text"}`,
    `data: {"type":"text-delta","id":"${messageId}-text","delta":"${text}"}`,
    `data: {"type":"text-end","id":"${messageId}-text"}`,
    'data: {"type":"finish"}',
    "data: [DONE]",
    "",
  ].join("\n\n");

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
  if (url.pathname === "/api/analytics/overview") {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        activity: [],
        sleep: [],
        training: [],
        body: [],
        exercises: [],
        highlights: {
          averageSteps: null,
          averageSleepMinutes: null,
          workouts: 0,
          trainingVolumeKg: 0,
          weightChangeKg: null,
        },
      }),
    });
    return;
  }
  if (url.pathname === "/api/workouts") {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ workouts: [] }),
    });
    return;
  }
  if (url.pathname === "/api/memories") {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ memories: [] }),
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

test("surfaces a failed generation and retries the last turn", async ({ page }) => {
  let generationAttempts = 0;
  let revised = false;
  let retrySucceeded = false;

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
        await route.fulfill({ status: 503, body: "Provider unavailable" });
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
  await expect(page.getByText("Provider unavailable")).toBeVisible();
  await page.getByRole("button", { name: "Retry last turn" }).click();

  await expect(page.getByText("Retry succeeded")).toBeVisible();
  expect(generationAttempts).toBe(2);
  expect(revised).toBe(true);
});

test("retries the persisted orphan turn instead of the blocked new prompt", async ({ page }) => {
  const orphanMessageId = "30dd4f3b-02af-4168-83cc-f70d395c715c";
  let retried = false;
  let revisedMessageId: string | undefined;
  let retryRequest: Record<string, unknown> | undefined;

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
      ];
      if (retried) {
        messages.push({
          id: "recovered-assistant",
          conversationId: "one",
          parentId: null,
          role: "assistant",
          parts: [{ type: "text", text: "Recovered response" }],
          createdAt: "2026-07-17T00:00:03.000Z",
        });
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...payload, messages }),
      });
      return;
    }
    if (
      request.method() === "PATCH" &&
      url.pathname.startsWith("/api/conversations/one/messages/")
    ) {
      revisedMessageId = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    if (request.method() === "POST" && url.pathname === "/api/chat") {
      const body = request.postDataJSON();
      if (retryRequest === undefined) {
        retryRequest = body;
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Previous user turn has no assistant response.",
            code: "ORPHAN_USER_TURN",
            orphanMessageId,
            actions: ["retry", "discard", "send-as-new-turn"],
          }),
        });
        return;
      }
      retryRequest = body;
      retried = true;
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-thread-id": "one",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: assistantStream({ messageId: "recovered-assistant", text: "Recovered response" }),
      });
      return;
    }
    await fulfillApi(route);
  });
  await page.goto("/chat/one");

  await page.getByLabel("Message input").fill("Blocked new prompt");
  await page.getByLabel("Send message").click();
  await expect(page.getByText("Your previous request did not receive a response.")).toBeVisible();
  await expect(page.getByText("ORPHAN_USER_TURN")).not.toBeVisible();
  await page.getByRole("button", { name: "Retry previous request" }).click();

  await expect(page.getByText("Recovered response")).toBeVisible();
  expect(revisedMessageId).toBe(orphanMessageId);
  expect(retryRequest?.replaceMessageId).toBe(orphanMessageId);
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
  await page.getByLabel("Send message").click();
  await page.reload();

  await expect(page.getByText("Persisted completion")).toBeVisible();
  await expect(page.getByText("Generation timed out")).not.toBeVisible();
});
