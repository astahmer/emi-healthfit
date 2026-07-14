import { expect, test, type Page, type Route } from "@playwright/test";

const conversations = [
  {
    id: "one",
    title: "Session One",
    status: "regular",
    created_at: "2026-07-14T10:00:00.000Z",
    updated_at: "2026-07-14T12:00:00.000Z",
  },
  {
    id: "two",
    title: "Session Two",
    status: "regular",
    created_at: "2026-07-14T09:00:00.000Z",
    updated_at: "2026-07-14T11:00:00.000Z",
  },
];

const conversationPayload = ({ id, text }: { id: string; text: string }) => ({
  conversation: conversations.find((conversation) => conversation.id === id),
  messages: [
    {
      id: `${id}-user`,
      role: "user",
      parts: [{ type: "text", text }],
      createdAt: "2026-07-14T10:00:00.000Z",
    },
    {
      id: `${id}-assistant`,
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
  await expect(page.getByText("Ready")).toBeVisible();
  await page.getByText("Session Two", { exact: true }).click();
  await expect(page).toHaveURL(/\/chat\/two$/);
  await expect(page.getByText("two message answer")).toBeVisible();
  await page.getByLabel("New chat").click();
  await expect(page).toHaveURL(/\/chat\/?$/);
  await expect(page.getByText("What are we working on?")).toBeVisible();
});

test("shows cached sidebar and messages when refresh loses the API", async ({ page }) => {
  await openMockedChat(page, "/chat/one");
  await expect(page.getByText("one message answer")).toBeVisible();
  await expect(page.getByRole("link", { name: /Session One/ })).toBeVisible();
  await page.waitForTimeout(250);

  await page.unroute("**/api/**", fulfillApi);
  await page.route("**/api/**", (route) => route.abort("internetdisconnected"));
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
  await page.route("**/api/**", fulfillApi);
  await page.route("**/api/chat/one/stream", (route) =>
    route.fulfill({
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
    }),
  );

  await page.goto("/chat/one");

  await expect(page.getByText("Resumed answer")).toBeVisible();
});
